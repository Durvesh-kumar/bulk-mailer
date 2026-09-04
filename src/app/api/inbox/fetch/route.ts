// src/app/api/inbox/fetch/route.ts
import { NextResponse } from "next/server";
import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";
import { decryptPassword } from "@/lib/encryption";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function enforceSecurity(req: Request, machineId?: string, sessionToken?: string) {
  const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";
  const clientDomain = hostHeader.split(":")[0].toLowerCase().trim();

  const guard = await verifyLicenseAndDevice(clientDomain, machineId, sessionToken);
  if (!guard.ok || !guard.machineId) {
    return {
      allowed: false,
      error: `Access Denied: ${guard.error || "Invalid license or device mismatch."}`,
      status: guard.reason === "NEW_DEVICE" ? 401 : 403,
    };
  }

  const resolvedUserId = String(guard.licenseId || guard.userId || clientDomain);
  return { allowed: true, machineId: guard.machineId, sessionToken: guard.sessionToken, userId: resolvedUserId };
}

// 🛑 सिस्टम, बाउंस (Mailer-Daemon), थर्ड पार्टी (Google, Apollo, MongoDB) और वार्म-अप मेल्स को फ़िल्टर करने वाला फ़ंक्शन
function isSystemOrIgnoredMail(
  fromAddress: string, 
  fromName: string, 
  subject: string, 
  bodyText: string, 
  htmlText: string
): boolean {
  const from = (fromAddress || "").toLowerCase();
  const name = (fromName || "").toLowerCase();
  const sub = (subject || "").toLowerCase();
  const text = (bodyText || "").toLowerCase();
  const html = (htmlText || "").toLowerCase();

  // 1. बाउंस और डिलीवरी फेलियर नोटिफिकेशन्स (Address not found / Mailer-Daemon)
  const isBounceOrFailure =
    from.includes("mailer-daemon") ||
    from.includes("postmaster") ||
    sub.includes("address not found") ||
    sub.includes("delivery status notification") ||
    sub.includes("undelivered mail") ||
    sub.includes("failure notice") ||
    sub.includes("mail delivery failed") ||
    text.includes("550 5.1.1") ||
    text.includes("wasn't delivered to") ||
    text.includes("address couldn't be found");

  if (isBounceOrFailure) return true;

  // 2. ऑटोमेटेड सेंडर्स और थर्ड पार्टी सर्विसेज (Google, Apollo, MongoDB, etc.)
  const automatedSenders = [
    "no-reply",
    "noreply",
    "notification",
    "notifications",
    "donotreply",
    "google.com",
    "googlealerts-noreply",
    "apollo.io",
    "mongodb.com",
    "mailgun",
    "sendgrid",
    "postmark"
  ];

  const isAutomatedSender = automatedSenders.some(
    (sender) => from.includes(sender) || name.includes(sender)
  );

  if (isAutomatedSender) return true;

  // 3. वार्म-अप और ऑटो-टेस्टिंग टोकन्स
  if (
    sub.includes("ref-node-") ||
    text.includes("ref-node-") ||
    html.includes("ref-node-") ||
    sub.includes("[wu-verified]") ||
    text.includes("[wu-verified]") ||
    html.includes("[wu-verified]") ||
    html.includes("[[wu-verified-node]]") ||
    sub.includes("ref: #") ||
    text.includes("ref: #")
  ) {
    return true;
  }

  const warmupPrefixes = [
    "quick update on", "notes regarding", "follow-up on", "action items from",
    "brief sync regarding", "thoughts on", "reviewing", "discussion points for",
    "status update on", "regarding our plan for", "summary of", "details about"
  ];

  const hasWarmupPrefix = warmupPrefixes.some((prefix) => sub.startsWith(prefix));
  if (
    hasWarmupPrefix &&
    (
      text.includes("ref:") ||
      text.includes("project roadmap") ||
      text.includes("client deliverables") ||
      text.includes("weekly schedule") ||
      text.includes("quarterly objectives") ||
      text.includes("architecture design")
    )
  ) {
    return true;
  }

  return false;
}

// 🎯 B2B लीड्स और इंटेंट कीवर्ड्स डिटेक्टर
function detectEmailCategory(
  subject: string, 
  fullText: string, 
  inReplyTo?: string, 
  flags?: string[],
  fromEmail?: string,
  userEmail?: string
): "REPLY" | "IMPORTANT" | "NORMAL" {
  const sub = (subject || "").toLowerCase().trim();
  const text = (fullText || "").toLowerCase().trim();

  // 1. अगर खुद अपने ही ईमेल से भेजा गया है तो सामान्य रखें
  if (fromEmail && userEmail && fromEmail.toLowerCase().includes(userEmail.toLowerCase())) {
    return "NORMAL";
  }

  // 2. ऑटो-रिप्लाई / आउट ऑफ ऑफिस मेल्स
  if (
    sub.includes("out of office") || 
    sub.includes("automatic reply") || 
    sub.includes("auto-reply") ||
    sub.includes("autoreply")
  ) {
    return "NORMAL";
  }

  // 3. ❌ Negative / Cold कीवर्ड्स
  const negativeKeywords = [
    "not interested", "no thanks", "dont contact", "don't contact",
    "remove me", "unsubscribe", "stop emailing", "wrong person", "not looking",
    "take me off", "please delete"
  ];
  const isNegative = negativeKeywords.some((kw) => text.includes(kw) || sub.includes(kw));
  if (isNegative) {
    return "NORMAL";
  }

  // 4. 🔥 Hot & Positive Intent कीवर्ड्स
  const positiveIntentKeywords = [
    "agree", "sounds good", "sounds great", "sure", "ok", "okay", "yes", "yep",
    "interested", "definitely", "why not", "let's do", "lets do", "let's connect", "lets connect",
    "let's talk", "lets talk", "go ahead", "count me in",
    "schedule", "meeting", "zoom", "google meet", "calendar", "call me", "call",
    "available", "free tomorrow", "free next week", "time", "connect",
    "send the link", "send link", "share the link", "share link", "send me the link",
    "send details", "share info", "more info", "tell me more", "how does it work",
    "price", "pricing", "cost", "budget", "quote", "invoice", "proposal", "deck", "portfolio"
  ];

  const hasClientIntent = positiveIntentKeywords.some(
    (kw) => text.includes(kw) || sub.includes(kw)
  );

  // सिर्फ़ वास्तविक क्लाइंट इंटेंट या वास्तविक रिप्लाई पर ही REPLY सेट करें
  if (hasClientIntent) {
    return "REPLY";
  }

  if (inReplyTo || sub.startsWith("re:") || text.includes("wrote:")) {
    return "REPLY";
  }

  if (flags && flags.includes("\\Flagged")) {
    return "IMPORTANT";
  }

  return "NORMAL";
}

async function fetchFolderMessages(
  connection: any, 
  folderName: string, 
  userEmail: string,
  hoursLimit: number = 24,
  limit: number = 20, 
  isSpam: boolean = false
) {
  try {
    await connection.openBox(folderName);
  } catch (_) {
    return [];
  }

  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hoursLimit);

  const fetchOptions = {
    bodies: [""],
    struct: true,
    markSeen: false,
  };

  let messages: any[] = [];
  try {
    messages = await connection.search([["SINCE", cutoffDate]], fetchOptions);
  } catch (_) {
    try {
      messages = await connection.search(["ALL"], fetchOptions);
    } catch (_) {
      return [];
    }
  }

  if (!messages || messages.length === 0) return [];

  const recent = messages.slice(-limit).reverse();
  const list = [];

  for (const item of recent) {
    try {
      const part = item.parts.find((p: any) => p.which === "") || item.parts[0];
      if (!part || !part.body) continue;

      const parsed = await simpleParser(part.body);
      const emailDate = parsed.date || new Date();

      if (emailDate.getTime() < cutoffDate.getTime()) {
        continue;
      }

      const senderEmail = parsed.from?.value?.[0]?.address || parsed.from?.text || "";
      const senderName = parsed.from?.value?.[0]?.name || "";
      const subjectText = parsed.subject || "(No Subject)";
      const fullTextBody = parsed.text || "";
      const htmlBody = (parsed.html as string) || "";

      // 🛡️ गूगल बाउंस, Apollo, MongoDB और सिस्टम मेल्स को फेच होने से पहले ही छोड़ें
      if (isSystemOrIgnoredMail(senderEmail, senderName, subjectText, fullTextBody, htmlBody)) {
        continue;
      }

      const snippetText = parsed.text ? parsed.text.slice(0, 160).replace(/\s+/g, " ").trim() : "";
      const flags = item.attributes?.flags || [];
      const isUnread = !flags.includes("\\Seen");
      const isAnswered = flags.includes("\\Answered");

      const isFromMe = senderEmail.toLowerCase().includes(userEmail.toLowerCase());

      let category = detectEmailCategory(
        subjectText, 
        fullTextBody, 
        parsed.inReplyTo, 
        flags,
        senderEmail,
        userEmail
      );

      if (isAnswered || isFromMe) {
        category = "NORMAL";
      }

      let wasRescued = false;
      if (isSpam && (category === "REPLY" || category === "IMPORTANT") && !isAnswered) {
        try {
          await connection.moveMessage(item.attributes.uid, "INBOX");
          wasRescued = true;
        } catch (moveErr) {
          console.error("Move to INBOX Error:", moveErr);
        }
      }

      list.push({
        uid: item.attributes.uid,
        messageId: parsed.messageId || `${Date.now()}-${Math.random()}`,
        from: senderEmail,
        fromName: senderName,
        subject: subjectText,
        snippet: snippetText,
        fullText: fullTextBody,
        html: htmlBody,
        date: emailDate.toISOString(),
        isUnread,
        isAnswered,
        category,
        isSpamRescued: wasRescued || isSpam,
        accountEmail: userEmail,
      });
    } catch (parseErr) {
      console.error("Parse error:", parseErr);
    }
  }

  return list;
}

// 🛠️ एक अकाउंट का इनबॉक्स प्रोसेस करने का सेफ़ हेल्पर
async function scanAccountInbox(acc: { email: string; appPassword: string }, hours: number) {
  let connection: any = null;
  try {
    let plainPassword = "";
    try {
      plainPassword = decryptPassword(acc.appPassword).replace(/\s+/g, "");
    } catch (decErr) {
      return { 
        email: acc.email, 
        emails: [], 
        success: false, 
        authFailed: true, 
        error: "Password decryption failed." 
      };
    }

    connection = await imaps.connect({
      imap: {
        user: acc.email.trim(),
        password: plainPassword,
        host: "imap.gmail.com",
        port: 993,
        tls: true,
        authTimeout: 8000,
        tlsOptions: { rejectUnauthorized: false },
      },
    });

    const inboxEmails = await fetchFolderMessages(connection, "INBOX", acc.email, hours, 20, false);
    let spamEmails = await fetchFolderMessages(connection, "[Gmail]/Spam", acc.email, hours, 10, true);
    if (spamEmails.length === 0) {
      spamEmails = await fetchFolderMessages(connection, "Spam", acc.email, hours, 10, true);
    }

    return {
      email: acc.email,
      emails: [...spamEmails, ...inboxEmails],
      success: true,
      authFailed: false,
    };
  } catch (err: any) {
    console.error(`⚠️ [IMAP Fail] Skipping faulty account: ${acc.email} | Reason: ${err.message}`);
    return { 
      email: acc.email, 
      emails: [], 
      success: false, 
      authFailed: true, 
      error: err.message || "Authentication / Connection Failed" 
    };
  } finally {
    if (connection) {
      try { connection.end(); } catch (_) {}
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { machineId, sessionToken, email, appPassword, accounts, scanHours = 24 } = body;

    const auth = await enforceSecurity(req, machineId, sessionToken);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const hours = Number(scanHours) || 24;

    if (Array.isArray(accounts) && accounts.length > 0) {
      const scanPromises = accounts.map((acc: any) => scanAccountInbox(acc, hours));
      const results = await Promise.all(scanPromises);

      return NextResponse.json({
        success: true,
        chunkResults: results,
        sessionToken: auth.sessionToken,
      });
    }

    if (email && appPassword) {
      const singleResult = await scanAccountInbox({ email, appPassword }, hours);
      return NextResponse.json({
        success: singleResult.success,
        authFailed: singleResult.authFailed,
        error: singleResult.error,
        emails: singleResult.emails,
        sessionToken: auth.sessionToken,
      });
    }

    return NextResponse.json({ error: "Missing account credentials or accounts chunk list." }, { status: 400 });
  } catch (err: any) {
    console.error("POST /api/inbox/fetch Error:", err.message);
    return NextResponse.json({ error: err.message || "Failed to fetch emails." }, { status: 500 });
  }
}