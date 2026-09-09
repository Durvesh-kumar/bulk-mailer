import punycode from "punycode";

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com","tempmail.com","10minutemail.com","guerrillamail.com",
  "yopmail.com","sharklasers.com","throwawaymail.com","getairmail.com",
  "temp-mail.org","dispostable.com","burnermail.io","trashmail.com",
  "dropmail.me","crazymailing.com","guerrillamailblock.com","pokemail.net",
  "inboxkitten.com"
]);

const DUMMY_DOMAINS = new Set([
  "example.com","example.org","example.net","domain.com","yourdomain.com",
  "sample.com","test.com","site.com","company.com","mycompany.com",
  "website.com","fake.com","domainname.com"
]);

const DUMMY_EXACT_EMAILS = new Set([
  "info@email.com","user@email.com","test@email.com","sample@email.com",
  "name@email.com","youremail@email.com","email@email.com",
  "admin@email.com","contact@email.com","support@email.com",
  "john.doe@example.com",
]);

// Toggle: filter out generic inboxes or keep them
const FILTER_GENERIC_INBOXES = false;
const EXCLUDE_PREFIXES = new Set(["sales","support","noreply","no-reply","help","info"]);

const STRICT_EMAIL_REGEX =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export interface RejectedEmailItem {
  email: string;
  reason: "INVALID_SYNTAX" | "DUPLICATE" | "DISPOSABLE_DOMAIN" | "DUMMY_DOMAIN";
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
  rejectedList: RejectedEmailItem[];
}

export function sanitizeEmailString(rawInput: string): string | null {
  if (!rawInput || typeof rawInput !== "string") return null;
  let str = rawInput.replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toLowerCase();
  str = str.replace(/^mailto:/i, "");
  const angleMatch = str.match(/<([^>]+)>/);
  if (angleMatch) str = angleMatch[1].trim();

  // Strip common trailing artifacts
  str = str.replace(/\.(read|best|leasing|investors|combest)$/i, "");

  // Extract first valid email substring
  const match = str.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (!match) return null;

  const candidate = match[0].trim(); // ✅ only return the matched email
  return STRICT_EMAIL_REGEX.test(candidate) ? candidate : null;
}

function isDomainBlocked(domain: string, blocklist: Set<string>): boolean {
  const asciiDomain = punycode.toASCII(domain.toLowerCase());
  if (blocklist.has(asciiDomain)) return true;
  const parts = asciiDomain.split(".");
  if (parts.length > 2) {
    const rootDomain = parts.slice(-2).join(".");
    if (blocklist.has(rootDomain)) return true;
  }
  return false;
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

  const tokens = rawInput.split(/[\r\n,;\t ]+/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const validEmails: string[] = [];
  const rejectedList: RejectedEmailItem[] = [];

  let duplicatesCount = 0;
  let syntaxErrorsCount = 0;
  let disposableCount = 0;
  let dummyCount = 0;

  for (const raw of tokens) {
    if (!raw.includes("@")) continue;
    const email = sanitizeEmailString(raw);
    if (!email) {
      syntaxErrorsCount++;
      rejectedList.push({ email: raw, reason: "INVALID_SYNTAX", description: "Invalid email syntax" });
      continue;
    }

    const [userPart, domainRaw] = email.split("@");
    const cleanUserPart = userPart.toLowerCase().trim();
    const domain = punycode.toASCII(domainRaw.toLowerCase());

    if (!domain || !userPart || domain.includes("..") || domain.startsWith("-") || domain.endsWith("-") || !domain.includes(".")) {
      syntaxErrorsCount++;
      rejectedList.push({ email: raw, reason: "INVALID_SYNTAX", description: "Invalid domain or username" });
      continue;
    }

    // Optional: filter out generic inboxes
    if (FILTER_GENERIC_INBOXES && EXCLUDE_PREFIXES.has(cleanUserPart)) {
      dummyCount++;
      rejectedList.push({ email, reason: "DUMMY_DOMAIN", description: "Generic inbox filtered out" });
      continue;
    }

    if (isDomainBlocked(domain, DISPOSABLE_DOMAINS)) {
      disposableCount++;
      rejectedList.push({ email, reason: "DISPOSABLE_DOMAIN", description: "Disposable/temporary inbox rejected" });
      continue;
    }

    if (isDomainBlocked(domain, DUMMY_DOMAINS) || DUMMY_EXACT_EMAILS.has(email)) {
      dummyCount++;
      rejectedList.push({ email, reason: "DUMMY_DOMAIN", description: "Dummy/placeholder email" });
      continue;
    }

    const normalizedEmail = email.toLowerCase();
    if (seen.has(normalizedEmail)) {
      duplicatesCount++;
      rejectedList.push({ email, reason: "DUPLICATE", description: "Duplicate email found" });
      continue;
    }

    seen.add(normalizedEmail);
    validEmails.push(normalizedEmail);
  }

  return {
    cleanedText: validEmails.join("\n"),
    validEmails,
    totalRaw: tokens.filter((t) => t.includes("@")).length,
    validCount: validEmails.length,
    rejectedCount: rejectedList.length,
    duplicatesCount,
    syntaxErrorsCount,
    disposableCount,
    dummyCount,
    rejectedList,
  };
}