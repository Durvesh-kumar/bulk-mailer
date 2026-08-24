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

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export interface RejectedEmailItem {
  email: string;
  reason: "INVALID_SYNTAX" | "DUPLICATE" | "DISPOSABLE_DOMAIN";
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
  rejectedList: RejectedEmailItem[];
}

export function cleanAndFilterLeads(rawInput: string): CleanLeadsResult {
  const lines = rawInput.split(/[\n,;\t]+/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const validEmails: string[] = [];
  const rejectedList: RejectedEmailItem[] = [];

  let duplicatesCount = 0;
  let syntaxErrorsCount = 0;
  let disposableCount = 0;

  for (const raw of lines) {
    if (/\s/.test(raw)) {
      syntaxErrorsCount++;
      rejectedList.push({
        email: raw,
        reason: "INVALID_SYNTAX",
        description: "Email contains unexpected whitespace",
      });
      continue;
    }

    const email = raw.toLowerCase();

    if (!EMAIL_REGEX.test(email)) {
      syntaxErrorsCount++;
      rejectedList.push({
        email: raw,
        reason: "INVALID_SYNTAX",
        description: "Invalid email syntax or format",
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

    const domain = email.split("@")[1];
    if (DISPOSABLE_DOMAINS.has(domain)) {
      disposableCount++;
      rejectedList.push({
        email: raw,
        reason: "DISPOSABLE_DOMAIN",
        description: "Disposable/temporary mail domain blocked",
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
    rejectedList,
  };
}