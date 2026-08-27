import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";
import { decryptPassword } from "@/lib/encryption";
import { getRandomWarmupMessage } from "@/lib/warmupTopics";
import { GREETINGS, OPENERS, SIGN_OFFS } from "@/lib/ctaConfig";

const pickRandom = (arr: string[]): string => {
  return arr[Math.floor(Math.random() * arr.length)];
};

export const maxDuration = 60;

export async function POST(req: Request) {
  let transporter: nodemailer.Transporter | null = null;
  let plainAppPassword = "";

  try {
    const body = await req.json();
    const { machineId, senderEmail, receiverEmail, senderName, encryptedPassword } = body;
    const sessionToken = req.headers.get("x-session-token");

    if (!machineId || !senderEmail || !receiverEmail || !encryptedPassword) {
      return NextResponse.json(
        { error: "Missing required parameters: machineId, senderEmail, receiverEmail, or encryptedPassword." },
        { status: 400 }
      );
    }

    const hostHeader =
      req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";
    const clientDomain = hostHeader.split(":")[0].toLowerCase().trim();

    const guard = await verifyLicenseAndDevice(clientDomain, machineId, sessionToken);
    if (!guard.ok || !guard.machineId) {
      return NextResponse.json(
        { 
          error: `Access Denied: ${guard.error || "Invalid license or device mismatch."}`,
          clearSession: guard.clearClientSession || false 
        },
        { status: guard.reason === "NEW_DEVICE" ? 401 : 403 }
      );
    }

    const cleanSender = senderEmail.toLowerCase().trim();
    const cleanReceiver = receiverEmail.toLowerCase().trim();
    const cleanHeaderName = (senderName || "Colleague").trim();

    // 🔐 पासवर्ड डिक्रिप्शन
    plainAppPassword = encryptedPassword;
    try {
      if (plainAppPassword.includes(":") || plainAppPassword.length > 20) {
        plainAppPassword = decryptPassword(plainAppPassword);
      }
    } catch (decErr: any) {
      console.error("Decryption failed in /api/silent-warmup:", decErr);
      return NextResponse.json(
        { error: "Failed to decrypt sender credentials." },
        { status: 500 }
      );
    }

    const cleanPassword = plainAppPassword.replace(/\s+/g, "");

    // 🚀 ऑथेंटिक Gmail SMTP सेटअप
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: cleanSender,
        pass: cleanPassword,
      },
      name: "mail.google.com",
    } as any);

    try {
      await transporter.verify();
    } catch (authErr: any) {
      return NextResponse.json(
        { error: `Authentication failed for ${cleanSender}. Check App Password.` },
        { status: 401 }
      );
    }

    const { subject, body: rawTopicBody } = getRandomWarmupMessage();

    const randomGreeting = pickRandom(GREETINGS);
    const randomOpener = pickRandom(OPENERS);
    const randomSignOff = pickRandom(SIGN_OFFS);

    const cleanBody = rawTopicBody.trim()
      .replace(/^(hi|hello|hey|greetings)[^\n]*\n+/i, "")
      .replace(/^(hope this note finds you well|hope you are having a productive week|reaching out to quickly connect)[^\n]*\n+/i, "");

    const formattedPlainText = `${randomGreeting}\n\n${randomOpener}\n\n${cleanBody}\n\n${randomSignOff}\n\n${cleanHeaderName}`;

    const info = await transporter.sendMail({
      from: `"${cleanHeaderName}" <${cleanSender}>`,
      to: cleanReceiver,
      subject: subject.trim(),
      text: formattedPlainText,
    });

    transporter.close();
    transporter = null;
    plainAppPassword = "";

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      sender: cleanSender,
      receiver: cleanReceiver,
      sessionToken: guard.sessionToken,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    if (transporter) {
      try {
        transporter.close();
      } catch (_) {}
    }
    plainAppPassword = "";

    console.error("POST /api/silent-warmup Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to dispatch silent warmup mail." },
      { status: 500 }
    );
  }
}