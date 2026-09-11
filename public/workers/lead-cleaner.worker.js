// public/workers/lead-cleaner.worker.js

let isCancelled = false;

self.onmessage = async (e) => {
  const { action, payload } = e.data;

  if (action === "CANCEL") {
    isCancelled = true;
    self.postMessage({ type: "CANCELLED" });
    return;
  }

  if (action === "START_VERIFY") {
    isCancelled = false;
    const { emails, chunkSize = 5 } = payload;
    const total = emails.length;
    let processed = 0;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let i = 0; i < total; i += chunkSize) {
      if (isCancelled) break;

      const chunk = emails.slice(i, i + chunkSize);

      const batchPromises = chunk.map(async (email) => {
        try {
          const res = await fetch("/api/verify-dns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            return {
              email,
              valid: false,
              reason: errBody.reason || "SERVER_ERROR",
              message: errBody.message || "सर्वर से रिस्पॉन्स नहीं मिला",
            };
          }
          return await res.json();
        } catch (netErr) {
          return {
            email,
            valid: false,
            reason: "CONN_ERR",
            message: netErr?.message || "नेटवर्क या सॉकेट टाइमआउट",
          };
        }
      });

      const chunkResults = await Promise.all(batchPromises);
      processed += chunk.length;

      // हर बैच के बाद मुख्य UI को तुरंत अपडेट भेजें
      self.postMessage({
        type: "CHUNK_PROCESSED",
        processedSoFar: processed,
        total,
        results: chunkResults,
      });

      if (i + chunkSize < total) {
        await sleep(600); // रिमोट MX सर्वर सुरक्षा डिले
      }
    }

    self.postMessage({ type: "ALL_VERIFIED" });
  }
};