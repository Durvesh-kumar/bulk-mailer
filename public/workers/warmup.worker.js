// public/workers/warmup.worker.js

let isRunning = false;
let isStopRequested = false;

let activePool = [];
let receiversPool = [];
let targetLotSize = 10;
let baseIntervalSec = 5;
let machineId = "";
let sessionToken = "";

// 🔒 एक बार इस्तेमाल हुआ रिसीवर यहाँ लॉक रहेगा
const dispatchedReceivers = new Set();
let senderSentCount = {};
let senderProcessedTimes = {};
let currentSenderIndex = 0;

let stats = {
  totalProcessed: 0,
  totalFailed: 0,
  rescuedCount: 0,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWarmupLoop() {
  while (isRunning && !isStopRequested) {
    if (activePool.length === 0) {
      isRunning = false;
      self.postMessage({
        type: "TARGET_COMPLETED",
        payload: {
          message: `🎉 All accounts completed exactly ${targetLotSize}/${targetLotSize} mails successfully!`,
          senderProcessedTimes,
        },
      });
      break;
    }

    if (currentSenderIndex >= activePool.length) {
      currentSenderIndex = 0;
    }

    const activeSender = activePool[currentSenderIndex];
    // ⚡ रॉ स्ट्रिंग (Raw String) बिना किसी छेड़छाड़ के
    const rawSenderEmail = String(activeSender.email);

    self.postMessage({
      type: "ACTIVE_SENDER_INDEX",
      payload: { currentSenderIndex, activeEmail: rawSenderEmail },
    });

    // 🛑 1. पासवर्ड न होने पर सेंडर बाहर
    if (!activeSender.appPassword) {
      activePool.splice(currentSenderIndex, 1);
      if (currentSenderIndex >= activePool.length) currentSenderIndex = 0;

      self.postMessage({
        type: "EVICT_SENDER",
        payload: { email: rawSenderEmail, reason: "Password missing" },
      });
      await sleep(200);
      continue;
    }

    // 🛑 2. सख्त इंतज़ार लूप (STRICT MISMATCH CHECK)
    let activeReceiver = null;
    let waitSeconds = 0;

    while (isRunning && !isStopRequested) {
      const availableReceivers = receiversPool.filter((r) => {
        const rawReceiverEmail = String(r.email);

        // 🔥 नियम: यदि पूरी स्ट्रिंग 100% मैच कर गई (एक भी कैरेक्टर का फर्क नहीं), तो खुद का मेल है -> NO
        const isExactSame = (rawSenderEmail === rawReceiverEmail);

        // 🔥 यदि एक भी कैरेक्टर अलग है (!isExactSame) और पहले नहीं भेजा गया -> VALID MAIL
        const isNotDispatched = !dispatchedReceivers.has(rawReceiverEmail);

        return !isExactSame && isNotDispatched;
      });

      if (availableReceivers.length > 0) {
        activeReceiver = availableReceivers[0];
        break;
      }

      // जब तक फ्रेश मिसमैच रिसीवर नहीं मिलता, खड़ा रहेगा
      waitSeconds += 5;
      if (waitSeconds % 30 === 0) {
        self.postMessage({
          type: "LOG",
          payload: {
            text: `⏳ [WAITING] ${rawSenderEmail} इंतज़ार कर रहा है... कोई वैलिड रिसीवर नहीं मिला (${waitSeconds}s elapsed)`,
          },
        });
      }

      await sleep(5000);
    }

    if (isStopRequested || !isRunning) break;
    if (!activeReceiver) continue;

    const rawReceiverEmail = String(activeReceiver.email);

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
          senderEmail: rawSenderEmail,
          senderName: activeSender.senderName || "",
          appPassword: activeSender.appPassword,
          encryptedPassword: activeSender.appPassword,
          receiverEmail: rawReceiverEmail,
        }),
      });

      const data = await res.json().catch(() => ({}));

      // 🛑 3. पासवर्ड फेल (Google 535) होने पर सेफ रिमूवल
      if (res.status === 401 || data.accountErrorType === "AUTH_FAILED" || res.status === 403) {
        activePool.splice(currentSenderIndex, 1);
        if (currentSenderIndex >= activePool.length) currentSenderIndex = 0;

        self.postMessage({
          type: "EVICT_SENDER",
          payload: { email: rawSenderEmail, reason: data.error || "Authentication Failed (Google 535)" },
        });
        await sleep(500);
        continue;
      }

      if (res.ok && (data.success || data.status === "SUCCESS")) {
        // रिसीवर को लॉक करो ताकि दोबारा कभी न जाए
        dispatchedReceivers.add(rawReceiverEmail);

        const currentSent = (senderSentCount[rawSenderEmail] || 0) + 1;
        senderSentCount[rawSenderEmail] = currentSent;
        const nowIso = new Date().toISOString();
        senderProcessedTimes[rawSenderEmail] = nowIso;

        stats.totalProcessed++;
        if (data.rescued) stats.rescuedCount++;

        const displayName = activeSender.senderName ? `"${activeSender.senderName}" ` : "";
        self.postMessage({
          type: "LOG",
          payload: {
            text: `[${new Date().toLocaleTimeString()}] 🚀 [${currentSent}/${targetLotSize}] ${displayName}<${rawSenderEmail}> ➔ ${rawReceiverEmail}`,
          },
        });

        // केवल 10 पूरे होने पर ही सेंडर हटेगा
        if (currentSent >= targetLotSize) {
          activePool.splice(currentSenderIndex, 1);
          if (currentSenderIndex >= activePool.length) currentSenderIndex = 0;

          self.postMessage({
            type: "SENDER_LOT_FINISHED",
            payload: {
              email: rawSenderEmail,
              lastSentAt: nowIso,
              text: `[${new Date().toLocaleTimeString()}] 🏁 [Done ${currentSent}/${targetLotSize}] ${rawSenderEmail} completed quota.`,
            },
          });
        } else {
          // राउंड-रॉबिन: अगला सेंडर
          currentSenderIndex = (currentSenderIndex + 1) % activePool.length;
        }
      } else {
        stats.totalFailed++;
        currentSenderIndex = (currentSenderIndex + 1) % activePool.length;
        self.postMessage({
          type: "LOG",
          payload: {
            text: `[${new Date().toLocaleTimeString()}] ❌ Delivery Failed [${rawSenderEmail}]: ${data.error || "Handshake Refused"}`,
          },
        });
      }
    } catch (netErr) {
      stats.totalFailed++;
      currentSenderIndex = (currentSenderIndex + 1) % activePool.length;
      self.postMessage({
        type: "LOG",
        payload: {
          text: `[${new Date().toLocaleTimeString()}] ❌ Network Error for ${rawSenderEmail}`,
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
    targetLotSize = payload.lotSize || 10;
    baseIntervalSec = payload.intervalSeconds || 5;
    machineId = payload.machineId || "";
    sessionToken = payload.sessionToken || "";

    senderSentCount = {};
    senderProcessedTimes = {};
    currentSenderIndex = 0;

    stats = { totalProcessed: 0, totalFailed: 0, rescuedCount: 0 };

    activePool.forEach((s) => {
      senderSentCount[String(s.email)] = 0;
    });

    await runWarmupLoop();
  }

  if (action === "ADD_RECEIVERS") {
    if (payload.receivers && Array.isArray(payload.receivers)) {
      receiversPool.push(...payload.receivers);
    }
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