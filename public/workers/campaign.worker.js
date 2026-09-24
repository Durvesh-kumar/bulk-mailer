// public/workers/campaign.worker.js

let isRunning = false;
let isPaused = false;
let isStopRequested = false;

let currentQueue = [];
let sendersList = [];
let targetLotSize = 10;
let rotationMode = "CONTINUOUS"; // 'CONTINUOUS', 'EVERY_N_SENDERS', 'EVERY_SINGLE_SENDER'
let pauseAfterNSenders = 1;
let machineId = "";
let sessionToken = "";
let adminKey = "";
let customSignoffName = "";
let accountAgeMode = "NEW";
let minDelayMsConfig = 3500;
let maxDelayMsConfig = 6500;

// Wave & Template Rotation Trackers
let currentWaveIndex = 0;
let lastWaveTemplate = "";
let lastWaveSubject = "";
let currentWaveSubject = "";
let currentWaveTemplate = "";
let subjectList = [];
let templateList = [];
let defaultTemplate = "";

// 📊 Campaign Stats Trackers (Directly mapped to CampignStatsGrid props & refs)
let globalProcessedCount = 0;
let globalSuccessCount = 0;
let globalFailedCount = 0;
let failedLeadsArray = [];

let diagnosticTelemetry = { code550: 0, code552: 0, code553: 0, code554: 0, code421: 0, other: 0 };
let senderHealthMap = {};

let senderSentCount = {};
let senderProcessedTimes = {};
let completedSendersCount = 0;
let currentSenderIndex = 0;
let sendersUsedRoundsCount = 0;

// Sender Cooldown Tracker (24 Hours)
let senderCooldownMap = {};
const COOLDOWN_HOURS = 24;

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

// ========================================================
// 🚀 MAIN CAMPAIGN EXECUTION LOOP
// ========================================================
async function runCampaignWorkflow() {
  const isRoundRobin = rotationMode === "CONTINUOUS" || rotationMode === "EVERY_N_SENDERS";
  advanceWaveRoundIfNeeded(false);

  while (isRunning && !isStopRequested && currentQueue.length > 0 && sendersList.length > 0) {
    if (isPaused) {
      await sleep(1000);
      continue;
    }

    // 🎯 जब पूरी टीम का 1 राउंड पूरा हो जाए
    if (isRoundRobin && currentSenderIndex >= sendersList.length) {
      currentSenderIndex = 0;
      sendersUsedRoundsCount++;
      advanceWaveRoundIfNeeded(true);
    }

    if (sendersList.length === 0 || currentQueue.length === 0) break;

    // EVERY_SINGLE_SENDER में वही सेंडर लगातार चलेगा
    if (!isRoundRobin) {
      currentSenderIndex = 0;
    }

    const activeSender = sendersList[currentSenderIndex];
    const rawSenderEmail = activeSender.email.toLowerCase().trim();
    const currentSent = senderSentCount[rawSenderEmail] || 0;

    // 🛑 प्री-सेंड चेक: टारगेट पूरा तो सेंडर बाहर
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
          message: `[Lot Finished] ${rawSenderEmail} completed ${targetLotSize} emails. Cooldown active.`,
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
        text: `[${rotationMode}] [Sender ${currentSenderIndex + 1}/${sendersList.length}: ${rawSenderEmail}] (${currentSent + 1}/${targetLotSize}) -> ${coldLead}`,
      },
    });

    let sendSuccess = false;
    let reportError = "";

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
        recordSenderMetric(rawSenderEmail, "BOUNCE");
        recordDiagnosticCode(data.report?.[0]?.bounceCode || 550);
        reportError = data.report?.[0]?.error || "Address not found (550/501/553)";
      } else {
        currentQueue.shift();
        const report = data.report?.[0] || {};
        sendSuccess = report.status === "SUCCESS";
        reportError = report.error || "Delivery Refused";

        if (sendSuccess) {
          recordSenderMetric(rawSenderEmail, "COLD_SENT");
        } else {
          recordSenderMetric(rawSenderEmail, "BOUNCE");
          recordDiagnosticCode(report.bounceCode || 0);
        }
      }

      // ग्लोबल काउंटर्स अपडेट
      globalProcessedCount++;
      if (sendSuccess) {
        globalSuccessCount++;
      } else {
        globalFailedCount++;
        failedLeadsArray.push({
          email: coldLead,
          reason: reportError,
          senderUsed: rawSenderEmail,
          time: new Date().toLocaleTimeString(),
        });
      }

      // 🔥 UI और CampignStatsGrid के लिए सभी जरूरी फील्ड्स का पेलोड
      self.postMessage({
        type: "BATCH_CHUNK_DONE",
        payload: {
          // CampignStatsGrid Direct Props & State Keys
          processedCount: globalProcessedCount,
          successCount: globalSuccessCount,
          processed: globalProcessedCount,
          delivered: globalSuccessCount,
          failed: globalFailedCount,
          failedLeadsList: failedLeadsArray,
          currentSenderIndex,
          sendersUsedRounds: sendersUsedRoundsCount,
          remainingAccountsInQueue: sendersList.length,

          // Compatibility Keys
          chunkProcessed: 1,
          chunkSuccess: sendSuccess ? 1 : 0,
          newlyFailed: !sendSuccess ? [{ email: coldLead, reason: reportError, senderUsed: rawSenderEmail, time: new Date().toLocaleTimeString() }] : [],
          remainingQueue: currentQueue,
          diagnosticStats: diagnosticTelemetry,
          senderMetrics: senderHealthMap,
          totalWarmupCount: 0,
          totalRescuedCount: 0,
        },
      });

      const updatedCount = currentSent + 1;
      senderSentCount[rawSenderEmail] = updatedCount;
      senderProcessedTimes[rawSenderEmail] = new Date().toISOString();

      let senderJustCompletedLot = false;

      // पोस्ट-सेंड कोटा चेक
      if (updatedCount >= targetLotSize) {
        senderJustCompletedLot = true;
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
            message: `[Lot Target Reached] ${rawSenderEmail} completed ${updatedCount}/${targetLotSize} emails. Cooldown active.`,
            cooldown: senderCooldownMap[rawSenderEmail],
          },
        });

        sendersList.splice(currentSenderIndex, 1);
        if (currentSenderIndex >= sendersList.length) currentSenderIndex = 0;
      } else {
        // सख्त 1-बाय-1: राउंड-रॉबिन में हर मेल के बाद इंडेक्स अनिवार्य रूप से आगे बढ़ेगा
        if (isRoundRobin) {
          currentSenderIndex = (currentSenderIndex + 1) % (sendersList.length || 1);
        }
      }

      // Option 3: EVERY_SINGLE_SENDER (लॉट पूरा होते ही पॉज़)
      if (rotationMode === "EVERY_SINGLE_SENDER" && senderJustCompletedLot) {
        isPaused = true;
        isRunning = false;
        self.postMessage({
          type: "PAUSE_REQUIRED",
          message: `⏸️ [Lot Finished] Sender [${rawSenderEmail}] completed full lot. Click Resume for next sender.`,
        });
        return;
      }

      // Option 2: EVERY_N_SENDERS (N सेंडर्स का लॉट पूरा होते ही पॉज़)
      if (rotationMode === "EVERY_N_SENDERS" && senderJustCompletedLot) {
        const targetN = Math.max(1, pauseAfterNSenders);
        if (completedSendersCount > 0 && completedSendersCount % targetN === 0) {
          isPaused = true;
          isRunning = false;
          self.postMessage({
            type: "PAUSE_REQUIRED",
            message: `⏸️ [Batch Finished] ${targetN} senders completed their lots. Click Resume to continue!`,
          });
          return;
        }
      }

    } catch (netErr) {
      globalProcessedCount++;
      globalFailedCount++;
      failedLeadsArray.push({
        email: coldLead,
        reason: "Network / Dispatch Error",
        senderUsed: rawSenderEmail,
        time: new Date().toLocaleTimeString(),
      });
      recordSenderMetric(rawSenderEmail, "BOUNCE");
      if (isRoundRobin) {
        currentSenderIndex = (currentSenderIndex + 1) % (sendersList.length || 1);
      }
    }

    self.postMessage({
      type: "TELEMETRY_UPDATE",
      payload: { 
        processedCount: globalProcessedCount,
        successCount: globalSuccessCount,
        processed: globalProcessedCount,
        delivered: globalSuccessCount,
        failed: globalFailedCount,
        failedLeadsList: failedLeadsArray,
        diagnosticStats: diagnosticTelemetry, 
        senderMetrics: senderHealthMap, 
        totalWarmupCount: 0, 
        totalRescuedCount: 0 
      },
    });

    await sleepRandomDelay(minDelayMsConfig, maxDelayMsConfig);
  }

  isRunning = false;
  self.postMessage({
    type: "QUEUE_FINISHED_OR_STOPPED",
    payload: {
      isQueueEmpty: currentQueue.length === 0,
      areSendersExhausted: sendersList.length === 0,
      processedCount: globalProcessedCount,
      successCount: globalSuccessCount,
      processed: globalProcessedCount,
      delivered: globalSuccessCount,
      failed: globalFailedCount,
      failedLeadsList: failedLeadsArray,
      senderProcessedTimes,
      diagnosticStats: diagnosticTelemetry,
      senderMetrics: senderHealthMap,
      totalWarmupCount: 0,
      totalRescuedCount: 0,
    },
  });
}

// ==========================================
// 📨 MESSAGE DISPATCHER
// ==========================================
self.onmessage = async (e) => {
  const { action, payload } = e.data;

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

  if (action === "START" || action === "RESUME") {
    isRunning = true;
    isPaused = false;
    isStopRequested = false;

    if (action === "START") {
      currentQueue = [...(payload.currentQueue || [])];
      sendersList = [...(payload.sendersList || [])];
      targetLotSize = payload.targetLotSize || 10;
      
      // UI rotationMode के साथ 100% सही मैपिंग
      rotationMode = payload.rotationMode || "CONTINUOUS";
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

      globalProcessedCount = 0;
      globalSuccessCount = 0;
      globalFailedCount = 0;
      failedLeadsArray = [];
      sendersUsedRoundsCount = 0;

      senderSentCount = {};
      senderProcessedTimes = {};
      currentSenderIndex = 0;
      completedSendersCount = 0;

      sendersList.forEach((s) => {
        senderSentCount[s.email.toLowerCase().trim()] = 0;
      });
    }

    await runCampaignWorkflow();
  }

  if (action === "STOP" || action === "PAUSE") {
    isStopRequested = true;
    isPaused = true;
    isRunning = false;
    self.postMessage({ type: "PAUSED", payload: { senderProcessedTimes } });
  }

  if (action === "RESET") {
    isStopRequested = true;
    isRunning = false;
    isPaused = false;

    currentQueue = [];
    sendersList = [];
    senderSentCount = {};
    senderProcessedTimes = {};
    senderCooldownMap = {};
    diagnosticTelemetry = { code550: 0, code552: 0, code553: 0, code554: 0, code421: 0, other: 0 };
    senderHealthMap = {};
    currentSenderIndex = 0;
    completedSendersCount = 0;
    sendersUsedRoundsCount = 0;
    globalProcessedCount = 0;
    globalSuccessCount = 0;
    globalFailedCount = 0;
    failedLeadsArray = [];

    self.postMessage({ type: "LOG", payload: { text: "Worker reset completed." } });
  }
};