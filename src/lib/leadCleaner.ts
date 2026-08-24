// src/lib/leadCleaner.ts

export const GREETINGS = ["Hi,", "Hello,", "Hey,", "Hi there,"];

export const OPENERS = [
  "Hope you are having a productive week.",
  "Hope this note finds you well.",
  "Hope everything is going well on your end.",
  "Reaching out to quickly connect.",
];

export const SIGN_OFFS = [
  "Best regards,",
  "Thanks & regards,",
  "Warm regards,",
  "Best,",
  "Thanks,",
];

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

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

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
  const lines = rawInput.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const validEmails: string[] = [];
  const rejectedList: RejectedEmailItem[] = [];

  let duplicatesCount = 0;
  let syntaxErrorsCount = 0;
  let disposableCount = 0;

  for (const raw of lines) {
    const email = raw.toLowerCase();

    if (!EMAIL_REGEX.test(email)) {
      syntaxErrorsCount++;
      rejectedList.push({
        email: raw,
        reason: "INVALID_SYNTAX",
        description: "Invalid syntax format or illegal characters",
      });
      continue;
    }

    if (seen.has(email)) {
      duplicatesCount++;
      rejectedList.push({
        email: raw,
        reason: "DUPLICATE",
        description: "Duplicate recipient in this campaign batch",
      });
      continue;
    }

    const domain = email.split("@")[1];
    if (DISPOSABLE_DOMAINS.has(domain)) {
      disposableCount++;
      rejectedList.push({
        email: raw,
        reason: "DISPOSABLE_DOMAIN",
        description: "Disposable or temporary mail domain detected",
      });
      continue;
    }

    seen.add(email);
    validEmails.push(raw);
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

const pickRandom = (arr: string[]): string => arr[Math.floor(Math.random() * arr.length)];

export function generateBackendMatchedVariation(
  template: string,
  subject: string,
  senderName: string,
  customSignoffName: string
): { subject: string; body: string } {
  const cleanHeaderName = (senderName || "Ruby").trim();
  const finalSignoffName =
    customSignoffName && customSignoffName.trim().length > 0
      ? customSignoffName.trim()
      : cleanHeaderName;

  const cleanUserBody = template
    .trim()
    .replace(/^(hi|hello|hey|greetings|dear)[^\n]*\n+/i, "")
    .replace(
      /^(hope this note finds you well|hope you are having a productive week|hope you are doing well|hope everything is going well|reaching out to quickly connect)[^\n]*\n+/i,
      ""
    )
    .trim();

  // Spintax inline regex resolver for custom user brackets {OptionA|OptionB}
  const spintaxRegex = /\{([^{}]+)\}/g;
  let resolvedBody = cleanUserBody;
  while (spintaxRegex.test(resolvedBody)) {
    resolvedBody = resolvedBody.replace(spintaxRegex, (_, match) => {
      const choices = match.split("|");
      return choices[Math.floor(Math.random() * choices.length)];
    });
  }

  let resolvedSubject = subject.trim() || "(No Subject)";
  while (spintaxRegex.test(resolvedSubject)) {
    resolvedSubject = resolvedSubject.replace(spintaxRegex, (_, match) => {
      const choices = match.split("|");
      return choices[Math.floor(Math.random() * choices.length)];
    });
  }

  const randomGreeting = pickRandom(GREETINGS);
  const randomOpener = pickRandom(OPENERS);
  const randomSignOff = pickRandom(SIGN_OFFS);

  const fullEmailText = `${randomGreeting}\n\n${randomOpener}\n\n${resolvedBody || "(Your message body will appear here)"}\n\n${randomSignOff}\n\n${finalSignoffName}`;

  return {
    subject: resolvedSubject,
    body: fullEmailText,
  };
}