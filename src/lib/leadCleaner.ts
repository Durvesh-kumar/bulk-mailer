// src/lib/leadCleaner.ts

// 1. केवल असली डिस्पोज़ेबल / 10-मिनट अस्थायी इनबॉक्स
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
  "burnermail.io",
]);

// 2. डमी और प्लेसहोल्डर डोमेन (जहाँ कभी असली मेल नहीं होती)
const DUMMY_PLACEHOLDER_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "domain.com",
  "yourdomain.com",
  "sample.com",
  "test.com",
  "site.com",
  "company.com",
  "mycompany.com",
  "website.com",
  "fake.com",
]);

// 3. केवल सटीक टेम्पलेट प्लेसहोल्डर ईमेल्स (पूरा email.com डोमेन ब्लॉक नहीं होगा)
const DUMMY_EXACT_EMAILS = new Set([
  "info@email.com",
  "user@email.com",
  "test@email.com",
  "sample@email.com",
  "name@email.com",
  "youremail@email.com",
  "email@email.com",
  "admin@email.com",
  "contact@email.com",
  "support@email.com",
  "john.doe@example.com",
]);

// इमेज या वेब एसेट एक्सटेंशन जो गलती से स्क्रैप हो जाते हैं
const JUNK_ASSET_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|ttf|ico|bmp)$/i;

// सख्त Regex: सही ईमेल स्ट्रक्चर के लिए
const EMAIL_STRICT_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export interface RejectedEmailItem {
  email: string;
  reason: "INVALID_SYNTAX" | "DUPLICATE" | "DISPOSABLE_DOMAIN" | "DUMMY_DOMAIN" | "NO_MX_RECORD" | string;
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
  dummyCount: number;
  noMxCount: number;
  rejectedList: RejectedEmailItem[];
}

// ⚡ 1. रिपेयर और सैनिटाइज फंक्शन (कचरा हटाकर डेटा को रिकवर करना)
export function sanitizeEmailString(rawInput: string): string | null {
  if (!rawInput) return null;

  let cleaned = rawInput.trim();

  // mailto: प्रीफिक्स हटाएं
  cleaned = cleaned.replace(/^mailto:/i, "");

  // एंगल ब्रैकेट्स हटाएं: "Name" <user@domain.com> -> user@domain.com
  const angleMatch = cleaned.match(/<([^>]+)>/);
  if (angleMatch) {
    cleaned = angleMatch[1].trim();
  }

  // स्क्रैपिंग के दौरान चिपका हुआ .read, .comread, .netread आदि हटाएं
  cleaned = cleaned.replace(/\.(com|net|org|io|co|biz|info)read$/i, ".$1");
  cleaned = cleaned.replace(/\.read$/i, "");
  cleaned = cleaned.replace(/[\/\\]+$/, ""); // आख़िरी स्लैश हटाएं
  cleaned = cleaned.replace(/[.,;:]+$/, ""); // आख़िरी पंक्चुएशन हटाएं

  // शुद्ध ईमेल पैटर्न निकालें
  const emailMatch = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (!emailMatch) return null;

  let finalEmail = emailMatch[0].toLowerCase().trim();

  // इमेज या एसेट एक्सटेंशन बाहर करें
  if (JUNK_ASSET_EXTENSIONS.test(finalEmail)) {
    return null;
  }

  return EMAIL_STRICT_REGEX.test(finalEmail) ? finalEmail : null;
}

// =========================================================================
// 2. सिंक्रोनस मेथड (100% क्लाइंट-सेफ, सुपर फास्ट)
// =========================================================================
export function cleanAndFilterLeads(rawInput: string): CleanLeadsResult {
  const lines = rawInput.split(/[\n,;\t]+/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const validEmails: string[] = [];
  const rejectedList: RejectedEmailItem[] = [];

  let duplicatesCount = 0;
  let syntaxErrorsCount = 0;
  let disposableCount = 0;
  let dummyCount = 0;

  for (const raw of lines) {
    const email = sanitizeEmailString(raw);

    if (!email) {
      syntaxErrorsCount++;
      rejectedList.push({
        email: raw,
        reason: "INVALID_SYNTAX",
        description: "Invalid email syntax, malformed structure or junk asset",
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

    if (domain.includes("..") || domain.startsWith("-") || domain.endsWith("-") || !domain.includes(".")) {
      syntaxErrorsCount++;
      rejectedList.push({
        email: raw,
        reason: "INVALID_SYNTAX",
        description: "Invalid characters or format in domain name",
      });
      continue;
    }

    // 1. डिस्पोजेबल ईमेल चेक
    if (DISPOSABLE_DOMAINS.has(domain)) {
      disposableCount++;
      rejectedList.push({
        email: raw,
        reason: "DISPOSABLE_DOMAIN",
        description: "Disposable temporary mailbox blocked",
      });
      continue;
    }

    // 2. डमी डोमेन या सटीक डमी टेम्पलेट ईमेल चेक
    if (DUMMY_PLACEHOLDER_DOMAINS.has(domain) || DUMMY_EXACT_EMAILS.has(email)) {
      dummyCount++;
      rejectedList.push({
        email: raw,
        reason: "DUMMY_DOMAIN",
        description: "Placeholder dummy domain or template rejected",
      });
      continue;
    }

    // 3. डुप्लीकेट चेक
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
    dummyCount,
    noMxCount: 0,
    rejectedList,
  };
}