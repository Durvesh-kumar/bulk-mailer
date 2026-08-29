import { NextResponse, NextRequest } from "next/server";
import { getTenantDB } from "@/lib/db/tenantDb";
import { getSmtpVaultModel } from "@/lib/models/SmtpVault";
import { decryptPassword } from "@/lib/encryption";
import nodemailer from "nodemailer";
import Imap from "node-imap";
import { WARMUP_TAG } from "@/types/vault";

const REPLIES = [
  "Thanks for the update. Looks good to me!",
  "Received! I will review the notes and get back to you shortly.",
  "Thanks for checking in. Everything is on track from my side.",
  "Got it, appreciate the quick follow-up. Let's stay connected.",
  "Thanks for sharing. Let me look into this and update you.",
];

const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isAuthorizedAdmin(req: NextRequest): boolean {
  const reqKey = req.headers.get("x-admin-key");
  const serverAdminKey = process.env.ADMIN_SECRET_KEY || process.env.ADMIN_KEY;
  if (!reqKey || !serverAdminKey) return false;
  return reqKey.trim() === serverAdminKey.trim();
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ status: "UNAUTHORIZED", error: "Admin access denied" }, { status: 401 });
  }

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
              senderName: acc.senderName || "",
            });
          }
        });
      }
    });

    return NextResponse.json({ status: "READY", pool, totalCount: pool.length });
  } catch (err: any) {
    return NextResponse.json({ status: "ERROR", error: err.message, pool: [] }, { status: 500 });
  }
}

interface PendingReply {
  sender: string;
  subject: string;
  messageId?: string;
}

function inspectAndRescueMailbox(
  email: string,
  pass: string,
  filterSince: Date
): Promise<{ rescued: number; pendingReplies: PendingReply[] }> {
  return new Promise((resolve, reject) => {
    let rescued = 0;
    const pendingReplies: PendingReply[] = [];

    const imap = new Imap({
      user: email,
      password: pass,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 12000,
      authTimeout: 12000,
    });

    const finish = () => {
      try { imap.end(); } catch (_) {}
      resolve({ rescued, pendingReplies });
    };

    imap.once("error", (err: any) => {
      try { imap.end(); } catch (_) {}
      reject(err);
    });

    imap.once("ready", () => {
      // 🔍 1. SPAM फ़ोल्डर चेक और रेस्क्यू
      imap.openBox("[Gmail]/Spam", false, (err) => {
        if (err) {
          checkInbox();
          return;
        }

        imap.search(["UNSEEN", ["SINCE", filterSince], ["HEADER", "SUBJECT", WARMUP_TAG]], (searchErr, results) => {
          if (searchErr || !results || results.length === 0) {
            checkInbox();
            return;
          }

          const fetcher = imap.fetch(results, { bodies: "HEADER.FIELDS (FROM SUBJECT MESSAGE-ID)", struct: true });
          
          fetcher.on("message", (msg) => {
            let subject = "";
            let from = "";
            let origMessageId = "";
            let currentUid: number | null = null;

            msg.on("body", (stream) => {
              let buffer = "";
              stream.on("data", (chunk) => { buffer += chunk.toString("utf8"); });
              stream.once("end", () => {
                const lines = buffer.split("\r\n");
                lines.forEach((line) => {
                  if (line.toLowerCase().startsWith("subject:")) {
                    subject = line.substring(8).trim();
                  }
                  if (line.toLowerCase().startsWith("from:")) {
                    from = line.substring(5).trim();
                  }
                  if (line.toLowerCase().startsWith("message-id:")) {
                    origMessageId = line.substring(11).trim();
                  }
                });
              });
            });

            msg.once("attributes", (attrs) => {
              currentUid = attrs.uid;
            });

            msg.once("end", () => {
              if (subject && subject.includes(WARMUP_TAG) && currentUid) {
                rescued++;
                // ✅ Spam से हटाकर Inbox में मूव करें और Important/Flagged मार्क करें
                imap.addFlags(currentUid, ["\\Flagged"], () => {});
                imap.move(currentUid, "INBOX", () => {});

                const emailMatch = from.match(/<([^>]+)>/) || [null, from];
                const cleanSender = emailMatch[1] || from;
                if (cleanSender) {
                  pendingReplies.push({
                    sender: cleanSender.toLowerCase().trim(),
                    subject,
                    messageId: origMessageId,
                  });
                }
              }
            });
          });

          fetcher.once("end", () => {
            checkInbox();
          });
        });
      });
    });

    // 🔍 2. INBOX फ़ोल्डर चेक और रिप्लाई प्रोसेस
    const checkInbox = () => {
      imap.openBox("INBOX", false, (inboxErr) => {
        if (inboxErr) {
          finish();
          return;
        }

        imap.search(["UNSEEN", ["SINCE", filterSince], ["HEADER", "SUBJECT", WARMUP_TAG]], (searchErr, results) => {
          if (searchErr || !results || results.length === 0) {
            finish();
            return;
          }

          const fetcher = imap.fetch(results, { bodies: "HEADER.FIELDS (FROM SUBJECT MESSAGE-ID)", struct: true });
          
          fetcher.on("message", (msg) => {
            let subject = "";
            let from = "";
            let origMessageId = "";
            let currentUid: number | null = null;

            msg.on("body", (stream) => {
              let buffer = "";
              stream.on("data", (chunk) => { buffer += chunk.toString("utf8"); });
              stream.once("end", () => {
                const lines = buffer.split("\r\n");
                lines.forEach((line) => {
                  if (line.toLowerCase().startsWith("subject:")) {
                    subject = line.substring(8).trim();
                  }
                  if (line.toLowerCase().startsWith("from:")) {
                    from = line.substring(5).trim();
                  }
                  if (line.toLowerCase().startsWith("message-id:")) {
                    origMessageId = line.substring(11).trim();
                  }
                });
              });
            });

            msg.once("attributes", (attrs) => {
              currentUid = attrs.uid;
            });

            msg.once("end", () => {
              if (subject && subject.includes(WARMUP_TAG) && currentUid) {
                // ✅ मेल को Open (Seen) और Important (Flagged) मार्क करें
                imap.addFlags(currentUid, ["\\Flagged", "\\Seen"], () => {});

                const emailMatch = from.match(/<([^>]+)>/) || [null, from];
                const cleanSender = emailMatch[1] || from;
                if (cleanSender && !pendingReplies.some((r) => r.sender === cleanSender.toLowerCase().trim())) {
                  pendingReplies.push({
                    sender: cleanSender.toLowerCase().trim(),
                    subject,
                    messageId: origMessageId,
                  });
                }
              }
            });
          });

          fetcher.once("end", () => {
            finish();
          });
        });
      });
    };

    imap.connect();
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized access" }, { status: 401 });
  }

  const filterSince = new Date(Date.now() - 12 * 60 * 60 * 1000);
  let repliedCount = 0;

  try {
    const body = await req.json();
    const receiver = body.receiver;

    if (!receiver?.email || !receiver?.appPassword) {
      return NextResponse.json({ success: false, error: "Credentials required" }, { status: 400 });
    }

    const cleanEmail = receiver.email.toLowerCase().trim();
    const cleanReceiverName = String(receiver.senderName || "").trim();

    let receiverPass = String(receiver.appPassword).trim();
    if (receiverPass.includes(":") && receiverPass.length > 20) {
      try {
        receiverPass = decryptPassword(receiverPass);
      } catch (e: any) {
        return NextResponse.json({ success: false, error: `Decrypt Error: ${e.message}`, failed: 1 });
      }
    }
    receiverPass = receiverPass.replace(/\s+/g, "");

    const { rescued, pendingReplies } = await inspectAndRescueMailbox(cleanEmail, receiverPass, filterSince);

    // 📨 100% ऑथेंटिक 2-WAY THREADED REPLY
    if (pendingReplies.length > 0) {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: cleanEmail, pass: receiverPass },
        // name: "mail.google.com",
      });

      for (let i = 0; i < pendingReplies.length; i++) {
        const item = pendingReplies[i];
        try {
          // ✅ FIX: WARMUP_TAG को डिलीट करने के बजाय सुरक्षित रखें और आगे Re: लगाएं
          let replySubject = item.subject.trim();
          if (!replySubject.toLowerCase().startsWith("re:")) {
            replySubject = `Re: ${replySubject}`;
          }

          const mailPayload: any = {
            from: cleanReceiverName ? `"${cleanReceiverName}" <${cleanEmail}>` : cleanEmail,
            to: item.sender,
            subject: replySubject,
            text: pickRandom(REPLIES),
          };

          // 🛡️ Conversation Threadिंग हेडर्स
          if (item.messageId) {
            mailPayload.inReplyTo = item.messageId;
            mailPayload.references = item.messageId;
          }

          await transporter.sendMail(mailPayload);
          repliedCount++;

          if (i < pendingReplies.length - 1) {
            await sleep(2000); // 2 सेकंड का जिटर डिले
          }
        } catch (_) {}
      }

      transporter.close();
    }

    return NextResponse.json({
      status: "EXECUTED",
      success: true,
      rescued,
      replied: repliedCount,
      failed: 0,
      log:
        rescued > 0 || repliedCount > 0
          ? `🚨 [${cleanEmail}] ➔ Matched [${WARMUP_TAG}]! Rescued: ${rescued} | Replied: ${repliedCount}`
          : `🛡️ [${cleanEmail}] ➔ Clean (No [${WARMUP_TAG}] tag in last 12h)`,
    });
  } catch (err: any) {
    const errStr = String(err?.message || "");
    const errorMsg = errStr.includes("AUTHENTICATIONFAILED")
      ? "Auth Failed (Invalid App Password)"
      : errStr.includes("TIMEDOUT")
      ? "Timeout (Check Network/IMAP)"
      : errStr || "IMAP Failed";

    return NextResponse.json({
      status: "FAILED",
      success: false,
      error: errorMsg,
      failed: 1,
      rescued: 0,
      replied: 0,
    });
  }
}