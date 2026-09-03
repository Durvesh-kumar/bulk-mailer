// src/lib/harvester/emailValidator.ts
import dns from "dns/promises";

// 🛑 डिस्पोजेबल और फ़र्ज़ी ईमेल डोमेन
const DISPOSABLE_DOMAINS = new Set([
  "tempmail.com", "guerrillamail.com", "mailinator.com",
  "10minutemail.com", "throwawaymail.com", "temp-mail.org",
  "example.com", "domain.com", "email.com", "wixpress.com", "sentry.io"
]);

// 🛑 बेकार सिस्टम प्रीफिक्स जिन्हें मेल नहीं भेजना
const BLOCKED_PREFIXES = [
  "noreply", "no-reply", "donotreply", "abuse", "postmaster", 
  "hostmaster", "privacy", "legal", "security", "jobs", "careers"
];

/**
 * ⚡ टाइमआउट के साथ MX रिकॉर्ड चेक करने का हेल्पर
 */
async function checkDomainMxWithTimeout(domain: string, timeoutMs: number = 3000): Promise<boolean> {
  try {
    const lookupPromise = dns.resolveMx(domain);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DNS MX Timeout")), timeoutMs)
    );

    // दोनों में से जो पहले पूरा हो
    const mxRecords = await Promise.race([lookupPromise, timeoutPromise]);
    
    // चेक करें कि कम से कम 1 एक्टिव मेल एक्सचेंज सर्वर मौजूद हो
    return Boolean(mxRecords && mxRecords.length > 0 && mxRecords.some((r) => r.exchange));
  } catch (err) {
    // DNS नहीं मिला, सर्वर डाउन है या टाइमआउट हो गया
    return false;
  }
}

/**
 * 📧 मुख्य ईमेल वैलिडेशन फ़ंक्शन
 */
export async function verifyEmailHealth(email: string): Promise<boolean> {
  let cleanEmail = "";
  try {
    cleanEmail = decodeURIComponent(email).replace(/%20|\s+/g, "").trim().toLowerCase();
  } catch (_) {
    cleanEmail = email.replace(/%20|\s+/g, "").trim().toLowerCase();
  }

  // 1. सिंटेक्स वैलिडेशन (.com, .org, आदि)
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(cleanEmail)) return false;

  const [username, domain] = cleanEmail.split("@");
  if (!domain || DISPOSABLE_DOMAINS.has(domain)) return false;

  // 2. जंक प्रीफिक्स चेक
  if (BLOCKED_PREFIXES.some((prefix) => username === prefix || cleanEmail.startsWith(prefix))) {
    return false;
  }

  // 3. 🌐 लाइव DNS MX रिकॉर्ड चेक (Active/Inactive)
  const isMxActive = await checkDomainMxWithTimeout(domain, 3500);
  return isMxActive;
}