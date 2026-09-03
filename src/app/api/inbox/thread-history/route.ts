import { NextResponse } from "next/server";
import Imap from "node-imap";
import { simpleParser, ParsedMail } from "mailparser";
import { decryptPassword } from "@/lib/encryption";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ThreadHistoryPayload {
  machineId?: string;
  sessionToken?: string;
  email: string;
  appPassword?: string;
  subject: string;
  currentUid?: number;
}

interface ThreadMessage {
  uid: number;
  folder: "INBOX" | "SENT";
  subject: string;
  from: string;
  to: string;
  date: Date;
  bodyText: string;
}

// 🛡️ लाइसेंस और मशीन आईडी सिक्योरिटी चेक
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

  return { allowed: true };
}

// 🎯 ग्रीटिंग्स और साइन-ऑफ ट्रिमिंग
function cleanEmailContent(rawText: string): string {
  if (!rawText) return "";

  let text = rawText;
  text = text.replace(/^(On\s[\s\S]+?wrote:[\s\S]*?[\r\n]+)/gim, "");
  text = text.replace(/^[ \t]*>.*$/gm, "");
  text = text.replace(
    /^(hi|hello|hey|dear|good\s(morning|afternoon|evening))(\s+[a-z0-9_.\-]+)?(\s*[,!:-])?/gim,
    ""
  );

  const signOffRegex =
    /\b(best\s*regards|warm\s*regards|kind\s*regards|with\s*regards|regards|thanks\s*(&|and)?\s*regards|many\s*thanks|thanks|cheers|sincerely|yours\s*faithfully|yours\s*truly|sent\s*from\s*my|--\s*[\r\n]+)[\s\S]*$/i;
  text = text.replace(signOffRegex, "");

  text = text.replace(/(https?:\/\/[^\s]+)/gi, "");
  text = text.replace(/(\+?\d{1,4}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?[\d]{3}[-.\s]?[\d]{4}/g, "");

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

// 🎯 Outlook vs Gmail IMAP Host का ऑटो-डिटेक्शन
function createImapClient(userEmail: string, pass: string): Imap {
  const isOutlook =
    userEmail.includes("outlook") ||
    userEmail.includes("hotmail") ||
    userEmail.includes("office365") ||
    userEmail.includes("live.");

  return new Imap({
    user: userEmail.trim(),
    password: pass,
    host: isOutlook ? "outlook.office365.com" : "imap.gmail.com",
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 15000,
  });
}

function fetchMessagesFromBox(
  imap: Imap,
  boxName: string,
  searchCriteria: any[],
  currentUid?: number
): Promise<ThreadMessage[]> {
  return new Promise((resolve) => {
    imap.openBox(boxName, true, (err) => {
      if (err) return resolve([]);

      imap.search(searchCriteria, (searchErr, uids) => {
        if (searchErr || !uids || uids.length === 0) return resolve([]);

        const filteredUids = currentUid ? uids.filter((id) => id !== currentUid) : uids;
        if (filteredUids.length === 0) return resolve([]);

        const fetcher = imap.fetch(filteredUids, { bodies: "" });
        const messages: ThreadMessage[] = [];
        const parsePromises: Promise<void>[] = [];

        fetcher.on("message", (msg) => {
          let uidVal = 0;
          msg.on("attributes", (attrs) => {
            uidVal = attrs.uid;
          });

          msg.on("body", (stream: any) => {
            const parseTask = simpleParser(stream)
              .then((parsed: ParsedMail) => {
                const rawBody = (parsed.text || parsed.html || "").trim();
                const sanitizedBody = cleanEmailContent(rawBody);

                messages.push({
                  uid: uidVal,
                  folder: boxName.toLowerCase().includes("sent") ? "SENT" : "INBOX",
                  subject: parsed.subject || "",
                  from: parsed.from?.text || "",
                  to: Array.isArray(parsed.to)
                    ? parsed.to.map((t: any) => t.text).join(", ")
                    : parsed.to?.text || "",
                  date: parsed.date ? new Date(parsed.date) : new Date(0),
                  bodyText: sanitizedBody.slice(0, 2000),
                });
              })
              .catch((parseErr: any) => {
                console.error("Stream parse error:", parseErr);
              });

            parsePromises.push(parseTask);
          });
        });

        fetcher.once("error", () => {
          Promise.all(parsePromises).then(() => resolve(messages));
        });

        fetcher.once("end", () => {
          Promise.all(parsePromises).then(() => resolve(messages));
        });
      });
    });
  });
}

export async function GET() {
  return NextResponse.json({ success: true, message: "Thread History Route Ready." });
}

export async function POST(req: Request) {
  let imap: Imap | null = null;
  try {
    const body: ThreadHistoryPayload = await req.json();
    const { machineId, sessionToken, email, appPassword, subject, currentUid } = body;

    // 1. मशीन और लाइसेंस सुरक्षा गार्ड
    const auth = await enforceSecurity(req, machineId, sessionToken);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!email || !subject) {
      return NextResponse.json(
        { success: false, error: "Email and subject are required." },
        { status: 400 }
      );
    }

    // 2. इन-मेमोरी डिक्रिप्शन
    let plainAppPassword = "";
    if (appPassword) {
      try {
        plainAppPassword = decryptPassword(appPassword).replace(/\s+/g, "");
      } catch (decErr: any) {
        plainAppPassword = appPassword.replace(/\s+/g, "");
      }
    } else {
      plainAppPassword = (process.env.SYSTEM_DEFAULT_MAIL_PASS || "").replace(/\s+/g, "");
    }

    if (!plainAppPassword) {
      return NextResponse.json(
        { success: false, error: "Failed to decrypt app password or password missing." },
        { status: 400 }
      );
    }

    const baseSubject = subject
      .replace(/\[WU-VERIFIED\]/gi, "")
      .replace(/^(Re|Fwd|Fw):\s*/gi, "")
      .trim();

    // 3. डिक्रिप्टेड पासवर्ड से IMAP कनेक्शन
    imap = createImapClient(email, plainAppPassword);

    const connectPromise = new Promise<void>((resolve, reject) => {
      imap!.once("ready", () => resolve());
      imap!.once("error", (e: any) => reject(e));
    });

    imap.connect();
    await connectPromise;

    const searchCriteria = [["HEADER", "SUBJECT", baseSubject]];

    // INBOX फ़ेच करें
    const inboxMessages = await fetchMessagesFromBox(imap, "INBOX", searchCriteria, currentUid);

    // Sent Items फ़ेच करें (Gmail और Outlook दोनों)
    let sentMessages = await fetchMessagesFromBox(imap, "[Gmail]/Sent Mail", searchCriteria, currentUid);
    if (sentMessages.length === 0) {
      sentMessages = await fetchMessagesFromBox(imap, "Sent Items", searchCriteria, currentUid);
    }
    if (sentMessages.length === 0) {
      sentMessages = await fetchMessagesFromBox(imap, "Sent", searchCriteria, currentUid);
    }

    const allHistoricalMessages = [...inboxMessages, ...sentMessages].filter(
      (m) => !currentUid || m.uid !== currentUid
    );

    if (allHistoricalMessages.length === 0) {
      return NextResponse.json({
        success: true,
        found: false,
        lastMessage: null,
      });
    }

    allHistoricalMessages.sort((a, b) => b.date.getTime() - a.date.getTime());
    const lastPreviousMessage = allHistoricalMessages[0];

    return NextResponse.json({
      success: true,
      found: true,
      lastMessage: {
        uid: lastPreviousMessage.uid,
        type: lastPreviousMessage.folder,
        from: lastPreviousMessage.from,
        subject: lastPreviousMessage.subject,
        date: lastPreviousMessage.date.toISOString(),
        text: lastPreviousMessage.bodyText,
      },
    });
  } catch (err: any) {
    console.error("POST /api/inbox/thread-history Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    if (imap && (imap as any).state !== "disconnected") {
      try {
        imap.end();
      } catch (_) {}
    }
  }
}