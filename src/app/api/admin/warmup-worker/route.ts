// src/app/api/admin/warmup-worker/route.ts
import { NextResponse, NextRequest } from "next/server";
import { getTenantDB } from "@/lib/db/tenantDb";
import { getSmtpVaultModel } from "@/lib/models/SmtpVault";
import { decryptPassword } from "@/lib/encryption";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { getRandomWarmupMessage } from "@/lib/warmupTopics";
import crypto from "crypto";

// 🔐 डायनामिक टैग सीक्रेट की (वही की जो बाकी सभी फाइलों में इस्तेमाल हो रही है)
const WARMUP_SECRET = process.env.WARMUP_SECRET_KEY || "inboxsend_mesh_secret_2026";

/**
 * 🎯 डायनामिक टैग जनरेटर और वैलिडेटर
 */
function generateDynamicWarmupTag(senderEmail: string, receiverEmail: string): string {
  const payload = `${senderEmail.toLowerCase().trim()}:${receiverEmail.toLowerCase().trim()}`;
  const hash = crypto.createHmac("sha256", WARMUP_SECRET).update(payload).digest("hex").slice(0, 8);
  return `ref-node-${hash}`;
}

function isDynamicTagValid(textOrHtml: string, senderEmail: string, receiverEmail: string): boolean {
  if (!textOrHtml) return false;
  const expectedTag = generateDynamicWarmupTag(senderEmail, receiverEmail);
  return textOrHtml.includes(expectedTag) || textOrHtml.includes("[[WU-VERIFIED-NODE]]");
}

const REPLIES = [
  "Thanks for the update. Looks good to me!",
  "Received! I will review the notes and get back to you shortly.",
  "Thanks for checking in. Everything is on track from my side.",
  "Got it, appreciate the quick follow-up. Let's stay connected.",
];

const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

// 1. GET: फ़्रंटएंड को कतार (Queue) बनाने के लिए सिर्फ 1 बार अकाउंट्स देना
export async function GET() {
  try {
    const tenantDB = await getTenantDB();
    const VaultModel = getSmtpVaultModel(tenantDB);
    const allVaults = await VaultModel.find({}).lean();

    const pool: any[] = [];
    const seen = new Set<string>();

    allVaults.forEach((v: any) => {
      if (Array.isArray(v.accounts)) {
        v.accounts.forEach((acc: any) => {
          const email = (acc.email || "").toLowerCase().trim();
          const pass = acc.appPassword || acc.password || acc.smtpPassword;
          if (email && pass && !seen.has(email)) {
            seen.add(email);
            pool.push({
              email,
              appPassword: String(pass),
              senderName: acc.senderName || "Admin Peer",
            });
          }
        });
      }
    });

    return NextResponse.json({
      status: "READY",
      pool,
      totalCount: pool.length,
    });
  } catch (err: any) {
    console.error("GET /api/admin/warmup-worker Error:", err);
    return NextResponse.json({ status: "ERROR", error: err.message, pool: [] }, { status: 500 });
  }
}

// 🛡️ IMAP रेस्क्यू + 2-Way रिप्लाई + ऑटो-आर्काइव (Zero DB Hit)
async function performRescueAndReply(receiver: any, decryptedPass: string): Promise<number> {
  let imapClient: ImapFlow | null = null;
  const filterSince = new Date(Date.now() - 12 * 60 * 60 * 1000);
  let targetSubject = "";
  let targetSender = "";
  let rescuedCount = 0;

  try {
    imapClient = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: receiver.email, pass: decryptedPass },
      logger: false,
      socketTimeout: 8000,
      connectionTimeout: 8000,
    });

    imapClient.on("error", () => {});
    await imapClient.connect();

    // 1. स्पैम फ़ोल्डर से डायनामिक रेस्क्यू
    try {
      const spamLock = await imapClient.getMailboxLock("[Gmail]/Spam");
      try {
        const spamMessages = imapClient.fetch(
          { since: filterSince, seen: false },
          { envelope: true, flags: true, bodyParts: ["TEXT"] }
        );
        for await (let msg of spamMessages) {
          const sub = msg.envelope?.subject || "";
          const senderAddr = (msg.envelope?.from?.[0]?.address || "").toLowerCase().trim();
          const bodyContent = msg.bodyParts?.get("TEXT")?.toString("utf8") || "";

          // 🎯 डायनामिक टोकन वेरिफिकेशन
          if (isDynamicTagValid(bodyContent, senderAddr, receiver.email) || isDynamicTagValid(sub, senderAddr, receiver.email)) {
            await imapClient.messageMove(msg.seq, "INBOX");
            targetSubject = sub;
            targetSender = senderAddr;
            rescuedCount++;
          }
        }
      } finally {
        spamLock.release();
      }
    } catch (_) {}

    // 2. 2-Way ऑटो-रिप्लाई
    if (targetSender && targetSubject) {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: receiver.email, pass: decryptedPass },
        connectionTimeout: 8000,
      });

      let replySubject = targetSubject.trim();
      if (!replySubject.toLowerCase().startsWith("re:")) {
        replySubject = `Re: ${replySubject}`;
      }

      await transporter.sendMail({
        from: `"${receiver.senderName || "Warmup Peer"}" <${receiver.email}>`,
        to: targetSender.toLowerCase().trim(),
        subject: replySubject,
        text: pickRandom(REPLIES),
      });

      transporter.close();
    }

    // 3. इनबॉक्स से हटाकर Archive में डालना
    try {
      const inboxLock = await imapClient.getMailboxLock("INBOX");
      try {
        const inboxMessages = imapClient.fetch(
          { since: filterSince },
          { envelope: true, bodyParts: ["TEXT"] }
        );
        for await (let msg of inboxMessages) {
          const sub = msg.envelope?.subject || "";
          const senderAddr = (msg.envelope?.from?.[0]?.address || "").toLowerCase().trim();
          const bodyContent = msg.bodyParts?.get("TEXT")?.toString("utf8") || "";

          if (isDynamicTagValid(bodyContent, senderAddr, receiver.email) || isDynamicTagValid(sub, senderAddr, receiver.email)) {
            await imapClient.messageFlagsAdd(msg.seq, ["\\Seen", "\\Flagged"]);
            await imapClient.messageDelete(msg.seq);
          }
        }
      } finally {
        inboxLock.release();
      }
    } catch (_) {}

    await imapClient.logout();
    imapClient = null;
  } catch (e) {
    if (imapClient) {
      try { await imapClient.logout(); } catch (_) {}
    }
  }

  return rescuedCount;
}

// 🎯 POST: फ़्रंटएंड से डायरेक्ट डेटा प्रोसेस होगा (Zero DB Hit)
export async function POST(req: NextRequest) {
  try {
    const bodyData = await req.json();
    const { sender, receiver } = bodyData;

    if (!sender?.email || !sender?.appPassword || !receiver?.email) {
      return NextResponse.json(
        { error: "Sender (with appPassword) and Receiver details required" },
        { status: 400 }
      );
    }

    const cleanSender = sender.email.toLowerCase().trim();
    const cleanReceiver = receiver.email.toLowerCase().trim();

    // 1. सेंडर पासवर्ड डिक्रिप्ट
    let senderPass = sender.appPassword;
    if (senderPass.includes(":") || senderPass.length > 20) {
      try {
        senderPass = decryptPassword(senderPass);
      } catch (e: any) {
        return NextResponse.json({ error: `Sender Decrypt Error: ${e.message}`, failed: true }, { status: 400 });
      }
    }
    senderPass = senderPass.replace(/\s+/g, "");

    // 2. रिसीवर पासवर्ड डिक्रिप्ट
    let receiverPass = receiver.appPassword || "";
    if (receiverPass.includes(":") || receiverPass.length > 20) {
      try {
        receiverPass = decryptPassword(receiverPass);
      } catch (_) {}
    }
    receiverPass = receiverPass.replace(/\s+/g, "");

    const { subject, body } = getRandomWarmupMessage();

    // 🎯 डायनामिक टैग जनरेट करना
    const dynamicTag = generateDynamicWarmupTag(cleanSender, cleanReceiver);

    const formattedPlainText = `${body}\n\n${dynamicTag}`;
    const formattedHtml = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        ${body.replace(/\n/g, "<br/>")}
        <span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; mso-hide:all; font-size:0px;">
          ${dynamicTag}
        </span>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: cleanSender, pass: senderPass },
      connectionTimeout: 8000,
    });

    await transporter.sendMail({
      from: `"${sender.senderName || "Sender Node"}" <${cleanSender}>`,
      to: cleanReceiver,
      subject: (subject || "Connecting regarding our discussion").trim(), // 100% क्लीन नेचुरल सब्जेक्ट
      text: formattedPlainText,
      html: formattedHtml,
    });

    transporter.close();

    // 🔄 Non-blocking IMAP रेस्क्यू
    let rescuedCount = 0;
    if (receiverPass) {
      performRescueAndReply(receiver, receiverPass).then((cnt) => {
        rescuedCount = cnt;
      }).catch(() => {});
    }

    return NextResponse.json({
      status: "EXECUTED",
      success: true,
      dispatched: 1,
      failed: 0,
      rescued: rescuedCount,
      sender: cleanSender,
      receiver: cleanReceiver,
      log: `✅ [${cleanSender}] ➡️ [${cleanReceiver}] (Dispatched with Dynamic Token & Archived)`,
    });
  } catch (err: any) {
    console.error("Warmup Worker Dispatch Error:", err);
    return NextResponse.json({ status: "FAILED", error: err.message, failed: 1, dispatched: 0, rescued: 0 }, { status: 500 });
  }
}