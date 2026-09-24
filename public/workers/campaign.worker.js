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

// Subject & Template Storage
let subjectList = [];
let templateList = [];
let defaultTemplate = "";

// 🎯 Two-Phase Rotation Trackers (Sequential -> Random)
let currentRoundSubject = "";
let currentRoundTemplate = "";
let sendersUsedRoundsCount = 0; // 0 = Round 1, 1 = Round 2, 2 = Round 3...

// 📊 Header & Stats Tracking (Zero undefined guarantee)
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

// 🎯 2-फेज़ लॉजिक (1-1, 2-2, 3-3, फिर Non-Repeating Random)
function determineComboForRound(roundIndex) {
  const cleanSubs = (subjectList || [])
    .map((s) => (s || "").trim())
    .filter((s) => s.length > 0);

  const cleanTemps = (Array.isArray(templateList) && templateList.length > 0 ? templateList : [defaultTemplate || ""])
    .map((t) => (t || "").trim())
    .filter((t) => t.length > 0);

  const totalSubs = cleanSubs.length || 1;
  const totalTemps = cleanTemps.length || 1;
  const maxInitialPairs = Math.max(totalSubs, totalTemps);

  let nextSub = "";
  let nextTemp = "";

  // 🔹 फ़ेज़ 1: सीक्वेंशियल राउंड्स
  if (roundIndex < maxInitialPairs) {
    nextSub = cleanSubs[roundIndex % totalSubs] || cleanSubs[0] || "Quick check-in regarding partnership";
    nextTemp = cleanTemps[roundIndex % totalTemps] || cleanTemps[0] || (defaultTemplate || "Hi there, hope you are well.");
  } 
  // 🔹 फ़ेज़ 2: नॉन-रिपीटिंग रैंडम
  else {
    if (cleanSubs.length > 1) {
      const poolSubs = cleanSubs.filter((s) => s !== currentRoundSubject);
      const activePool = poolSubs.length > 0 ? poolSubs : cleanSubs;
      nextSub = activePool[Math.floor(Math.random() * activePool.length)];
    } else {
      nextSub = cleanSubs[0] || "Quick check-in regarding partnership";
    }

    if (cleanTemps.length > 1) {
      const poolTemps = cleanTemps.filter((t) => t !== currentRoundTemplate);
      const activePoolT = poolTemps.length > 0 ? poolTemps : cleanTemps;
      nextTemp = activePoolT[Math.floor(Math.random() * activePoolT.length)];
    } else {
      nextTemp = cleanTemps[0] || defaultTemplate || "Hi there, hope you are well.";
    }
  }

  currentRoundSubject = nextSub;
  currentRoundTemplate = nextTemp;

  self.postMessage({
    type: "LIVE_STATUS",
    payload: {
      text: `🔄 [Round ${roundIndex + 1}] Active: Sub: "${currentRoundSubject.substring(0, 25)}..." | Template Rotated`,
      currentSubject: currentRoundSubject,
      currentTemplate: currentRoundTemplate,
    },
  });
}

// 🔄 स्टॉप/पॉज़ के बाद अगर कुछ बदला है तो उसे तुरंत सिंक करना
function syncContentIfChanged(incomingSubs, incomingTemps, incomingDefTemp) {
  let changed = false;

  if (Array.isArray(incomingSubs)) {
    const cleanNewSubs = incomingSubs.map(s => (s || "").trim()).filter(Boolean);
    if (JSON.stringify(cleanNewSubs) !== JSON.stringify(subjectList)) {
      subjectList = cleanNewSubs;
      changed = true;
    }
  }

  if (Array.isArray(incomingTemps)) {
    const cleanNewTemps = incomingTemps.map(t => (t || "").trim()).filter(Boolean);
    if (JSON.stringify(cleanNewTemps) !== JSON.stringify(templateList)) {
      templateList = cleanNewTemps;
      changed = true;
    }
  }

  if (incomingDefTemp && incomingDefTemp !== defaultTemplate) {
    defaultTemplate = incomingDefTemp;
    changed = true;
  }

  if (changed) {
    determineComboForRound(sendersUsedRoundsCount);
    self.postMessage({
      type: "LIVE_STATUS",
      payload: { text: "⚡ [Content Synced] New subjects/templates applied on resume!" },
    });
  }
}

// UI के सभी काउंटर्स के लिए फुल पेलोड
function buildStatsPayload(activeSender, sendSuccess, coldLead, reportError) {
  return {
    processed: globalProcessedCount,
    processedCount: globalProcessedCount,
    totalProcessed: globalProcessedCount,
    instantProcessed: globalProcessedCount,

    delivered: globalSuccessCount,
    successCount: globalSuccessCount,
    deliveredCount: globalSuccessCount,
    totalSuccess: globalSuccessCount,
    instantSuccess: globalSuccessCount,

    failed: globalFailedCount,
    failedCount: globalFailedCount,
    totalFailed: globalFailedCount,
    failedLeadsList: failedLeadsArray,
    newlyFailed: !sendSuccess && coldLead ? [{
      email: coldLead,
      reason: reportError || "Delivery Failed",
      senderUsed: activeSender ? activeSender.email : "",
      time: new Date().toLocaleTimeString(),
    }] : [],

    sendersUsedRounds: sendersUsedRoundsCount,
    turnsDone: sendersUsedRoundsCount,
    currentSenderIndex: currentSenderIndex,
    currentTurn: currentSenderIndex + 1,
    remainingAccountsInQueue: sendersList.length,
    totalAccountsCount: sendersList.length,

    activeSenderEmail: activeSender ? activeSender.email : "",
    activeSenderName: activeSender ? (activeSender.senderName || "Sender") : "",
    senderEmail: activeSender ? activeSender.email : "",
    senderName: activeSender ? (activeSender.senderName || "Sender") : "",

    currentSubject: currentRoundSubject,
    currentTemplate: currentRoundTemplate,

    remainingQueue: currentQueue,
    remainingQueueCount: currentQueue.length,
    diagnosticStats: diagnosticTelemetry,
    senderMetrics: senderHealthMap,
    totalWarmupCount: 0,
    totalRescuedCount: 0,
  };
}

// ========================================================
// 🚀 MAIN CAMPAIGN EXECUTION LOOP
// ========================================================
async function runCampaignWorkflow() {
  const modeClean = (rotationMode || "").toUpperCase();
  const isRoundRobin = modeClean === "CONTINUOUS" || modeClean === "EVERY_N_SENDERS" || modeClean === "ROUND_ROBIN" || modeClean.includes("ROBIN") || modeClean === "";

  if (!currentRoundSubject || !currentRoundTemplate) {
    determineComboForRound(sendersUsedRoundsCount);
  }

  while (isRunning && !isStopRequested && currentQueue.length > 0 && sendersList.length > 0) {
    if (isPaused) {
      await sleep(1000);
      continue;
    }

    // 🛑 अगर सेंडर खत्म हो गए तो रुक जाओ और UI को अलर्ट करो
    if (sendersList.length === 0) {
      isPaused = true;
      isRunning = false;
      self.postMessage({
        type: "SENDERS_EXHAUSTED",
        message: "⚠️ All senders completed their lots! Add more senders to resume.",
        payload: buildStatsPayload(null, false, null, null),
      });
      break;
    }

    // 🛑 अगर लीड्स खत्म हो गईं तो रुक जाओ और UI को अलर्ट करो
    if (currentQueue.length === 0) {
      isPaused = true;
      isRunning = false;
      self.postMessage({
        type: "QUEUE_EXHAUSTED",
        message: "⚠️ Target leads finished! Add more leads to continue.",
        payload: buildStatsPayload(null, false, null, null),
      });
      break;
    }

    if (!isRoundRobin) {
      currentSenderIndex = 0;
    }

    if (currentSenderIndex >= sendersList.length) {
      currentSenderIndex = 0;
    }

    const activeSender = sendersList[currentSenderIndex];
    const rawSenderEmail = activeSender.email.toLowerCase().trim();
    const currentSent = senderSentCount[rawSenderEmail] || 0;

    // प्री-सेंड कोटा चेक
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
      if (currentSenderIndex >= sendersList.length) {
        currentSenderIndex = 0;
        if (sendersList.length > 0) {
          sendersUsedRoundsCount++;
          determineComboForRound(sendersUsedRoundsCount);
        }
      }
      continue;
    }

    const coldLead = currentQueue[0];

    self.postMessage({
      type: "LIVE_STATUS",
      payload: {
        text: `🚀 [Round ${sendersUsedRoundsCount + 1}] [Turn ${currentSenderIndex + 1}/${sendersList.length}: ${activeSender.senderName || rawSenderEmail}] [Sub: "${currentRoundSubject.substring(0, 25)}..."] -> ${coldLead}`,
        activeSenderEmail: rawSenderEmail,
        activeSenderName: activeSender.senderName || "Sender",
        currentSenderIndex: currentSenderIndex,
        currentTurn: currentSenderIndex + 1,
        turnsDone: sendersUsedRoundsCount,
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
          subject: currentRoundSubject,
          template: currentRoundTemplate.trim(),
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
        reportError = data.report?.[0]?.error || "Recipient address not found (550/501/553)";
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

      self.postMessage({
        type: "BATCH_CHUNK_DONE",
        payload: buildStatsPayload(activeSender, sendSuccess, coldLead, reportError),
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
        if (currentSenderIndex >= sendersList.length) {
          currentSenderIndex = 0;
          if (sendersList.length > 0) {
            sendersUsedRoundsCount++;
            determineComboForRound(sendersUsedRoundsCount);
          }
        }
      } else {
        // 🔥 सख्त 1-बाय-1 राउंड-रॉबिन
        if (isRoundRobin) {
          currentSenderIndex++;

          // 🎯 जैसे ही आखिरी सेंडर का मेल गया -> राउंड + 1
          if (currentSenderIndex >= sendersList.length) {
            currentSenderIndex = 0;
            sendersUsedRoundsCount++;
            determineComboForRound(sendersUsedRoundsCount);
          }
        }
      }

      // Option 3: EVERY_SINGLE_SENDER
      if (modeClean === "EVERY_SINGLE_SENDER" && senderJustCompletedLot) {
        isPaused = true;
        isRunning = false;
        self.postMessage({
          type: "PAUSE_REQUIRED",
          message: `⏸️ [Lot Finished] Sender [${rawSenderEmail}] completed full lot. Click Resume for next sender.`,
        });
        return;
      }

      // Option 2: EVERY_N_SENDERS
      if (modeClean === "EVERY_N_SENDERS" && senderJustCompletedLot) {
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
        currentSenderIndex++;
        if (currentSenderIndex >= sendersList.length) {
          currentSenderIndex = 0;
          sendersUsedRoundsCount++;
          determineComboForRound(sendersUsedRoundsCount);
        }
      }
    }

    self.postMessage({
      type: "TELEMETRY_UPDATE",
      payload: buildStatsPayload(activeSender, false, null, null),
    });

    await sleepRandomDelay(minDelayMsConfig, maxDelayMsConfig);
  }

  isRunning = false;
  self.postMessage({
    type: "QUEUE_FINISHED_OR_STOPPED",
    payload: {
      isQueueEmpty: currentQueue.length === 0,
      areSendersExhausted: sendersList.length === 0,
      ...buildStatsPayload(null, false, null, null),
    },
  });
}

// ==========================================
// 📨 MESSAGE DISPATCHER
// ==========================================
self.onmessage = async (e) => {
  const { action, payload } = e.data;

  // 1. लाइव अपडेट (चलते-चलते सब्जेक्ट/टेम्पलेट बदलना)
  if (action === "UPDATE_CONTENT") {
    if (payload) {
      syncContentIfChanged(payload.subjectList, payload.templateList, payload.template);
    }
    return;
  }

  // 2. लीड्स जोड़ना (APPEND_LEADS)
  if (action === "APPEND_LEADS") {
    if (Array.isArray(payload.newLeads) && payload.newLeads.length > 0) {
      currentQueue.push(...payload.newLeads);
      self.postMessage({
        type: "LIVE_STATUS",
        payload: { text: `[Queue Appended] +${payload.newLeads.length} leads added. Total: ${currentQueue.length}` },
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

  // 3. नए सेंडर्स जोड़ना (APPEND_SENDERS - सेंडर खत्म होने पर नया माल झोंकना)
  if (action === "APPEND_SENDERS") {
    if (Array.isArray(payload.newSendersList) && payload.newSendersList.length > 0) {
      payload.newSendersList.forEach((s) => {
        const email = s.email.toLowerCase().trim();
        if (!sendersList.some(existing => existing.email.toLowerCase().trim() === email)) {
          sendersList.push(s);
          senderSentCount[email] = 0;
        }
      });

      self.postMessage({
        type: "LIVE_STATUS",
        payload: { text: `[Senders Added] +${payload.newSendersList.length} new senders added. Total: ${sendersList.length}` },
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

  // 4. सेंडर्स की पूरी लिस्ट बदलना (SWAP_SENDERS)
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
        payload: { text: `[Tier Swapped] Loaded ${sendersList.length} senders.` },
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

  // 🚀 5. START या RESUME (यहाँ स्टॉप के बाद का नया डेटा ऑटो-चेक होगा)
  if (action === "START" || action === "RESUME") {
    isRunning = true;
    isPaused = false;
    isStopRequested = false;

    // 🔥 अगर स्टॉप के दौरान सब्जेक्ट, टेम्पलेट या सेंडर बदले हैं तो तुरंत री-सिंक
    if (payload) {
      syncContentIfChanged(payload.subjectList, payload.templateList, payload.template);

      // अगर रिज़्यूम पर नए सेंडर या लीड्स भेजी गई हैं तो सिंक करें
      if (Array.isArray(payload.sendersList) && payload.sendersList.length > 0) {
        sendersList = [...payload.sendersList];
      }
      if (Array.isArray(payload.currentQueue) && payload.currentQueue.length > 0) {
        currentQueue = [...payload.currentQueue];
      }
    }

    if (action === "START") {
      currentQueue = [...(payload.currentQueue || [])];
      sendersList = [...(payload.sendersList || [])];
      targetLotSize = payload.targetLotSize || 10;
      
      rotationMode = payload.rotationMode || "CONTINUOUS";
      pauseAfterNSenders = payload.pauseAfterNSenders || 1;

      machineId = payload.machineId || "";
      sessionToken = payload.sessionToken || "";
      adminKey = payload.adminKey || "";
      customSignoffName = payload.customSignoffName || "";
      accountAgeMode = payload.mode || "NEW";

      minDelayMsConfig = payload.modeConfig?.minDelay || 3500;
      maxDelayMsConfig = payload.modeConfig?.maxDelay || 6500;

      subjectList = Array.isArray(payload.subjectList) ? payload.subjectList.filter(s => (s || "").trim().length > 0) : [];
      templateList = Array.isArray(payload.templateList) ? payload.templateList.filter(t => (t || "").trim().length > 0) : [];
      defaultTemplate = payload.template || "";

      currentRoundSubject = "";
      currentRoundTemplate = "";

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
    currentRoundSubject = "";
    currentRoundTemplate = "";

    self.postMessage({ type: "LOG", payload: { text: "Worker reset completed." } });
  }
};