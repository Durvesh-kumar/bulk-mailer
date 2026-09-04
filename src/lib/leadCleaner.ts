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
  reason: "INVALID_SYNTAX" | "DUPLICATE" | "DISPOSABLE_DOMAIN" | "NO_MX_RECORD" | string;
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
// 2. आपका सिंक्रोनस मेथड (ब्राउज़र / क्लाइंट के लिए 100% सेफ - नो बंडल एरर)
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