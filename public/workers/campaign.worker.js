// public/workers/campaign.worker.js

let isRunning = false;
let isPaused = false;
let isStopRequested = false;

// चालू रनिंग स्टेट का ग्लोबल रेफरेंस (APPEND_LEADS के लिए)
let activeRunningParams = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sleepRandomDelay = (min = 3500, max = 6500) => {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// 🎯 वेव आधारित राउंड रोटेशन ट्रैकर्स
let currentWaveIndex = 0;
let lastWaveTemplate = "";
let lastWaveSubject = "";
let currentWaveSubject = "";
let currentWaveTemplate = "";

let senderSentCount = {};
let senderProcessedTimes = {};
let completedSendersCount = 0;
let senderSessionState = {};

// 📊 टेलीमेट्री व डायग्नोस्टिक्स (डैशबोर्ड से 100% मैप्ड)
let diagnosticTelemetry = {
  code550: 0,
  code552: 0,
  code553: 0,
  code554: 0,
  code421: 0,
  other: 0,
};
let senderHealthMap = {};
let totalWarmupCount = 0;
let totalRescuedCount = 0;

let pendingRescueJobs = [];
let senderUsedReceiversMap = {};
let verifiedHealthyPeers = [];
let isAuditorFinished = false;

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

function getSenderState(email) {
  const key = email.toLowerCase().trim();
  if (!senderSessionState[key]) {
    senderSessionState[key] = {
      firstDone: false,
      coldSentInRun: 0,
      nextColdTarget: Math.floor(Math.random() * 3) + 2,
    };
  }
  return senderSessionState[key];
}

function pickUniquePeerReceiver(senderEmail, peerPool) {
  const sKey = senderEmail.toLowerCase().trim();
  if (!senderUsedReceiversMap[sKey]) {
    senderUsedReceiversMap[sKey] = new Set();
  }

  const validPeers = peerPool.filter((p) => p.email.toLowerCase().trim() !== sKey);
  if (validPeers.length === 0) return peerPool[0];

  let uncontactedPeers = validPeers.filter((p) => !senderUsedReceiversMap[sKey].has(p.email.toLowerCase().trim()));
  if (uncontactedPeers.length === 0) {
    senderUsedReceiversMap[sKey].clear();
    uncontactedPeers = validPeers;
  }

  const chosenPeer = uncontactedPeers[Math.floor(Math.random() * uncontactedPeers.length)];
  senderUsedReceiversMap[sKey].add(chosenPeer.email.toLowerCase().trim());
  return chosenPeer;
}

// ⚡ बैकग्राउंड ऑडिटर
async function startBackgroundPeerAuditor(allRawPeers, chunkSize = 4) {
  if (isAuditorFinished || !allRawPeers || allRawPeers.length === 0) return;
  const queueToVerify = [...allRawPeers];

  while (queueToVerify.length > 0 && isRunning && !isStopRequested) {
    const chunk = queueToVerify.splice(0, chunkSize);
    const results = await Promise.allSettled(
      chunk.map(async (peer) => {
        try {
          const res = await fetch("/api/warmup/verify-peer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: peer.email, appPassword: peer.appPassword }),
          });
          const data = await res.json();
          return { peer, active: data.active === true };
        } catch (_) {
          return { peer, active: false };
        }
      })
    );

    results.forEach((res) => {
      if (res.status === "fulfilled" && res.value.active) {
        const pEmail = res.value.peer.email.toLowerCase().trim();
        if (!verifiedHealthyPeers.some((p) => p.email.toLowerCase().trim() === pEmail)) {
          verifiedHealthyPeers.push(res.value.peer);
        }
      }
    });

    await sleep(1000);
  }
  isAuditorFinished = true;
}

// 🎯 वेव रोटेशन अपडेटर
function advanceWaveRoundIfNeeded(isNewRoundStarting, subjectList, templateList, fallbackTemplate) {
  const cleanSubs = (subjectList || []).map((s) => s.trim()).filter((s) => s.length > 0);
  const cleanTemps = (Array.isArray(templateList) && templateList.length > 0 ? templateList : [fallbackTemplate || ""])
    .map((t) => (t || "").trim())
    .filter((t) => t.length > 0);

  if (!currentWaveSubject || !currentWaveTemplate) {
    currentWaveSubject = cleanSubs.length > 0 ? cleanSubs[0] : "Quick check-in regarding partnership";
    currentWaveTemplate = cleanTemps.length > 0 ? cleanTemps[0] : (fallbackTemplate || "Hi there, hope you are well.");
    lastWaveSubject = currentWaveSubject;
    lastWaveTemplate = currentWaveTemplate;
    return;
  }

  if (isNewRoundStarting) {
    currentWaveIndex++;

    if (cleanSubs.length > 1) {
      const availableSubs = cleanSubs.filter((s) => s !== lastWaveSubject);
      let nextSub = availableSubs[0];
      if (cleanSubs.length === 2) {
        nextSub = cleanSubs[0] === lastWaveSubject ? cleanSubs[1] : cleanSubs[0];
      } else {
        const pool = availableSubs.length > 0 ? availableSubs : cleanSubs;
        nextSub = pool[Math.floor(Math.random() * pool.length)];
      }
      currentWaveSubject = nextSub;
      lastWaveSubject = nextSub;
    }

    if (cleanTemps.length > 1) {
      const availableTemps = cleanTemps.filter((t) => t !== lastWaveTemplate);
      let nextTemp = availableTemps[0];
      if (cleanTemps.length === 2) {
        nextTemp = cleanTemps[0] === lastWaveTemplate ? cleanTemps[1] : cleanTemps[0];
      } else {
        const pool = availableTemps.length > 0 ? availableTemps : cleanTemps;
        nextTemp = pool[Math.floor(Math.random() * pool.length)];
      }
      currentWaveTemplate = nextTemp;
      lastWaveTemplate = nextTemp;
    }

    self.postMessage({
      type: "LIVE_STATUS",
      payload: {
        text: `🔄 [Wave Rotated to Round ${currentWaveIndex + 1}] Switched to Next Template & Subject.`,
      },
    });
  }
}

function scheduleDelayedRescue(senderEmail, receiverNode, adminKey) {
  const minDelayMs = 60000;
  const maxDelayMs = 240000;
  const randomDelayMs = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
  const executeAt = Date.now() + randomDelayMs;

  pendingRescueJobs.push({ senderEmail, receiver: receiverNode, adminKey, executeAt });
}

setInterval(async () => {
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
          "x-admin-key": job.adminKey || "inboxsend_mesh_secret_2026",
        },
        body: JSON.stringify({
          receiver: {
            email: job.receiver.email,
            appPassword: job.receiver.appPassword,
            senderName: job.receiver.senderName || "",
          },
        }),
      });
      const data = await res.json();
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
}, 8000);

// केवल इस्तेमाल हुए सेंडर्स का टाइम निकालने वाला हेल्पर
function getOnlyUsedSendersTimes() {
  const cleanTimes = {};
  for (const [email, count] of Object.entries(senderSentCount)) {
    if (count > 0 && senderProcessedTimes[email]) {
      cleanTimes[email] = senderProcessedTimes[email];
    }
  }
  return cleanTimes;
}

async function executeDispatch(params) {
  activeRunningParams = params;
  let {
    currentQueue,
    sendersList,
    peerReceivers,
    senderIdx,
    roundsDone,
    currentProcessed,
    currentSuccess,
    targetLotSize,
    mode,
    activeEmail,
    activePass,
    activeName,
    rotationMode,
    pauseAfterNSenders,
    subjectList,
    template,
    templateList,
    customSignoffName,
    machineId,
    sessionToken,
    adminKey,
    modeConfig,
  } = params;

  if (isStopRequested || currentQueue.length === 0 || sendersList.length === 0) {
    isRunning = false;
    self.postMessage({
      type: "QUEUE_FINISHED_OR_STOPPED",
      payload: {
        isQueueEmpty: currentQueue.length === 0,
        areSendersExhausted: sendersList.length === 0,
        finalProcessed: currentProcessed,
        finalSuccess: currentSuccess,
        senderProcessedTimes: getOnlyUsedSendersTimes(),
        targetLotSize,
        diagnosticStats: diagnosticTelemetry,
        senderMetrics: senderHealthMap,
        totalWarmupCount,
        totalRescuedCount,
      },
    });
    return;
  }

  advanceWaveRoundIfNeeded(false, subjectList, templateList, template);

  let latestSessionToken = sessionToken;
  const currentSenderCurrentSent = senderSentCount[activeEmail.toLowerCase()] || 0;
  const state = getSenderState(activeEmail);

  const isRoundRobinMode = rotationMode === "CONTINUOUS" || rotationMode === "EVERY_N_SENDERS";
  let shouldSendWarmup = false;
  let warmupType = "";

  if (isRoundRobinMode) {
    if (!state.firstDone) {
      shouldSendWarmup = true;
      warmupType = "ROUND_ROBIN_ENTRY";
    } else if (state.coldSentInRun >= state.nextColdTarget) {
      shouldSendWarmup = true;
      warmupType = "ROUND_ROBIN_INTERLEAVED";
    }
  }

  try {
    // 🛡️ 1. वार्म-अप शील्ड
    if (shouldSendWarmup) {
      const peerPool = verifiedHealthyPeers.length > 0 ? verifiedHealthyPeers : peerReceivers;
      const chosenPeer = pickUniquePeerReceiver(activeEmail, peerPool);

      if (chosenPeer) {
        self.postMessage({
          type: "LIVE_STATUS",
          payload: { text: `🛡️ [Warmup: ${warmupType}] [${activeEmail}] -> Handshake with [${chosenPeer.email}]...` },
        });

        try {
          const warmupRes = await fetch("/api/silent-warmup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-session-token": latestSessionToken,
            },
            body: JSON.stringify({
              machineId,
              senderEmail: activeEmail,
              receiverEmail: chosenPeer.email,
              senderName: activeName,
              appPassword: activePass,
              sessionToken: latestSessionToken,
            }),
          });

          const warmupData = await warmupRes.json();
          if (warmupData.accountErrorType === "AUTH_FAILED" || warmupRes.status === 401) {
            const remainingSenders = sendersList.filter((s) => s.email.toLowerCase() !== activeEmail.toLowerCase());
            if (remainingSenders.length === 0) {
              self.postMessage({ type: "FATAL_ERROR", message: "All sender accounts evicted due to bad credentials." });
              isRunning = false;
              return;
            }
            const nextSender = remainingSenders[0];
            return executeDispatch({
              ...params,
              sendersList: remainingSenders,
              senderIdx: 0,
              activeEmail: nextSender.email,
              activePass: nextSender.appPassword,
              activeName: nextSender.senderName || "Colleague",
            });
          }

          if (warmupData.sessionToken) latestSessionToken = warmupData.sessionToken;
          totalWarmupCount++;
          recordSenderMetric(activeEmail, "WARMUP_SENT");
          scheduleDelayedRescue(activeEmail, chosenPeer, adminKey);
        } catch (_) {}

        if (!state.firstDone) state.firstDone = true;
        state.coldSentInRun = 0;
        state.nextColdTarget = Math.floor(Math.random() * 3) + 2;

        await sleepRandomDelay(3000, 5000);
      }
    }

    if (isStopRequested || isPaused) return;

    // 🚀 2. कोल्ड लीड डिस्पैच
    const coldLead = currentQueue[0];
    const activeSubject = currentWaveSubject;
    const activeTemplate = currentWaveTemplate;
    const currentSentDisplay = currentSenderCurrentSent + 1;

    self.postMessage({
      type: "LIVE_STATUS",
      payload: {
        text: `🚀 [RR Wave ${currentWaveIndex + 1}] [${activeEmail}] (${currentSentDisplay}/${targetLotSize}) -> ${coldLead}`,
      },
    });

    const res = await fetch("/api/send-campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderName: activeName.trim(),
        senderEmail: activeEmail.trim().toLowerCase(),
        appPassword: activePass.replace(/\s+/g, ""),
        recipients: [coldLead],
        subject: activeSubject,
        template: activeTemplate.trim(),
        customSignoffName: customSignoffName.trim(),
        accountAgeMode: mode,
        machineId,
        sessionToken: latestSessionToken,
      }),
    });

    const data = await res.json();

    // 🎯 3. डायनामिक लीड स्वैप (550 / 553 / 501 / 552 / 554)
    if (data.shouldSwapLeadImmediately) {
      const updatedQueue = currentQueue.slice(1);
      const errReason = data.report?.[0]?.error || "Recipient address not found (550/501/553)";
      const bounceCode = data.report?.[0]?.bounceCode || 550;

      recordSenderMetric(activeEmail, "BOUNCE");
      recordDiagnosticCode(bounceCode);

      const newlyFailed = [{
        email: coldLead,
        reason: errReason,
        senderUsed: activeEmail,
        time: new Date().toLocaleTimeString(),
      }];

      self.postMessage({
        type: "BATCH_CHUNK_DONE",
        payload: {
          chunkProcessed: 1,
          chunkSuccess: 0,
          newlyFailed,
          instantProcessed: currentProcessed + 1,
          instantSuccess: currentSuccess,
          remainingQueue: updatedQueue,
          diagnosticStats: diagnosticTelemetry,
          senderMetrics: senderHealthMap,
          totalWarmupCount,
          totalRescuedCount,
        },
      });

      const updatedSenderSent = currentSenderCurrentSent + 1;
      senderSentCount[activeEmail.toLowerCase()] = updatedSenderSent;
      senderProcessedTimes[activeEmail.toLowerCase()] = new Date().toISOString();

      let activePool = sendersList;
      let nextIdx = (senderIdx + 1) % activePool.length;

      // 🛑 सख्त लॉट साइज लिमिट चेक
      if (updatedSenderSent >= targetLotSize) {
        completedSendersCount += 1;
        self.postMessage({ type: "SENDER_LOT_COMPLETED", email: activeEmail });
        activePool = sendersList.filter((s) => s.email.toLowerCase() !== activeEmail.toLowerCase());
        if (activePool.length > 0) {
          nextIdx = senderIdx % activePool.length;
        }
      }

      if (activePool.length === 0 || updatedQueue.length === 0) {
        return executeDispatch({
          ...params,
          currentQueue: updatedQueue,
          sendersList: activePool,
          currentProcessed: currentProcessed + 1,
          currentSuccess: currentSuccess,
        });
      }

      const nextSender = activePool[nextIdx];
      return executeDispatch({
        ...params,
        currentQueue: updatedQueue,
        sendersList: activePool,
        senderIdx: nextIdx,
        currentProcessed: currentProcessed + 1,
        currentSuccess: currentSuccess,
        activeEmail: nextSender.email,
        activePass: nextSender.appPassword,
        activeName: nextSender.senderName || "Colleague",
      });
    }

    if (data.accountError || res.status === 400 || res.status === 401) {
      const remainingSenders = sendersList.filter((s) => s.email.toLowerCase() !== activeEmail.toLowerCase());
      if (remainingSenders.length === 0) {
        self.postMessage({ type: "FATAL_ERROR", message: "All sender accounts exhausted." });
        isRunning = false;
        return;
      }
      const nextSender = remainingSenders[0];
      return executeDispatch({
        ...params,
        sendersList: remainingSenders,
        senderIdx: 0,
        activeEmail: nextSender.email,
        activePass: nextSender.appPassword,
        activeName: nextSender.senderName || "Colleague",
      });
    }

    if (res.status === 403) {
      self.postMessage({ type: "SUSPENDED" });
      isRunning = false;
      return;
    }

    if (data.sessionToken) {
      latestSessionToken = data.sessionToken;
      self.postMessage({ type: "UPDATE_SESSION_TOKEN", sessionToken: latestSessionToken });
    }

    const report = data.report?.[0] || {};
    const isSuccess = report.status === "SUCCESS";
    
    if (isSuccess) {
      recordSenderMetric(activeEmail, "COLD_SENT");
    } else {
      recordSenderMetric(activeEmail, "BOUNCE");
      // 🛑 सटीक कोड टेलीमेट्री में जोड़ें (421, 552 या अन्य)
      recordDiagnosticCode(report.bounceCode || 0);
    }

    const newlyFailed = !isSuccess
      ? [{ email: coldLead, reason: report.error || "Delivery Refused", senderUsed: activeEmail, time: new Date().toLocaleTimeString() }]
      : [];

    const updatedTotalProcessed = currentProcessed + 1;
    const updatedTotalSuccess = currentSuccess + (isSuccess ? 1 : 0);
    const updatedQueue = currentQueue.slice(1);

    self.postMessage({
      type: "BATCH_CHUNK_DONE",
      payload: {
        chunkProcessed: 1,
        chunkSuccess: isSuccess ? 1 : 0,
        newlyFailed,
        instantProcessed: updatedTotalProcessed,
        instantSuccess: updatedTotalSuccess,
        remainingQueue: updatedQueue,
        diagnosticStats: diagnosticTelemetry,
        senderMetrics: senderHealthMap,
        totalWarmupCount,
        totalRescuedCount,
      },
    });

    state.coldSentInRun += 1;
    const updatedSenderSent = currentSenderCurrentSent + 1;
    senderSentCount[activeEmail.toLowerCase()] = updatedSenderSent;
    senderProcessedTimes[activeEmail.toLowerCase()] = new Date().toISOString();

    let activePool = sendersList;
    let nextIdx = (senderIdx + 1) % activePool.length;
    let senderJustCompletedLot = false;

    // 🛑 सख्त लॉट साइज लिमिट चेक
    if (updatedSenderSent >= targetLotSize) {
      senderJustCompletedLot = true;
      completedSendersCount += 1;
      self.postMessage({ type: "SENDER_LOT_COMPLETED", email: activeEmail });
      activePool = sendersList.filter((s) => s.email.toLowerCase() !== activeEmail.toLowerCase());
      if (activePool.length > 0) {
        nextIdx = senderIdx % activePool.length;
      }
    }

    if (activePool.length === 0 || updatedQueue.length === 0) {
      return executeDispatch({
        ...params,
        currentQueue: updatedQueue,
        sendersList: activePool,
        currentProcessed: updatedTotalProcessed,
        currentSuccess: updatedTotalSuccess,
      });
    }

    const isNewRoundStarting = nextIdx === 0;
    if (isNewRoundStarting) {
      advanceWaveRoundIfNeeded(true, subjectList, templateList, template);
    }

    const nextSender = activePool[nextIdx];
    const updatedRounds = roundsDone + 1;

    self.postMessage({
      type: "ROUND_DONE",
      payload: {
        remainingQueue: updatedQueue,
        updatedTotalProcessed,
        updatedTotalSuccess,
        updatedRounds,
        activePool,
        nextSenderIndex: nextIdx,
        nextSender,
        lastBatchMessage: `✅ [${activeEmail}] Delivered to ${coldLead} (${updatedSenderSent}/${targetLotSize})`,
      },
    });

    let shouldPause = false;
    let pauseMessage = "";

    if (rotationMode === "EVERY_SINGLE_SENDER" && senderJustCompletedLot) {
      shouldPause = true;
      pauseMessage = `⏸️ [Sender Lot Finished] Sender [${activeEmail}] completed lot. Click Resume for next sender.`;
    }

    if (rotationMode === "EVERY_N_SENDERS" && senderJustCompletedLot) {
      const targetN = Math.max(1, pauseAfterNSenders);
      if (completedSendersCount > 0 && completedSendersCount % targetN === 0) {
        shouldPause = true;
        pauseMessage = `⏸️ [Batch of ${targetN} Senders Completed] Click Resume to continue!`;
      }
    }

    if (shouldPause) {
      isPaused = true;
      isRunning = false;
      self.postMessage({ type: "PAUSE_REQUIRED", message: pauseMessage });
      return;
    }

    const minD = modeConfig?.minDelay || 3500;
    const maxD = modeConfig?.maxDelay || 6500;
    await sleepRandomDelay(minD, maxD);

    if (!isStopRequested && !isPaused) {
      return executeDispatch({
        ...params,
        currentQueue: updatedQueue,
        sendersList: activePool,
        senderIdx: nextIdx,
        roundsDone: updatedRounds,
        currentProcessed: updatedTotalProcessed,
        currentSuccess: updatedTotalSuccess,
        activeEmail: nextSender.email,
        activePass: nextSender.appPassword,
        activeName: nextSender.senderName || "Colleague",
        sessionToken: latestSessionToken,
      });
    }
  } catch (err) {
    await sleep(4000);
    if (!isStopRequested && !isPaused) {
      return executeDispatch(params);
    }
  }
}

self.onmessage = async (e) => {
  const { action, payload } = e.data;

  // 🛑 1. बीच में नई लीड्स जोड़ने का नया लिसनर (Live Sync with UI)
  if (action === "APPEND_LEADS") {
    const { newLeads } = payload;
    if (Array.isArray(newLeads) && newLeads.length > 0 && activeRunningParams) {
      activeRunningParams.currentQueue = [...activeRunningParams.currentQueue, ...newLeads];
      self.postMessage({
        type: "LIVE_STATUS",
        payload: {
          text: `📥 [Queue Appended] +${newLeads.length} leads added to active queue. Total left: ${activeRunningParams.currentQueue.length}`,
        },
      });
    }
    return;
  }

  if (action === "START") {
    isRunning = true;
    isPaused = false;
    isStopRequested = false;

    currentWaveIndex = 0;
    lastWaveTemplate = "";
    lastWaveSubject = "";
    currentWaveSubject = "";
    currentWaveTemplate = "";

    diagnosticTelemetry = { code550: 0, code552: 0, code553: 0, code554: 0, code421: 0, other: 0 };
    senderHealthMap = {};
    totalWarmupCount = 0;
    totalRescuedCount = 0;

    senderSentCount = {};
    senderProcessedTimes = {};
    senderSessionState = {};
    senderUsedReceiversMap = {};
    completedSendersCount = 0;
    verifiedHealthyPeers = [];
    isAuditorFinished = false;

    payload.sendersList.forEach((s) => {
      senderSentCount[s.email.toLowerCase()] = 0;
      senderUsedReceiversMap[s.email.toLowerCase()] = new Set();
    });

    const isRoundRobin = payload.rotationMode === "CONTINUOUS" || payload.rotationMode === "EVERY_N_SENDERS";
    if (isRoundRobin) {
      startBackgroundPeerAuditor(payload.peerReceivers || [], 4);
    }

    await executeDispatch(payload);
  }

  if (action === "RESUME") {
    isRunning = true;
    isPaused = false;
    isStopRequested = false;
    await executeDispatch(payload);
  }

  if (action === "STOP" || action === "PAUSE") {
    isStopRequested = true;
    isPaused = true;
    isRunning = false;
    self.postMessage({ 
      type: "PAUSED",
      payload: {
        senderProcessedTimes: getOnlyUsedSendersTimes()
      }
    });
  }

  if (action === "RESET") {
    isStopRequested = true;
    isRunning = false;
    isPaused = false;
    activeRunningParams = null;
    currentWaveIndex = 0;
    lastWaveTemplate = "";
    lastWaveSubject = "";
    currentWaveSubject = "";
    currentWaveTemplate = "";
    diagnosticTelemetry = { code550: 0, code552: 0, code553: 0, code554: 0, code421: 0, other: 0 };
    senderHealthMap = {};
    totalWarmupCount = 0;
    totalRescuedCount = 0;
    senderSentCount = {};
    senderProcessedTimes = {};
    senderSessionState = {};
    senderUsedReceiversMap = {};
    pendingRescueJobs = [];
    completedSendersCount = 0;
    verifiedHealthyPeers = [];
    isAuditorFinished = false;
  }
};