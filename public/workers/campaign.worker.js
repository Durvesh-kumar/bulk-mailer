// public/workers/campaign.worker.js

let isRunning = false;
let isPaused = false;
let isStopRequested = false;

let currentQueue = [];
let sendersList = [];
let targetLotSize = 10;
let baseIntervalSec = 5;
let rotationMode = "ROUND_ROBIN"; // 'ROUND_ROBIN', 'EVERY_SINGLE_SENDER', 'CONTINUOUS'
let pauseAfterNSenders = 1;
let machineId = "";
let sessionToken = "";
let adminKey = "";
let customSignoffName = "";
let accountAgeMode = "NEW";
let minDelayMsConfig = 3500;
let maxDelayMsConfig = 6500;

// Wave and template rotation trackers
let currentWaveIndex = 0;
let lastWaveTemplate = "";
let lastWaveSubject = "";
let currentWaveSubject = "";
let currentWaveTemplate = "";
let subjectList = [];
let templateList = [];
let defaultTemplate = "";

// Telemetry and diagnostics
let diagnosticTelemetry = { code550: 0, code552: 0, code553: 0, code554: 0, code421: 0, other: 0 };
let senderHealthMap = {};
let totalWarmupCount = 0;
let totalRescuedCount = 0;
let pendingRescueJobs = [];

let senderSentCount = {};
let senderProcessedTimes = {};
let completedSendersCount = 0;
let currentSenderIndex = 0;

// Sender cooldown map (24h cooldown tracking)
let senderCooldownMap = {};
const COOLDOWN_HOURS = 24;

// Warm-up peer pool and strict 1-to-1 pair tracking
let unverifiedReceiversQueue = [];
let verifiedHealthyPeers = [];
let isAuditorRunning = false;
let dispatchedWarmupPairs = new Set(); // Key format: senderEmail:::receiverEmail
let receiverLastUsedMap = {};

let rescueIntervalId = null;

// Dynamic random warmup interval helper (picks 2, 3, or 4 without immediate repetition)
let lastWarmupInterval = 0;
function getRandomWarmupInterval() {
  const options = [2, 3, 4];
  const available = options.filter((opt) => opt !== lastWarmupInterval);
  const chosen = available[Math.floor(Math.random() * available.length)];
  lastWarmupInterval = chosen;
  return chosen;
}

let currentColdRoundsCount = 0;
let nextWarmupAtColdRounds = getRandomWarmupInterval();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sleepRandomDelay = (min = 3500, max = 6500) => {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
};

function recordSenderMetric(email, type) {
  const key = email.toLowerCase().trim();
  if (!senderHealthMap[key]) {
    senderHealthMap[key] = { email: key, coldSent: 0, warmupSent: 0, spamRescued: 0, bouncesHit: 0 };
  }
  if (type === "COLD_SENT") senderHealthMap[key].coldSent++;
  if (type === "WARMUP_SENT") senderHealthMap[key].warmupSent++;
  if (type === "SPAM_RESCUED") senderHealthMap[key].spamRescued++;
  if (type === "BOUNCE") senderHealthMap[key].bouncesHit++;
}

function recordDiagnosticCode(code) {
  const numCode = Number(code) || 0;
  if (numCode === 550) diagnosticTelemetry.code550++;
  else if (numCode === 552) diagnosticTelemetry.code552++;
  else if (numCode === 553 || numCode === 501) diagnosticTelemetry.code553++;
  else if (numCode === 554) diagnosticTelemetry.code554++;
  else if (numCode === 421) diagnosticTelemetry.code421++;
  else diagnosticTelemetry.other++;
}

// Background auditor pipeline verifying peers in small chunks
async function startAuditorPipeline(chunkSize = 3) {
  if (isAuditorRunning) return;
  isAuditorRunning = true;

  while (unverifiedReceiversQueue.length > 0 && isRunning && !isStopRequested) {
    const chunk = unverifiedReceiversQueue.splice(0, chunkSize);
    const results = await Promise.allSettled(
      chunk.map(async (peer) => {
        try {
          const res = await fetch("/api/warmup/verify-peer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: peer.email, appPassword: peer.appPassword }),
          });
          const data = await res.json().catch(() => ({}));
          return { peer, active: data.active === true || res.ok };
        } catch (_) {
          return { peer, active: false };
        }
      })
    );

    results.forEach((res) => {
      if (res.status === "fulfilled" && res.value.active) {
        const rawEmail = String(res.value.peer.email).toLowerCase().trim();
        if (!verifiedHealthyPeers.some((v) => String(v.email).toLowerCase().trim() === rawEmail)) {
          verifiedHealthyPeers.push(res.value.peer);
          if (!receiverLastUsedMap[rawEmail]) receiverLastUsedMap[rawEmail] = 0;
        }
      }
    });

    await sleep(600);
  }
  isAuditorRunning = false;
}

// Wave template and subject rotator
function advanceWaveRoundIfNeeded(isNewRoundStarting) {
  const cleanSubs = (subjectList || []).map((s) => s.trim()).filter((s) => s.length > 0);
  const cleanTemps = (Array.isArray(templateList) && templateList.length > 0 ? templateList : [defaultTemplate || ""])
    .map((t) => (t || "").trim())
    .filter((t) => t.length > 0);

  if (!currentWaveSubject || !currentWaveTemplate) {
    currentWaveSubject = cleanSubs.length > 0 ? cleanSubs[0] : "Quick check-in regarding partnership";
    currentWaveTemplate = cleanTemps.length > 0 ? cleanTemps[0] : (defaultTemplate || "Hi there, hope you are well.");
    lastWaveSubject = currentWaveSubject;
    lastWaveTemplate = currentWaveTemplate;
    return;
  }

  if (isNewRoundStarting) {
    currentWaveIndex++;
    if (cleanSubs.length > 1) {
      const availableSubs = cleanSubs.filter((s) => s !== lastWaveSubject);
      currentWaveSubject = availableSubs.length > 0 ? availableSubs[0] : cleanSubs[0];
      lastWaveSubject = currentWaveSubject;
    }
    if (cleanTemps.length > 1) {
      const availableTemps = cleanTemps.filter((t) => t !== lastWaveTemplate);
      currentWaveTemplate = availableTemps.length > 0 ? availableTemps[0] : cleanTemps[0];
      lastWaveTemplate = currentWaveTemplate;
    }
    self.postMessage({
      type: "LIVE_STATUS",
      payload: { text: `[Wave Round ${currentWaveIndex + 1}] Subject and template rotated.` },
    });
  }
}

// Schedules delayed handshake rescue between 60s and 120s
function scheduleDelayedRescue(senderEmail, receiverNode) {
  const minDelayMs = 60000;
  const maxDelayMs = 120000;
  const randomDelayMs = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
  pendingRescueJobs.push({ senderEmail, receiver: receiverNode, executeAt: Date.now() + randomDelayMs });
}

// Background rescue polling ticker
function startRescueWorkerTimer() {
  if (rescueIntervalId) clearInterval(rescueIntervalId);
  rescueIntervalId = setInterval(async () => {
    if (pendingRescueJobs.length === 0) return;
    const now = Date.now();
    const readyJobs = pendingRescueJobs.filter((job) => job.executeAt <= now);
    pendingRescueJobs = pendingRescueJobs.filter((job) => job.executeAt > now);

    for (const job of readyJobs) {
      try {
        const res = await fetch("/api/admin/rescue-worker", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey || "inboxsend_mesh_secret_2026",
          },
          body: JSON.stringify({
            receiver: {
              email: job.receiver.email,
              appPassword: job.receiver.appPassword,
              senderName: job.receiver.senderName || "",
            },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.success && (data.rescued > 0 || data.replied > 0)) {
          totalRescuedCount += (data.rescued || 1);
          recordSenderMetric(job.senderEmail, "SPAM_RESCUED");
          self.postMessage({
            type: "TELEMETRY_UPDATE",
            payload: { diagnosticStats: diagnosticTelemetry, senderMetrics: senderHealthMap, totalWarmupCount, totalRescuedCount },
          });
        }
      } catch (_) {}
    }
  }, 4000);
}

// Global warmup wave: Strictly 1-to-1 verified pair mapping with wait lock
async function executeGlobalWarmupWave() {
  self.postMessage({
    type: "LIVE_STATUS",
    payload: {
      text: `[Warmup Shield] Pausing cold queue. Initiating 1-to-1 warmup wave for ${sendersList.length} senders...`,
    },
  });

  for (let i = 0; i < sendersList.length; i++) {
    if (isStopRequested || !isRunning) return;

    const sender = sendersList[i];
    const rawSenderEmail = sender.email.toLowerCase().trim();

    let chosenReceiver = null;
    let waitCount = 0;

    // Strict lock: Wait until an unused verified receiver is ready
    while (isRunning && !isStopRequested) {
      const eligible = verifiedHealthyPeers.filter((r) => {
        const recvEmail = String(r.email).toLowerCase().trim();
        const pairKey = `${rawSenderEmail}:::${recvEmail}`;
        return rawSenderEmail !== recvEmail && !dispatchedWarmupPairs.has(pairKey);
      });

      if (eligible.length > 0) {
        eligible.sort((a, b) => {
          const tA = receiverLastUsedMap[String(a.email).toLowerCase().trim()] || 0;
          const tB = receiverLastUsedMap[String(b.email).toLowerCase().trim()] || 0;
          return tA - tB;
        });
        chosenReceiver = eligible[0];
        break;
      }

      waitCount += 3;
      if (waitCount % 15 === 0) {
        self.postMessage({
          type: "LIVE_STATUS",
          payload: { text: `[Warmup Lock] Waiting for verified receiver for ${rawSenderEmail} (${waitCount}s elapsed)...` },
        });
      }
      await sleep(3000);
    }

    if (isStopRequested || !isRunning) return;

    if (chosenReceiver) {
      const rawReceiverEmail = chosenReceiver.email.toLowerCase().trim();
      const pairKey = `${rawSenderEmail}:::${rawReceiverEmail}`;

      self.postMessage({
        type: "LIVE_STATUS",
        payload: { text: `[Warmup 1-on-1] [${rawSenderEmail}] -> [${rawReceiverEmail}] (${i + 1}/${sendersList.length})` },
      });

      try {
        const warmupRes = await fetch("/api/silent-warmup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-token": sessionToken,
          },
          body: JSON.stringify({
            machineId,
            sessionToken,
            senderEmail: rawSenderEmail,
            receiverEmail: rawReceiverEmail,
            senderName: sender.senderName || "",
            appPassword: sender.appPassword,
          }),
        });

        const wData = await warmupRes.json().catch(() => ({}));
        if (warmupRes.ok && (wData.success || wData.status === "SUCCESS")) {
          dispatchedWarmupPairs.add(pairKey);
          receiverLastUsedMap[rawReceiverEmail] = Date.now();
          totalWarmupCount++;
          recordSenderMetric(rawSenderEmail, "WARMUP_SENT");
          scheduleDelayedRescue(rawSenderEmail, chosenReceiver);
        }
      } catch (_) {}

      await sleepRandomDelay(3000, 5000);
    }
  }

  currentColdRoundsCount = 0;
  nextWarmupAtColdRounds = getRandomWarmupInterval();

  self.postMessage({
    type: "LIVE_STATUS",
    payload: {
      text: `[Warmup Wave Complete] Resuming cold outreach for next ${nextWarmupAtColdRounds} rounds.`,
    },
  });
}

// Main execution loop: Non-recursive while loop
async function runCampaignWorkflow() {
  startRescueWorkerTimer();

  const isRoundRobin = rotationMode === "ROUND_ROBIN";

  // Initial warmup wave only runs for ROUND_ROBIN mode
  if (isRoundRobin && currentColdRoundsCount === 0 && totalWarmupCount === 0) {
    await executeGlobalWarmupWave();
  }

  advanceWaveRoundIfNeeded(false);

  while (isRunning && !isStopRequested && currentQueue.length > 0 && sendersList.length > 0) {
    if (isPaused) {
      await sleep(1000);
      continue;
    }

    // Full round completion trigger in Round-Robin mode
    if (isRoundRobin && currentSenderIndex >= sendersList.length) {
      currentSenderIndex = 0;
      currentColdRoundsCount++;
      advanceWaveRoundIfNeeded(true);

      if (currentColdRoundsCount >= nextWarmupAtColdRounds) {
        self.postMessage({
          type: "LIVE_STATUS",
          payload: { text: `[Interleaved Wave] Reached ${currentColdRoundsCount} cold rounds. Triggering team warmup...` },
        });
        await executeGlobalWarmupWave();
      }
    }

    if (sendersList.length === 0 || currentQueue.length === 0) break;

    // In EVERY_SINGLE_SENDER mode, keep processing the first sender until lot target is reached
    if (!isRoundRobin) {
      currentSenderIndex = 0;
    }

    const activeSender = sendersList[currentSenderIndex];
    const rawSenderEmail = activeSender.email.toLowerCase().trim();
    const currentSent = senderSentCount[rawSenderEmail] || 0;

    // Hard ceiling lock: Evict sender immediately if target lot size reached
    if (currentSent >= targetLotSize) {
      completedSendersCount++;
      const exitTimestamp = Date.now();
      senderCooldownMap[rawSenderEmail] = {
        email: rawSenderEmail,
        exitedAt: exitTimestamp,
        cooldownUntil: exitTimestamp + COOLDOWN_HOURS * 60 * 60 * 1000,
        status: "COOLING_DOWN",
      };

      self.postMessage({
        type: "SENDER_LOT_COMPLETED",
        payload: {
          email: rawSenderEmail,
          message: `[Lot Target Reached] ${rawSenderEmail} completed ${targetLotSize} emails. Cooldown started.`,
          cooldown: senderCooldownMap[rawSenderEmail],
        },
      });

      sendersList.splice(currentSenderIndex, 1);
      if (currentSenderIndex >= sendersList.length) currentSenderIndex = 0;
      continue;
    }

    const coldLead = currentQueue[0];

    self.postMessage({
      type: "LIVE_STATUS",
      payload: {
        text: `[${rotationMode}] [${rawSenderEmail}] (${currentSent + 1}/${targetLotSize}) -> ${coldLead}`,
      },
    });

    try {
      const res = await fetch("/api/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderName: activeSender.senderName || "Colleague",
          senderEmail: rawSenderEmail,
          appPassword: activeSender.appPassword.replace(/\s+/g, ""),
          recipients: [coldLead],
          subject: currentWaveSubject,
          template: currentWaveTemplate.trim(),
          customSignoffName: customSignoffName.trim(),
          accountAgeMode,
          machineId,
          sessionToken,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (data.shouldSwapLeadImmediately) {
        currentQueue.shift();
        const errReason = data.report?.[0]?.error || "Address not found (550/501/553)";
        recordSenderMetric(rawSenderEmail, "BOUNCE");
        recordDiagnosticCode(data.report?.[0]?.bounceCode || 550);

        self.postMessage({
          type: "BATCH_CHUNK_DONE",
          payload: {
            chunkProcessed: 1,
            chunkSuccess: 0,
            newlyFailed: [{ email: coldLead, reason: errReason, senderUsed: rawSenderEmail, time: new Date().toLocaleTimeString() }],
            remainingQueue: currentQueue,
            diagnosticStats: diagnosticTelemetry,
            senderMetrics: senderHealthMap,
            totalWarmupCount,
            totalRescuedCount,
          },
        });
      } else {
        const report = data.report?.[0] || {};
        const isSuccess = report.status === "SUCCESS";
        currentQueue.shift();

        if (isSuccess) {
          recordSenderMetric(rawSenderEmail, "COLD_SENT");
        } else {
          recordSenderMetric(rawSenderEmail, "BOUNCE");
          recordDiagnosticCode(report.bounceCode || 0);
        }

        self.postMessage({
          type: "BATCH_CHUNK_DONE",
          payload: {
            chunkProcessed: 1,
            chunkSuccess: isSuccess ? 1 : 0,
            newlyFailed: !isSuccess ? [{ email: coldLead, reason: report.error || "Delivery Refused", senderUsed: rawSenderEmail, time: new Date().toLocaleTimeString() }] : [],
            remainingQueue: currentQueue,
            diagnosticStats: diagnosticTelemetry,
            senderMetrics: senderHealthMap,
            totalWarmupCount,
            totalRescuedCount,
          },
        });
      }

      const updatedCount = currentSent + 1;
      senderSentCount[rawSenderEmail] = updatedCount;
      senderProcessedTimes[rawSenderEmail] = new Date().toISOString();

      if (updatedCount >= targetLotSize) {
        completedSendersCount++;
        const exitTimestamp = Date.now();
        senderCooldownMap[rawSenderEmail] = {
          email: rawSenderEmail,
          exitedAt: exitTimestamp,
          cooldownUntil: exitTimestamp + COOLDOWN_HOURS * 60 * 60 * 1000,
          status: "COOLING_DOWN",
        };

        self.postMessage({
          type: "SENDER_LOT_COMPLETED",
          payload: {
            email: rawSenderEmail,
            message: `[Lot Target Reached] ${rawSenderEmail} completed ${updatedCount}/${targetLotSize} emails. Cooldown started.`,
            cooldown: senderCooldownMap[rawSenderEmail],
          },
        });

        sendersList.splice(currentSenderIndex, 1);
        if (currentSenderIndex >= sendersList.length) currentSenderIndex = 0;
      } else {
        if (isRoundRobin) {
          currentSenderIndex = (currentSenderIndex + 1) % (sendersList.length || 1);
        }
      }

    } catch (netErr) {
      recordSenderMetric(rawSenderEmail, "BOUNCE");
      if (isRoundRobin) {
        currentSenderIndex = (currentSenderIndex + 1) % (sendersList.length || 1);
      }
    }

    self.postMessage({
      type: "TELEMETRY_UPDATE",
      payload: { diagnosticStats: diagnosticTelemetry, senderMetrics: senderHealthMap, totalWarmupCount, totalRescuedCount },
    });

    await sleepRandomDelay(minDelayMsConfig, maxDelayMsConfig);
  }

  isRunning = false;
  self.postMessage({
    type: "QUEUE_FINISHED_OR_STOPPED",
    payload: {
      isQueueEmpty: currentQueue.length === 0,
      areSendersExhausted: sendersList.length === 0,
      senderProcessedTimes,
      diagnosticStats: diagnosticTelemetry,
      senderMetrics: senderHealthMap,
      totalWarmupCount,
      totalRescuedCount,
    },
  });
}

// Message Dispatcher
self.onmessage = async (e) => {
  const { action, payload } = e.data;

  // Dynamic queue appending
  if (action === "APPEND_LEADS") {
    if (Array.isArray(payload.newLeads) && payload.newLeads.length > 0) {
      currentQueue.push(...payload.newLeads);
      self.postMessage({
        type: "LIVE_STATUS",
        payload: { text: `[Queue Appended] +${payload.newLeads.length} leads added. Total in queue: ${currentQueue.length}` },
      });

      if (!isRunning && sendersList.length > 0) {
        isRunning = true;
        isStopRequested = false;
        isPaused = false;
        runCampaignWorkflow();
      }
    }
    return;
  }

  // Explicit manual tier swapping
  if (action === "SWAP_SENDERS") {
    const { newSendersList, newTargetLotSize } = payload;
    if (Array.isArray(newSendersList) && newSendersList.length > 0) {
      sendersList = [...newSendersList];
      currentSenderIndex = 0;
      if (newTargetLotSize) targetLotSize = newTargetLotSize;

      sendersList.forEach((s) => {
        senderSentCount[s.email.toLowerCase().trim()] = 0;
      });

      self.postMessage({
        type: "LIVE_STATUS",
        payload: {
          text: `[Tier Swapped] Loaded ${sendersList.length} new senders with target lot ${targetLotSize}.`,
        },
      });

      if (!isRunning && currentQueue.length > 0 && sendersList.length > 0) {
        isRunning = true;
        isPaused = false;
        isStopRequested = false;
        runCampaignWorkflow();
      }
    }
    return;
  }

  if (action === "START") {
    isRunning = true;
    isPaused = false;
    isStopRequested = false;

    currentQueue = [...(payload.currentQueue || [])];
    sendersList = [...(payload.sendersList || [])];
    targetLotSize = payload.targetLotSize || 10;
    rotationMode = payload.rotationMode || "ROUND_ROBIN";
    pauseAfterNSenders = payload.pauseAfterNSenders || 1;

    machineId = payload.machineId || "";
    sessionToken = payload.sessionToken || "";
    adminKey = payload.adminKey || "";
    customSignoffName = payload.customSignoffName || "";
    accountAgeMode = payload.mode || "NEW";

    minDelayMsConfig = payload.modeConfig?.minDelay || 3500;
    maxDelayMsConfig = payload.modeConfig?.maxDelay || 6500;

    subjectList = payload.subjectList || [];
    templateList = payload.templateList || [];
    defaultTemplate = payload.template || "";

    currentWaveIndex = 0;
    lastWaveSubject = "";
    lastWaveTemplate = "";
    currentWaveSubject = "";
    currentWaveTemplate = "";

    senderSentCount = {};
    senderProcessedTimes = {};
    currentSenderIndex = 0;
    completedSendersCount = 0;

    dispatchedWarmupPairs.clear();

    sendersList.forEach((s) => {
      senderSentCount[s.email.toLowerCase().trim()] = 0;
    });

    if (rotationMode === "ROUND_ROBIN") {
      if (payload.peerReceivers && Array.isArray(payload.peerReceivers)) {
        const incoming = payload.peerReceivers.filter(
          (p) => !verifiedHealthyPeers.some((v) => String(v.email).toLowerCase().trim() === String(p.email).toLowerCase().trim())
        );
        unverifiedReceiversQueue = [...incoming];
      }
      startAuditorPipeline(3);
    }

    await runCampaignWorkflow();
  }

  if (action === "STOP" || action === "PAUSE") {
    isStopRequested = true;
    isPaused = true;
    isRunning = false;
    if (rescueIntervalId) clearInterval(rescueIntervalId);
    self.postMessage({ type: "PAUSED", payload: { senderProcessedTimes } });
  }

  if (action === "RESET") {
    isStopRequested = true;
    isRunning = false;
    isPaused = false;
    if (rescueIntervalId) clearInterval(rescueIntervalId);

    currentQueue = [];
    sendersList = [];
    unverifiedReceiversQueue = [];
    verifiedHealthyPeers = [];
    dispatchedWarmupPairs.clear();
    receiverLastUsedMap = {};
    senderSentCount = {};
    senderProcessedTimes = {};
    senderCooldownMap = {};
    diagnosticTelemetry = { code550: 0, code552: 0, code553: 0, code554: 0, code421: 0, other: 0 };
    senderHealthMap = {};
    totalWarmupCount = 0;
    totalRescuedCount = 0;
    pendingRescueJobs = [];
    currentSenderIndex = 0;
    isAuditorRunning = false;

    self.postMessage({ type: "LOG", payload: { text: "Worker reset completed." } });
  }
};