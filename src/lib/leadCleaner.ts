// src/lib/leadCleaner.ts

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
  "sharklasers.com",
  "throwawaymail.com",
  "getairmail.com",
  "temp-mail.org",
  "dispostable.com",
]);

// सख्त Regex: शुरू में ^ और अंत में $ दोनों मौजूद हैं
const EMAIL_STRICT_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export interface RejectedEmailItem {
  email: string;
  reason: "INVALID_SYNTAX" | "DUPLICATE" | "DISPOSABLE_DOMAIN" | "NO_MX_RECORD";
  description: string;
}

export interface CleanLeadsResult {
  cleanedText: string;
  validEmails: string[];
  totalRaw: number;
  validCount: number;
  rejectedCount: number;
  duplicatesCount: number;
  syntaxErrorsCount: number;
  disposableCount: number;
  noMxCount: number;
  rejectedList: RejectedEmailItem[];
}

// ⚡ 1. रिपेयर और सैनिटाइज फंक्शन (कीमती डेटा को फेंकने के बजाय पहले ठीक करें)
export function sanitizeEmailString(rawInput: string): string | null {
  if (!rawInput) return null;

  let cleaned = rawInput.trim();

  // एंगल ब्रैकेट्स हटाएं: "Name" <user@domain.com> -> user@domain.com
  const angleMatch = cleaned.match(/<([^>]+)>/);
  if (angleMatch) {
    cleaned = angleMatch[1].trim();
  }

  // पीछे चिपका हुआ .read या .comread हटाएं
  cleaned = cleaned.replace(/\.read$/i, "");
  cleaned = cleaned.replace(/\.comread$/i, ".com");

  // शुद्ध ईमेल मैच निकालें
  const emailMatch = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (!emailMatch) return null;

  let finalEmail = emailMatch[0].toLowerCase().trim();

  if (finalEmail.endsWith(".read")) {
    finalEmail = finalEmail.replace(/\.read$/, "");
  }

  return EMAIL_STRICT_REGEX.test(finalEmail) ? finalEmail : null;
}

// =========================================================================
// 2. आपका सिंक्रोनस मेथड (ब्राउज़र / फ्रंटएंड के लिए 100% सेफ - नो DNS क्रैश)
// =========================================================================
export function cleanAndFilterLeads(rawInput: string): CleanLeadsResult {
  const lines = rawInput.split(/[\n,;\t]+/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const validEmails: string[] = [];
  const rejectedList: RejectedEmailItem[] = [];

  let duplicatesCount = 0;
  let syntaxErrorsCount = 0;
  let disposableCount = 0;

  for (const raw of lines) {
    // ⚡ सीधे रिजेक्ट करने के बजाय पहले .read और कचरा साफ़ करें
    const email = sanitizeEmailString(raw);

    if (!email) {
      syntaxErrorsCount++;
      rejectedList.push({
        email: raw,
        reason: "INVALID_SYNTAX",
        description: "Invalid email syntax or corrupt structure",
      });
      continue;
    }

    const domainParts = email.split("@");
    if (domainParts.length !== 2) {
      syntaxErrorsCount++;
      rejectedList.push({
        email: raw,
        reason: "INVALID_SYNTAX",
        description: "Malformed domain structure",
      });
      continue;
    }

    const domain = domainParts[1];

    if (domain.includes("..") || domain.startsWith("-") || domain.endsWith("-")) {
      syntaxErrorsCount++;
      rejectedList.push({
        email: raw,
        reason: "INVALID_SYNTAX",
        description: "Invalid characters in domain name",
      });
      continue;
    }

    if (DISPOSABLE_DOMAINS.has(domain)) {
      disposableCount++;
      rejectedList.push({
        email: raw,
        reason: "DISPOSABLE_DOMAIN",
        description: "Disposable temporary mailbox blocked",
      });
      continue;
    }

    if (seen.has(email)) {
      duplicatesCount++;
      rejectedList.push({
        email: raw,
        reason: "DUPLICATE",
        description: "Duplicate email found in batch",
      });
      continue;
    }

    seen.add(email);
    validEmails.push(email);
  }

  return {
    cleanedText: validEmails.join("\n"),
    validEmails,
    totalRaw: lines.length,
    validCount: validEmails.length,
    rejectedCount: rejectedList.length,
    duplicatesCount,
    syntaxErrorsCount,
    disposableCount,
    noMxCount: 0,
    rejectedList,
  };
}

// =========================================================================
// 3. DNS MX कैशे और बैकएंड मेथड (सिर्फ सर्वर/API पर चलेगा, Vercel-सेफ)
// =========================================================================
const domainMxCache = new Map<string, boolean>();

export async function resolveMxWithTimeout(domain: string, timeoutMs = 2500): Promise<boolean> {
  if (domainMxCache.has(domain)) {
    return domainMxCache.get(domain)!;
  }

  try {
    // ⚡ Dynamic Import: इससे फ्रंटएंड बंडल में DNS इम्पोर्ट होने का डर खत्म
    const dns = await import("dns");

    const dnsPromise = dns.promises.resolveMx(domain)
      .then((records) => Boolean(records && records.length > 0))
      .catch(() => false);

    const timeoutPromise = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), timeoutMs)
    );

    const isValid = await Promise.race([dnsPromise, timeoutPromise]);
    domainMxCache.set(domain, isValid);
    return isValid;
  } catch {
    domainMxCache.set(domain, false);
    return false;
  }
}

export async function cleanAndFilterLeadsWithDns(rawInput: string): Promise<CleanLeadsResult> {
  const initialResult = cleanAndFilterLeads(rawInput);
  
  const finalValidEmails: string[] = [];
  const rejectedList: RejectedEmailItem[] = [...initialResult.rejectedList];
  let noMxCount = 0;

  // 15-15 के बैच में चंकिंग (Vercel 60s के अंदर 2000 डेटा आसानी से प्रोसेस होगा)
  const BATCH_SIZE = 15;
  for (let i = 0; i < initialResult.validEmails.length; i += BATCH_SIZE) {
    const batch = initialResult.validEmails.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (email) => {
        const domain = email.split("@")[1];
        const hasMx = await resolveMxWithTimeout(domain);

        if (hasMx) {
          finalValidEmails.push(email);
        } else {
          noMxCount++;
          rejectedList.push({
            email,
            reason: "NO_MX_RECORD",
            description: "Domain does not exist or has no active mail server (NXDOMAIN)",
          });
        }
      })
    );
  }

  return {
    cleanedText: finalValidEmails.join("\n"),
    validEmails: finalValidEmails,
    totalRaw: initialResult.totalRaw,
    validCount: finalValidEmails.length,
    rejectedCount: rejectedList.length,
    duplicatesCount: initialResult.duplicatesCount,
    syntaxErrorsCount: initialResult.syntaxErrorsCount,
    disposableCount: initialResult.disposableCount,
    noMxCount,
    rejectedList,
  };
}