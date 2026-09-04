// src/app/api/inbox/analytics/route.ts
import { NextResponse } from "next/server";
import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";
import { decryptPassword } from "@/lib/encryption";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 1. वो सभी सिस्टम, प्लेटफॉर्म और वेंडर डोमेन्स जिन्हें लीड्स में कभी नहीं गिनना
const SYSTEM_IGNORED_DOMAINS = [
  "vercel.com",
  "vercel.email",
  "mongodb.com",
  "google.com",
  "googlemail.com",
  "aistudio.google.com",
  "openai.com",
  "github.com",
  "postman.com",
  "render.com",
  "aws.amazon.com",
  "cloudflare.com",
  "pole.com",
  "poll.com",
  "polleverywhere.com",
];

// 2. ऑटोमेशन बॉट और नो-रिप्लाई प्रिफिक्स
const IGNORED_SENDER_PREFIXES = [
  "mailer-daemon",
  "postmaster",
  "noreply",
  "no-reply",
  "notifications",
  "notification",
  "alert",
  "alerts",
  "billing",
  "security",
  "support",
  "newsletter",
];

// 3. बाउंस और सिस्टम मेल चेकर
function isSystemOrBouncedMail(fromRaw: string, subject: string, bodyText: string): boolean {
  const from = (fromRaw || "").toLowerCase();
  const sub = (subject || "").toLowerCase();
  const text = (bodyText || "").toLowerCase();

  // A. बाउंस (Delivery Status Notification / Address Not Found)
  if (
    from.includes("mailer-daemon") ||
    from.includes("postmaster") ||
    sub.includes("delivery status notification") ||
    sub.includes("address not found") ||
    sub.includes("undelivered mail") ||
    sub.includes("failure notice") ||
    sub.includes("returned to sender") ||
    text.includes("dns error: dns type 'mx' lookup") ||
    text.includes("domain name not found") ||
    text.includes("wasn't delivered to") ||
    text.includes("recipient address rejected")
  ) {
    return true;
  }

  // B. प्लेटफॉर्म डोमेन चेक (Vercel, Mongo, Google AI, OpenAI, Pole आदि)
  const isPlatformDomain = SYSTEM_IGNORED_DOMAINS.some(
    (dom) => from.includes(`@${dom}`) || from.includes(`.${dom}`)
  );
  if (isPlatformDomain) return true;

  // C. बॉट प्रिफिक्स चेक (noreply, alerts आदि)
  const isBot = IGNORED_SENDER_PREFIXES.some(
    (prefix) => from.startsWith(prefix) || from.includes(`<${prefix}@`) || from.includes(`${prefix}@`)
  );
  if (isBot) return true;

  return false;
}

// 4. वार्म-अप मेल्स का फ़िल्टर
function isWarmupMail(subject: string, bodyText: string): boolean {
  const sub = (subject || "").toLowerCase();
  const text = (bodyText || "").toLowerCase();
  return (
    sub.includes("ref-node-") ||
    text.includes("ref-node-") ||
    sub.includes("[wu-verified]") ||
    text.includes("[wu-verified]") ||
    sub.includes("quick update on") ||
    sub.includes("follow-up on") ||
    text.includes("project roadmap")
  );
}

// सिंगल अकाउंट इनबॉक्स स्कैनर (Fault-Tolerant)
async function scanSingleInbox(acc: { email: string; appPassword: string }, scanHours: number) {
  let connection: any = null;
  const hotLeads: any[] = [];
  const budgetLeads: any[] = [];
  const coldLeads: any[] = [];
  const nilLeads: any[] = [];

  try {
    let plainPassword = "";
    try {
      plainPassword = decryptPassword(acc.appPassword).replace(/\s+/g, "");
    } catch (decErr) {
      return {
        email: acc.email,
        hotLeads: [],
        budgetLeads: [],
        coldLeads: [],
        nilLeads: [],
        authFailed: true,
        error: "Password decryption failed.",
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

    await connection.openBox("INBOX");
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - Number(scanHours || 24));

    const messages = await connection.search([["SINCE", cutoffDate]], { bodies: [""], struct: true });

    for (const item of messages) {
      const part = item.parts.find((p: any) => p.which === "") || item.parts[0];
      if (!part || !part.body) continue;

      const parsed = await simpleParser(part.body);
      const subject = parsed.subject || "(No Subject)";
      const fullText = parsed.text || "";
      const text = fullText.toLowerCase();
      const sub = subject.toLowerCase();
      const senderAddress = parsed.from?.value?.[0]?.address || parsed.from?.text || "";

      // 🛑 फ़िल्टर 1: वार्म-अप मेल छोड़ें
      if (isWarmupMail(subject, fullText)) {
        continue;
      }

      // 🛑 फ़िल्टर 2: बाउंस, Vercel, MongoDB, Pole, OpenAI, Google Studio को पूरी तरह छोड़ें
      if (isSystemOrBouncedMail(senderAddress, subject, fullText)) {
        continue;
      }

      const mailItem = {
        uid: item.attributes.uid,
        from: senderAddress,
        fromName: parsed.from?.value?.[0]?.name || "",
        subject,
        snippet: parsed.text ? parsed.text.slice(0, 160).replace(/\s+/g, " ").trim() : "",
        fullText,
        date: parsed.date || new Date(),
        accountEmail: acc.email,
        categoryTag: "NIL",
      };

      // 1. COLD FILTER (नेगेटिव रिप्लाई)
      const isCold =
        text.includes("not interested") ||
        text.includes("no thanks") ||
        text.includes("don't contact") ||
        text.includes("dont contact") ||
        text.includes("remove") ||
        text.includes("stop") ||
        text.includes("unsubscribe") ||
        text.includes("wrong person") ||
        text.includes("not looking") ||
        text.includes("take me off") ||
        text.includes("please delete");

      // 2. BUDGET / DELAYED FILTER
      const isBudgetOrDelayed =
        text.includes("price") ||
        text.includes("pricing") ||
        text.includes("cost") ||
        text.includes("how much") ||
        text.includes("quote") ||
        text.includes("rates") ||
        text.includes("rate card") ||
        text.includes("budget") ||
        text.includes("expensive") ||
        text.includes("later") ||
        text.includes("next week") ||
        text.includes("next month") ||
        text.includes("after some time") ||
        text.includes("currently busy") ||
        text.includes("busy right now") ||
        text.includes("touch base later") ||
        text.includes("following up later");

      // 3. HOT FILTER (सिर्फ वास्तविक रुचि वाले कीवर्ड्स)
      const isHot =
        text.includes("meeting") ||
        text.includes("schedule") ||
        text.includes("calendar") ||
        text.includes("call") ||
        text.includes("zoom") ||
        text.includes("google meet") ||
        text.includes("sure") ||
        text.includes("interested") ||
        text.includes("send details") ||
        text.includes("share info") ||
        text.includes("let's talk") ||
        text.includes("lets talk") ||
        text.includes("sounds good") ||
        text.includes("available at") ||
        text.includes("connect today");

      if (isCold) {
        mailItem.categoryTag = "COLD";
        coldLeads.push(mailItem);
      } else if (isBudgetOrDelayed) {
        mailItem.categoryTag = "BUDGET";
        budgetLeads.push(mailItem);
      } else if (isHot) {
        // ⚡ अब सिर्फ़ तभी HOT बनेगा जब क्लाइंट ने सच में इनमें से कोई बात कही हो
        mailItem.categoryTag = "HOT";
        hotLeads.push(mailItem);
      } else if (parsed.inReplyTo || sub.startsWith("re:")) {
        // अगर क्लाइंट ने रिप्लाई दिया है पर कोई स्पेसिफिक कीवर्ड नहीं है, तो उसे NIL/GENERAL रखें (गलत HOT नहीं)
        mailItem.categoryTag = "NIL";
        nilLeads.push(mailItem);
      } else {
        mailItem.categoryTag = "NIL";
        nilLeads.push(mailItem);
      }
    }

    return {
      email: acc.email,
      hotLeads,
      budgetLeads,
      coldLeads,
      nilLeads,
      authFailed: false,
    };
  } catch (err: any) {
    console.error(`⚠️ [Analytics IMAP Fail] Skipping: ${acc.email} | Reason: ${err.message}`);
    return {
      email: acc.email,
      hotLeads: [],
      budgetLeads: [],
      coldLeads: [],
      nilLeads: [],
      authFailed: true,
      error: err.message || "Authentication / Connection Failed",
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
    const { machineId, sessionToken, accounts, scanHours = 24 } = body;

    const accountsList =
      accounts ||
      (body.email && body.appPassword ? [{ email: body.email, appPassword: body.appPassword }] : []);

    if (!accountsList || accountsList.length === 0) {
      return NextResponse.json({ error: "Accounts list required." }, { status: 400 });
    }

    const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";
    const clientDomain = hostHeader.split(":")[0].toLowerCase().trim();
    const guard = await verifyLicenseAndDevice(clientDomain, machineId, sessionToken);

    if (!guard.ok) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const scanPromises = accountsList.map((acc: any) => scanSingleInbox(acc, scanHours));
    const chunkResults = await Promise.all(scanPromises);

    let allHot: any[] = [];
    let allBudget: any[] = [];
    let allCold: any[] = [];
    let allNil: any[] = [];
    const failedAccounts: { email: string; error: string }[] = [];

    chunkResults.forEach((res) => {
      if (res.authFailed) {
        failedAccounts.push({ email: res.email, error: res.error || "Password Mismatch" });
      } else {
        allHot.push(...res.hotLeads);
        allBudget.push(...res.budgetLeads);
        allCold.push(...res.coldLeads);
        allNil.push(...res.nilLeads);
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        hotLeads: allHot,
        budgetLeads: allBudget,
        coldLeads: allCold,
        nilLeads: allNil,
        failedAccounts,
        totalScanned: allHot.length + allBudget.length + allCold.length + allNil.length,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}