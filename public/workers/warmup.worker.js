// public/workers/warmup.worker.js

let isRunning = false;
let isStopRequested = false;

let activePool = [];
let targetLotSize = 10;
let baseIntervalSec = 5;
let machineId = "";
let sessionToken = "";

// 📥 वेरीफाइड रिसीवर मास्टर कैश (सेंडर/कैंपेन बदलने पर भी सुरक्षित रहेगा)
let unverifiedReceiversQueue = [];
let verifiedReceivers = [];
let isAuditorRunning = false;

// ⏱️ कूल-डाउन मैप (रिसीवर को थोड़ा सांस देने के लिए)
let receiverLastUsedMap = {};

// 🔒 एक्टिव कैंपेन रन का पेयर ट्रैकर (नया रन आते ही खाली हो जाएगा)
let dispatchedPairs = new Set(); 

let senderSentCount = {};
let senderProcessedTimes = {};
let currentSenderIndex = 0;

let stats = {
  totalProcessed: 0,
  totalFailed: 0,
  rescuedCount: 0,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ==========================================
// ⚡ बैकग्राउंड ऑडिटर: 3-3 रिसीवर्स का वेरिफिकेशन
// ==========================================
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
        const rawEmail = String(res.value.peer.email);
        if (!verifiedReceivers.some((v) => String(v.email) === rawEmail)) {
          verifiedReceivers.push(res.value.peer);
          if (!receiverLastUsedMap[rawEmail]) {
            receiverLastUsedMap[rawEmail] = 0;
          }
        }
      }
    });

    await sleep(600);
  }

  isAuditorRunning = false;
}

// ==========================================
// 🚀 मुख्य राउंड-रॉबिन लूप (Strict 1-by-1 Execution)
// ==========================================
async function runWarmupLoop() {
  while (isRunning && !isStopRequested) {
    // 1. जब सभी सेंडर्स का कोटा पूरा हो जाए (कैंपेन पूरा)
    if (activePool.length === 0) {
      isRunning = false;
      self.postMessage({
        type: "TARGET_COMPLETED",
        payload: {
          message: `🎉 सभी सेंडर्स का कोटा (${targetLotSize}/${targetLotSize}) पूरा हो गया!`,
          senderProcessedTimes,
        },
      });
      break;
    }

    if (currentSenderIndex >= activePool.length) {
      currentSenderIndex = 0;
    }

    const activeSender = activePool[currentSenderIndex];
    const rawSenderEmail = String(activeSender.email);

    self.postMessage({
      type: "ACTIVE_SENDER_INDEX",
      payload: { currentSenderIndex, activeEmail: rawSenderEmail },
    });

    // पासवर्ड न होने पर सेंडर को निकालो
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

    // 🛑 2. सख्त लॉक-इन वेट (इस एक्टिव कैंपेन में सेम पेयर रिपीट नहीं होगा)
    let chosenReceiver = null;
    let waitSeconds = 0;

    while (isRunning && !isStopRequested) {
      // (a) खुद को मेल नहीं (rawSenderEmail !== recvEmail)
      // (b) इस कैंपेन रन में इस सेंडर ने इस रिसीवर को पहले न भेजा हो (!dispatchedPairs.has)
      const eligible = verifiedReceivers.filter((r) => {
        const recvEmail = String(r.email);
        const isNotSelf = rawSenderEmail !== recvEmail;
        const pairKey = `${rawSenderEmail}:::${recvEmail}`;
        return isNotSelf && !dispatchedPairs.has(pairKey);
      });

      if (eligible.length > 0) {
        // जिस रिसीवर को मेल गए सबसे ज्यादा देर हो चुकी है, उसे पहले उठाओ
        eligible.sort((a, b) => {
          const timeA = receiverLastUsedMap[String(a.email)] || 0;
          const timeB = receiverLastUsedMap[String(b.email)] || 0;
          return timeA - timeB;
        });

        chosenReceiver = eligible[0];
        break;
      }

      // जब तक फ्रेश रिसीवर नहीं मिलता, सेंडर खड़ा रहेगा (नो स्किप!)
      waitSeconds += 3;
      if (waitSeconds % 15 === 0) {
        self.postMessage({
          type: "LOG",
          payload: {
            text: `⏳ [WAITING] ${rawSenderEmail} इंतज़ार कर रहा है... इस कैंपेन का फ्रेश रिसीवर लोड हो रहा है (${waitSeconds}s)`,
          },
        });
      }

      await sleep(3000);
    }

    if (isStopRequested || !isRunning) break;
    if (!chosenReceiver) continue;

    const rawReceiverEmail = String(chosenReceiver.email);
    const pairKey = `${rawSenderEmail}:::${rawReceiverEmail}`;

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

      // Google 535 पासवर्ड एरर
      if (res.status === 401 || data.accountErrorType === "AUTH_FAILED" || res.status === 403) {
        activePool.splice(currentSenderIndex, 1);
        if (currentSenderIndex >= activePool.length) currentSenderIndex = 0;

        self.postMessage({
          type: "EVICT_SENDER",
          payload: { email: rawSenderEmail, reason: data.error || "Google 535 Auth Failed" },
        });
        await sleep(500);
        continue;
      }

      if (res.ok && (data.success || data.status === "SUCCESS")) {
        // 🔒 इस रन के लिए पेयर लॉक
        dispatchedPairs.add(pairKey);
        receiverLastUsedMap[rawReceiverEmail] = Date.now();

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

        // कोटा पूरा होने पर ही सेंडर बाहर निकलेगा
        if (currentSent >= targetLotSize) {
          activePool.splice(currentSenderIndex, 1);
          if (currentSenderIndex >= activePool.length) currentSenderIndex = 0;

          self.postMessage({
            type: "SENDER_LOT_FINISHED",
            payload: {
              email: rawSenderEmail,
              lastSentAt: nowIso,
              text: `[${new Date().toLocaleTimeString()}] 🏁 [Done ${currentSent}/${targetLotSize}] ${rawSenderEmail} quota complete.`,
            },
          });
        } else {
          // सख्त राउंड-रॉबिन: अगला सेंडर
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

    // नेचुरल डिले (5 से 7 सेकंड)
    const baseMs = Math.max(5, baseIntervalSec || 5) * 1000;
    const jitterMs = Math.floor(Math.random() * 2000) + 500;
    await sleep(baseMs + jitterMs);
  }
}

// ==========================================
// 📨 संदेश लिसनर
// ==========================================
self.onmessage = async (e) => {
  const { action, payload } = e.data;

  // 🚀 जब भी नया कैंपेन या नया रन START होगा
  if (action === "START") {
    isRunning = true;
    isStopRequested = false;

    activePool = [...(payload.readySenders || [])];
    targetLotSize = payload.lotSize || 10;
    baseIntervalSec = payload.intervalSeconds || 5;
    machineId = payload.machineId || "";
    sessionToken = payload.sessionToken || "";

    // ⚡ नए रन का स्टेट रिसेट
    senderSentCount = {};
    senderProcessedTimes = {};
    currentSenderIndex = 0;
    stats = { totalProcessed: 0, totalFailed: 0, rescuedCount: 0 };

    // 🔥 नया कैंपेन शुरू: पेयर लॉक खाली! अब सेंडर्स फिर से इन रिसीवर्स को मेल मार सकते हैं
    dispatchedPairs.clear();

    activePool.forEach((s) => {
      senderSentCount[String(s.email)] = 0;
    });

    // नए कच्चे रिसीवर्स को कतार में जोड़ो
    if (payload.receivers && Array.isArray(payload.receivers)) {
      const incoming = payload.receivers.filter(
        (rec) => !verifiedReceivers.some((v) => String(v.email) === String(rec.email))
      );
      unverifiedReceiversQueue = [...incoming];
    }

    // 🔒 ध्यान दो: verifiedReceivers यहाँ खाली नहीं हुआ (बैकएंड API कॉल की बचत)
    startAuditorPipeline(3);
    await runWarmupLoop();
  }

  if (action === "ADD_RECEIVERS") {
    if (payload.receivers && Array.isArray(payload.receivers)) {
      const incoming = payload.receivers.filter(
        (rec) => !verifiedReceivers.some((v) => String(v.email) === String(rec.email))
      );
      unverifiedReceiversQueue.push(...incoming);
      startAuditorPipeline(3);
    }
  }

  if (action === "UPDATE_CONFIG") {
    if (payload.intervalSeconds) baseIntervalSec = payload.intervalSeconds;
    if (payload.lotSize) targetLotSize = payload.lotSize;
  }

  // 🧹 केवल RESET पर ही कैश और वेरीफाइड रिसीवर पूरी तरह वाइप होंगे
  if (action === "RESET") {
    isStopRequested = true;
    isRunning = false;
    activePool = [];
    unverifiedReceiversQueue = [];
    verifiedReceivers = [];
    receiverLastUsedMap = {};
    dispatchedPairs.clear();
    senderSentCount = {};
    senderProcessedTimes = {};
    currentSenderIndex = 0;
    isAuditorRunning = false;

    self.postMessage({
      type: "LOG",
      payload: { text: "🧹 सिस्टम 100% रीसेट हो गया। सभी वेरीफाइड रिसीवर और हिस्ट्री क्लियर कर दी गई है।" },
    });
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