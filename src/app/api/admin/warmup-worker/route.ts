import { NextResponse } from "next/server";
import { getTenantDB } from "@/lib/db/tenantDb";
import { getSmtpVaultModel } from "@/lib/models/SmtpVault";
import { decryptPassword } from "@/lib/encryption";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { getRandomWarmupMessage, WARMUP_SUBJECTS } from "@/lib/warmupTopics";

interface CachedAccount {
  email: string;
  appPassword: string;
  senderName: string;
}

let memoryAccountPool: CachedAccount[] = [];
let lastDbFetchTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 मिनट RAM कैश

const REPLIES = [
  "Thanks for the update. Looks good to me!",
  "Received! I will review the notes and get back to you shortly.",
  "Thanks for checking in. Everything is on track from my side.",
  "Got it, appreciate the quick follow-up. Let's stay connected.",
];

const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

function isWarmupSubject(subject: string): boolean {
  if (!subject) return false;
  const cleanSub = subject.replace(/^(Re:\s*|Fwd:\s*)/i, "").trim().toLowerCase();
  return WARMUP_SUBJECTS.some((target) => cleanSub.includes(target.toLowerCase()));
}

async function getCachedAccounts(): Promise<CachedAccount[]> {
  const now = Date.now();
  if (memoryAccountPool.length > 0 && now - lastDbFetchTime < CACHE_TTL_MS) {
    return memoryAccountPool;
  }

  try {
    const tenantDB = await getTenantDB();
    const VaultModel = getSmtpVaultModel(tenantDB);
    const allVaults = await VaultModel.find(
      {},
      { "accounts.email": 1, "accounts.appPassword": 1, "accounts.senderName": 1 }
    ).lean();

    const freshPool: CachedAccount[] = [];
    const seen = new Set<string>();

    allVaults.forEach((v: any) => {
      if (Array.isArray(v.accounts)) {
        v.accounts.forEach((acc: any) => {
          if (acc.email && acc.appPassword) {
            const clean = acc.email.toLowerCase().trim();
            if (!seen.has(clean)) {
              seen.add(clean);
              freshPool.push({
                email: clean,
                appPassword: acc.appPassword,
                senderName: acc.senderName || "Warmup Node",
              });
            }
          }
        });
      }
    });

    memoryAccountPool = freshPool;
    lastDbFetchTime = now;
  } catch (err) {
    console.error("[Warmup Worker] DB Cache refresh error:", err);
  }

  return memoryAccountPool;
}

// 🛡️ 26-घंटे का IMAP स्पैम रेस्क्यू व 2-Way रिप्लाई फ़ंक्शन
async function performRescueAndReply(account: CachedAccount, decryptedPass: string) {
  let imapClient: ImapFlow | null = null;
  const filterSince = new Date(Date.now() - 26 * 60 * 60 * 1000);
  let targetSubject = "";
  let targetSender = "";

  try {
    imapClient = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: account.email, pass: decryptedPass },
      logger: false,
    });

    await imapClient.connect();

    // 1. स्पैम फ़ोल्डर रेस्क्यू
    try {
      const spamLock = await imapClient.getMailboxLock("[Gmail]/Spam");
      try {
        const spamMessages = imapClient.fetch({ since: filterSince }, { envelope: true });
        for await (let msg of spamMessages) {
          const sub = msg.envelope?.subject || "";
          if (isWarmupSubject(sub)) {
            await imapClient.messageMove(msg.seq, "INBOX");
            targetSubject = sub;
            if (msg.envelope?.from?.[0]?.address) targetSender = msg.envelope.from[0].address;
          }
        }
      } finally {
        spamLock.release();
      }
    } catch (_) {}

    // 2. इनबॉक्स स्टार व इंपॉर्टेंट मार्क
    try {
      const inboxLock = await imapClient.getMailboxLock("INBOX");
      try {
        const inboxMessages = imapClient.fetch({ since: filterSince }, { envelope: true });
        for await (let msg of inboxMessages) {
          const sub = msg.envelope?.subject || "";
          if (isWarmupSubject(sub)) {
            await imapClient.messageFlagsAdd(msg.seq, ["\\Seen", "\\Flagged"]);
            if (!targetSubject) targetSubject = sub;
            if (!targetSender && msg.envelope?.from?.[0]?.address) targetSender = msg.envelope.from[0].address;
          }
        }
      } finally {
        inboxLock.release();
      }
    } catch (_) {}

    await imapClient.logout();
    imapClient = null;

    // 3. 2-Way रिप्लाई डिस्पैच
    if (targetSender && targetSubject) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: account.email, pass: decryptedPass },
        name: "mail.google.com",
      } as any);

      const replySubject = targetSubject.startsWith("Re:") ? targetSubject : `Re: ${targetSubject}`;
      await transporter.sendMail({
        from: `"${account.senderName}" <${account.email}>`,
        to: targetSender.toLowerCase().trim(),
        subject: replySubject,
        text: pickRandom(REPLIES),
      });

      transporter.close();
    }
  } catch (e) {
    if (imapClient) {
      try { await imapClient.logout(); } catch (_) {}
    }
  }
}

export async function GET(req: Request) {
  try {
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";

    const controlRes = await fetch(`${protocol}://${host}/api/admin/warmup-control`, {
      cache: "no-store",
    });
    const { isRunning, batchPerMinute } = await controlRes.json();

    if (!isRunning) {
      return NextResponse.json({ status: "PAUSED", dispatched: 0, failed: 0 });
    }

    const accountPool = await getCachedAccounts();
    if (accountPool.length < 2) {
      return NextResponse.json({ status: "WAITING", message: "Need >= 2 active accounts" });
    }

    const targetCount = batchPerMinute || 3;
    let dispatched = 0;
    let failed = 0;

    for (let i = 0; i < targetCount; i++) {
      const sender = accountPool[Math.floor(Math.random() * accountPool.length)];
      const validReceivers = accountPool.filter((a) => a.email !== sender.email);
      if (validReceivers.length === 0) continue;

      const receiver = validReceivers[Math.floor(Math.random() * validReceivers.length)];

      let senderPass = sender.appPassword;
      if (senderPass.includes(":") || senderPass.length > 20) {
        try { senderPass = decryptPassword(senderPass); } catch { failed++; continue; }
      }
      senderPass = senderPass.replace(/\s+/g, "");

      let receiverPass = receiver.appPassword;
      if (receiverPass.includes(":") || receiverPass.length > 20) {
        try { receiverPass = decryptPassword(receiverPass); } catch {}
      }
      receiverPass = receiverPass.replace(/\s+/g, "");

      const { subject, body } = getRandomWarmupMessage();

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: sender.email, pass: senderPass },
        name: "mail.google.com",
      } as any);

      try {
        await transporter.sendMail({
          from: `"${sender.senderName}" <${sender.email}>`,
          to: receiver.email,
          subject,
          text: body,
        });
        dispatched++;
        transporter.close();

        // 🔄 रिसीवर पर तुरंत 26-घंटे का स्पैम रेस्क्यू और 2-Way रिप्लाई
        if (receiverPass) {
          performRescueAndReply(receiver, receiverPass).catch(() => {});
        }
      } catch (err) {
        failed++;
        if (transporter) {
          try { transporter.close(); } catch (_) {}
        }
        console.error(`Warmup drop [${sender.email} -> ${receiver.email}]:`, err);
      }
    }

    return NextResponse.json({
      status: "EXECUTED",
      dispatched,
      failed,
      cachedAccountsCount: accountPool.length,
      nextDbRefreshInSeconds: Math.max(0, Math.round((CACHE_TTL_MS - (Date.now() - lastDbFetchTime)) / 1000)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}