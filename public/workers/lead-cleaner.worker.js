// public/workers/lead-cleaner.worker.js

let isCancelled = false;

// 🛑 लोकल प्री-फ़िल्टर: www., स्पेस और अमान्य सिंटैक्स बिना नेटवर्क कॉल के तुरंत पकड़े जाएँ
const isValidLocalFormat = (email) => {
  const clean = String(email || "").trim().toLowerCase();
  if (clean.startsWith("www.") || clean.includes("..") || clean.includes(" ")) return false;
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,63})@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/.test(clean);
};

self.onmessage = async (e) => {
  const { action, payload } = e.data;

  if (action === "CANCEL") {
    isCancelled = true;
    self.postMessage({ type: "CANCELLED" });
    return;
  }

  if (action === "START_VERIFY") {
    isCancelled = false;
    const { emails = [], chunkSize = 5 } = payload;
    const total = emails.length;
    let processed = 0;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let i = 0; i < total; i += chunkSize) {
      if (isCancelled) break;

      const chunk = emails.slice(i, i + chunkSize);

      // 🛡️ हर ईमेल को अलग-अलग प्रोसेस करें (एक फेल होने पर पूरा बैच प्रभावित न हो)
      const batchPromises = chunk.map(async (rawEmail) => {
        const email = String(rawEmail || "").trim();

        // 1. लोकल सिंटैक्स प्री-चेक
        if (!isValidLocalFormat(email)) {
          return {
            email,
            valid: false,
            status: email.toLowerCase().startsWith("www.") ? "INVALID_SYNTAX_WWW" : "INVALID_SYNTAX",
            category: "SYNTAX_ERROR",
            message: email.toLowerCase().startsWith("www.")
              ? "Email contains invalid 'www.' prefix"
              : "Invalid email syntax format",
          };
        }

        // 2. बैकएंड डीएनएस/एमएक्स वेरिफिकेशन कॉल
        try {
          const res = await fetch("/api/verify-dns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });

          const data = await res.json().catch(() => ({}));

          if (res.ok && data.valid === true) {
            return {
              email: data.email || email,
              valid: true,
              status: data.status || "HAS_MX",
              category: undefined,
              message: data.dnsSummary || data.message || "Valid MX records and reachable host",
            };
          } else {
            // 400 या अमान्य परिणाम: केवल यही ईमेल रिजेक्ट होगा
            return {
              email: data.email || email,
              valid: false,
              status: data.status || (res.status === 400 ? "BAD_REQUEST" : "SERVER_ERROR"),
              category: "MX_FAILED",
              message: data.message || "Domain failed DNS/MX verification",
            };
          }
        } catch (netErr) {
          // नेटवर्क ड्रॉप या सॉकेट टाइमआउट
          return {
            email,
            valid: false,
            status: "DNS_TIMEOUT",
            category: "MX_FAILED",
            message: netErr?.message || "DNS lookup request timed out or connection dropped",
          };
        }
      });

      // 🛑 Promise.allSettled सुनिश्चित करता है कि एक फ़ेल होने पर पूरा चंक न गिरे
      const settledResults = await Promise.allSettled(batchPromises);

      const chunkResults = settledResults.map((item, idx) => {
        if (item.status === "fulfilled") {
          return item.value;
        }
        // बैकअप फ़ॉलबैक यदि कोई प्रॉमिस अनहैंडल्ड रिजेक्ट हो जाए
        return {
          email: chunk[idx],
          valid: false,
          status: "INTERNAL_ERROR",
          category: "MX_FAILED",
          message: "Internal worker execution error on item",
        };
      });

      processed += chunk.length;

      // 📡 प्रोग्रेस और नतीजे UI को तुरंत भेजें
      self.postMessage({
        type: "CHUNK_PROCESSED",
        processedSoFar: Math.min(processed, total),
        total,
        results: chunkResults,
      });

      // डीएनएस सर्वर को ओवरलोड से बचाने के लिए सुरक्षित डिले
      if (i + chunkSize < total && !isCancelled) {
        await sleep(350);
      }
    }

    if (!isCancelled) {
      self.postMessage({ type: "ALL_VERIFIED" });
    }
  }
};