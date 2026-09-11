// src/lib/leadCleaner.ts
import punycode from "punycode";

// 🛑 डिस्पोज़ेबल / अस्थायी डोमेन की विस्तृत लिस्ट
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com",
  "yopmail.com", "sharklasers.com", "throwawaymail.com", "getairmail.com",
  "temp-mail.org", "dispostable.com", "burnermail.io", "trashmail.com",
  "dropmail.me", "crazymailing.com", "guerrillamailblock.com", "pokemail.net",
  "inboxkitten.com", "tempail.com", "fakeinbox.com", "mytemp.email", "mohmal.com",
  "nada.ltd", "guerrillamail.biz", "guerrillamail.de", "guerrillamail.net"
]);

// 🛑 डमी और टेस्ट डोमेन
const DUMMY_DOMAINS = new Set([
  "example.com", "example.org", "example.net", "domain.com", "yourdomain.com",
  "sample.com", "test.com", "site.com", "company.com", "mycompany.com",
  "website.com", "fake.com", "domainname.com", "invalid.com", "testing.com",
  "email.com", "gmail.con", "yahoo.con", "hotmail.con"
]);

// 🛑 टाइपो डोमेन (जो सीधे 550 बाउंस कराते हैं)
const TYPO_DOMAINS = new Set([
  "gnail.com", "gmial.com", "gmai.com", "gamil.com", "gmaill.com", "gmal.com",
  "yaho.com", "yaho.co", "yahhoo.com", "yahoogroups.com",
  "hotmial.com", "hotmail.co", "hotmaill.com",
  "outlok.com", "outlook.co", "outllok.com"
]);

// 🛑 प्लेसहोल्डर और डमी ईमेल
const DUMMY_EXACT_EMAILS = new Set([
  "info@email.com", "user@email.com", "test@email.com", "sample@email.com",
  "name@email.com", "youremail@email.com", "email@email.com",
  "admin@email.com", "contact@email.com", "support@email.com",
  "john.doe@example.com", "admin@gmail.com", "test@gmail.com"
]);

// 🛑 रोल-बेस्ड ईमेल (स्पैम ट्रैप व बाउंस रोकने के लिए)
const EXCLUDE_PREFIXES = new Set([
  "sales", "support", "noreply", "no-reply", "help", "info", "admin",
  "contact", "billing", "marketing", "office", "postmaster", "hostmaster"
]);

// RFC 5322 सख्त Regex
const STRICT_EMAIL_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;

// 🛑 category फ़ील्ड को यहाँ शामिल किया गया है ताकि TypeScript का टाइप एरर पूरी तरह ठीक हो जाए
export interface RejectedEmailItem {
  email: string;
  reason: string;
  category?: "SYNTAX_ERROR" | "DUPLICATE" | "DISPOSABLE" | "DUMMY" | "MX_FAILED";
  description?: string;
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
  rejectedList: RejectedEmailItem[];
}

export function sanitizeEmailString(rawInput: string): string | null {
  if (!rawInput || typeof rawInput !== "string") return null;

  // छिपे हुए यूनिकोड व स्पेस हटाएं
  let str = rawInput.replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toLowerCase();
  str = str.replace(/^mailto:/i, "");

  // एंगल ब्रैकेट (<user@domain.com>) निकालें
  const angleMatch = str.match(/<([^>]+)>/);
  if (angleMatch) str = angleMatch[1].trim();

  // ट्रेलिंग एक्सटेंशन हटाएं
  str = str.replace(/\.(read|best|leasing|investors|combest)$/i, "");

  // 🛑 553 / 501 सुरक्षा: www. से शुरू होने वाले या डबल डॉट वाले ईमेल रिजेक्ट करें
  if (str.startsWith("www.") || str.includes("..") || str.includes(" ")) {
    return null;
  }

  // ईमेल पैटर्न ढूंढें
  const match = str.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (!match) return null;

  const candidate = match[0].trim();

  // लोकल और डोमेन पार्ट के आगे-पीछे डॉट न हो
  const [localPart, domainPart] = candidate.split("@");
  if (!localPart || !domainPart) return null;
  if (localPart.startsWith(".") || localPart.endsWith(".")) return null;
  if (domainPart.startsWith(".") || domainPart.endsWith(".")) return null;

  return STRICT_EMAIL_REGEX.test(candidate) ? candidate : null;
}

function isDomainBlocked(domain: string, blocklist: Set<string>): boolean {
  try {
    const asciiDomain = punycode.toASCII(domain.toLowerCase());
    if (blocklist.has(asciiDomain)) return true;

    const parts = asciiDomain.split(".");
    if (parts.length > 2) {
      const rootDomain = parts.slice(-2).join(".");
      if (blocklist.has(rootDomain)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function cleanAndFilterLeads(rawInput: string): CleanLeadsResult {
  if (!rawInput || !rawInput.trim()) {
    return {
      cleanedText: "",
      validEmails: [],
      totalRaw: 0,
      validCount: 0,
      rejectedCount: 0,
      duplicatesCount: 0,
      syntaxErrorsCount: 0,
      disposableCount: 0,
      dummyCount: 0,
      rejectedList: [],
    };
  }

  const tokens = rawInput
    .split(/[\r\n,;\t ]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const validEmails: string[] = [];
  const rejectedList: RejectedEmailItem[] = [];

  let duplicatesCount = 0;
  let syntaxErrorsCount = 0;
  let disposableCount = 0;
  let dummyCount = 0;

  for (const raw of tokens) {
    if (!raw.includes("@")) {
      syntaxErrorsCount++;
      rejectedList.push({
        email: raw,
        reason: "INVALID_SYNTAX",
        category: "SYNTAX_ERROR",
        description: "Missing '@' symbol",
      });
      continue;
    }

    const email = sanitizeEmailString(raw);
    if (!email) {
      syntaxErrorsCount++;
      rejectedList.push({
        email: raw,
        reason: "INVALID_SYNTAX",
        category: "SYNTAX_ERROR",
        description: "Invalid format (starts with 'www.', consecutive dots, or invalid symbols)",
      });
      continue;
    }

    const [userPart, domainRaw] = email.split("@");
    const cleanUserPart = userPart.toLowerCase().trim();

    let domain = "";
    try {
      domain = punycode.toASCII(domainRaw.toLowerCase().trim());
    } catch {
      syntaxErrorsCount++;
      rejectedList.push({
        email: raw,
        reason: "INVALID_SYNTAX",
        category: "SYNTAX_ERROR",
        description: "Invalid domain punycode encoding",
      });
      continue;
    }

    // डोमेन और TLD की RFC वैधता जांच
    const domainParts = domain.split(".");
    const tld = domainParts[domainParts.length - 1];

    if (
      !domain ||
      !cleanUserPart ||
      cleanUserPart.length > 64 ||
      domain.length > 255 ||
      domainParts.length < 2 ||
      tld.length < 2 ||
      /^[0-9]+$/.test(tld)
    ) {
      syntaxErrorsCount++;
      rejectedList.push({
        email: raw,
        reason: "INVALID_SYNTAX",
        category: "SYNTAX_ERROR",
        description: "Domain or TLD violates RFC standards",
      });
      continue;
    }

    // रोल-बेस्ड ईमेल जांच
    if (EXCLUDE_PREFIXES.has(cleanUserPart)) {
      dummyCount++;
      rejectedList.push({
        email: raw,
        reason: "DUMMY_DOMAIN",
        category: "DUMMY",
        description: "Role-based address filtered out (info, sales, admin, etc.)",
      });
      continue;
    }

    // टाइपो डोमेन जांच (550 बाउंस रोकने के लिए)
    if (TYPO_DOMAINS.has(domain)) {
      dummyCount++;
      rejectedList.push({
        email: raw,
        reason: "DUMMY_DOMAIN",
        category: "DUMMY",
        description: `Common typo domain rejected: @${domain}`,
      });
      continue;
    }

    // डिस्पोज़ेबल डोमेन जांच
    if (isDomainBlocked(domain, DISPOSABLE_DOMAINS)) {
      disposableCount++;
      rejectedList.push({
        email: raw,
        reason: "DISPOSABLE_DOMAIN",
        category: "DISPOSABLE",
        description: "Disposable or temporary mailbox rejected",
      });
      continue;
    }

    // डमी डोमेन या डमी ईमेल जांच
    if (isDomainBlocked(domain, DUMMY_DOMAINS) || DUMMY_EXACT_EMAILS.has(email)) {
      dummyCount++;
      rejectedList.push({
        email: raw,
        reason: "DUMMY_DOMAIN",
        category: "DUMMY",
        description: "Placeholder or test email rejected",
      });
      continue;
    }

    // डुप्लीकेट ईमेल जांच
    const normalizedEmail = email.toLowerCase();
    if (seen.has(normalizedEmail)) {
      duplicatesCount++;
      rejectedList.push({
        email: raw,
        reason: "DUPLICATE",
        category: "DUPLICATE",
        description: "Duplicate email address found",
      });
      continue;
    }

    seen.add(normalizedEmail);
    validEmails.push(normalizedEmail);
  }

  return {
    cleanedText: validEmails.join("\n"),
    validEmails,
    totalRaw: tokens.length,
    validCount: validEmails.length,
    rejectedCount: rejectedList.length,
    duplicatesCount,
    syntaxErrorsCount,
    disposableCount,
    dummyCount,
    rejectedList,
  };
}