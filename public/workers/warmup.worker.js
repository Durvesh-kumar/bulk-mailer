// public/workers/warmup.worker.js

let isRunning = false;
let isStopRequested = false;

let activePool = [];
let receiversPool = [];
let targetLotSize = 5;
let baseIntervalSec = 5;
let machineId = "";
let sessionToken = "";

const dispatchedPairs = new Set();
let senderSentCount = {};
let senderProcessedTimes = {}; // 👈 केवल सफल मेल वाले यहाँ सेव होंगे
let currentSenderIndex = 0;
let currentReceiverIndex = 0;

let stats = {
  totalProcessed: 0,
  totalFailed: 0,
  rescuedCount: 0,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWarmupLoop() {
  while (isRunning && !isStopRequested) {
    if (activePool.length === 0 || receiversPool.length === 0) {
      isRunning = false;
      self.postMessage({
        type: "TARGET_COMPLETED",
        payload: {
          message: `🎉 All available accounts processed successfully. Warm-up finished.`,
          senderProcessedTimes,
        },
      });
      break;
    }

    if (currentSenderIndex >= activePool.length) {
      currentSenderIndex = 0;
    }

    const activeSender = activePool[currentSenderIndex];
    const activeEmail = activeSender.email.toLowerCase().trim();

    self.postMessage({
      type: "ACTIVE_SENDER_INDEX",
      payload: { currentSenderIndex, activeEmail },
    });

    if (!activeSender.appPassword) {
      activePool = activePool.filter((s) => s.email.toLowerCase().trim() !== activeEmail);
      self.postMessage({
        type: "EVICT_SENDER",
        payload: { email: activeEmail, reason: "Password missing" },
      });
      await sleep(500);
      continue;
    }

    const availableReceivers = receiversPool.filter((r) => {
      const recvEmail = r.email.toLowerCase().trim();
      const pairKey = `${activeEmail}:${recvEmail}`;
      return recvEmail !== activeEmail && !dispatchedPairs.has(pairKey);
    });

    if (availableReceivers.length === 0) {
      activePool = activePool.filter((s) => s.email.toLowerCase().trim() !== activeEmail);
      continue;
    }

    const receiverIdx = currentReceiverIndex % availableReceivers.length;
    const activeReceiver = availableReceivers[receiverIdx];
    const receiverEmail = activeReceiver.email.toLowerCase().trim();
    const pairKey = `${activeEmail}:${receiverEmail}`;

    try {
      const res = await fetch("/api/silent-warmup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
        },
        body: JSON.stringify({
          machineId,
          sessionToken,
          senderEmail: activeSender.email,
          senderName: activeSender.senderName || "",
          appPassword: activeSender.appPassword,
          encryptedPassword: activeSender.appPassword,
          receiverEmail: activeReceiver.email,
        }),
      });

      const data = await res.json().catch(() => ({}));

      // 🛑 ऑथेंटिकेशन फ़ेल होने पर तुरंत एविक्ट करें (कोई टाइमस्टैम्प अपडेट नहीं)
      if (res.status === 401 || data.accountErrorType === "AUTH_FAILED" || res.status === 403) {
        activePool = activePool.filter((s) => s.email.toLowerCase().trim() !== activeEmail);
        self.postMessage({
          type: "EVICT_SENDER",
          payload: { email: activeEmail, reason: data.error || "Authentication Failed (Google 535)" },
        });
        await sleep(500);
        continue;
      }

      if (res.ok && (data.success || data.status === "SUCCESS")) {
        // ✅ मेल 100% सक्सेसफुल जाने पर ही पेयर और टाइमस्टैम्प लॉक करें
        dispatchedPairs.add(pairKey);

        const currentSent = (senderSentCount[activeEmail] || 0) + 1;
        senderSentCount[activeEmail] = currentSent;
        const nowIso = new Date().toISOString();
        senderProcessedTimes[activeEmail] = nowIso; // 👈 यहाँ फिक्स टाइम अपडेट हुआ

        stats.totalProcessed++;
        if (data.rescued) stats.rescuedCount++;

        const displayName = activeSender.senderName ? `"${activeSender.senderName}" ` : "";
        self.postMessage({
          type: "LOG",
          payload: {
            text: `[${new Date().toLocaleTimeString()}] 🚀 [${currentSent}/${targetLotSize}] ${displayName}<${activeSender.email}> ➔ ${receiverEmail}`,
          },
        });

        if (currentSent >= targetLotSize) {
          activePool = activePool.filter((s) => s.email.toLowerCase().trim() !== activeEmail);
          self.postMessage({
            type: "SENDER_LOT_FINISHED",
            payload: {
              email: activeEmail,
              lastSentAt: nowIso,
              text: `[${new Date().toLocaleTimeString()}] 🏁 [Done ${currentSent}/${targetLotSize}] ${activeSender.email} completed quota.`,
            },
          });
        } else {
          currentSenderIndex = (currentSenderIndex + 1) % (activePool.length || 1);
        }
      } else {
        // ❌ डिलीवरी फ़ेल होने पर `senderProcessedTimes` में टाइम सेट नहीं होगा!
        stats.totalFailed++;
        currentSenderIndex = (currentSenderIndex + 1) % (activePool.length || 1);
        self.postMessage({
          type: "LOG",
          payload: {
            text: `[${new Date().toLocaleTimeString()}] ❌ Delivery Failed [${activeSender.email}]: ${data.error || "Handshake Refused"}`,
          },
        });
      }

      currentReceiverIndex = (currentReceiverIndex + 1) % availableReceivers.length;
    } catch (netErr) {
      // ❌ नेटवर्क एरर पर भी टाइम सेट नहीं होगा
      stats.totalFailed++;
      currentSenderIndex = (currentSenderIndex + 1) % (activePool.length || 1);
      self.postMessage({
        type: "LOG",
        payload: {
          text: `[${new Date().toLocaleTimeString()}] ❌ Network Error for ${activeSender.email}`,
        },
      });
    }

    self.postMessage({
      type: "STATS_UPDATE",
      payload: { ...stats, senderProcessedTimes },
    });

    if (isStopRequested || !isRunning) break;

    const baseMs = Math.max(5, baseIntervalSec || 5) * 1000;
    const jitterMs = Math.floor(Math.random() * 2000) + 500;
    await sleep(baseMs + jitterMs);
  }
}

self.onmessage = async (e) => {
  const { action, payload } = e.data;

  if (action === "START") {
    isRunning = true;
    isStopRequested = false;

    activePool = [...(payload.readySenders || [])];
    receiversPool = [...(payload.receivers || [])];
    targetLotSize = payload.lotSize || 5;
    baseIntervalSec = payload.intervalSeconds || 5;
    machineId = payload.machineId || "";
    sessionToken = payload.sessionToken || "";

    senderSentCount = {};
    senderProcessedTimes = {};
    currentSenderIndex = 0;
    currentReceiverIndex = 0;

    stats = { totalProcessed: 0, totalFailed: 0, rescuedCount: 0 };

    activePool.forEach((s) => {
      senderSentCount[s.email.toLowerCase().trim()] = 0;
    });

    await runWarmupLoop();
  }

  if (action === "UPDATE_CONFIG") {
    if (payload.intervalSeconds) baseIntervalSec = payload.intervalSeconds;
    if (payload.lotSize) targetLotSize = payload.lotSize;
  }

  if (action === "STOP" || action === "PAUSE") {
    isStopRequested = true;
    isRunning = false;
    self.postMessage({
      type: "PAUSED",
      payload: { senderProcessedTimes },
    });
  }
};