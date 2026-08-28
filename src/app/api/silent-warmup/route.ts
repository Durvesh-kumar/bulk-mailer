// src/app/api/silent-warmup/route.ts
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";
import { decryptPassword } from "@/lib/encryption";
import { getRandomWarmupMessage } from "@/lib/warmupTopics";
import { GREETINGS, OPENERS, SIGN_OFFS } from "@/lib/ctaConfig";

const pickRandom = (arr: string[] | undefined, fallback: string): string => {
  if (!arr || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
};

export const maxDuration = 60;

export async function POST(req: Request) {
  let transporter: nodemailer.Transporter | null = null;

  try {
    const body = await req.json();
    const {
      machineId,
      senderEmail,
      receiverEmail,
      senderName,
      encryptedPassword,
      appPassword,
      sessionToken: bodySessionToken,
    } = body;

    const sessionToken = req.headers.get("x-session-token") || bodySessionToken || null;
    const rawPass = String(encryptedPassword || appPassword || "").trim();

    console.log("🔍 [Warmup-Worker Step 1] Inbound Request:", {
      machineId: machineId || "MISSING",
      senderEmail: senderEmail || "MISSING",
      receiverEmail: receiverEmail || "MISSING",
      hasPassword: Boolean(rawPass),
      tokenPresent: Boolean(sessionToken),
    });

    if (!machineId || !senderEmail || !receiverEmail || !rawPass) {
      return NextResponse.json(
        { error: "Missing required parameters: machineId, senderEmail, receiverEmail, or Password." },
        { status: 400 }
      );
    }

    const hostHeader =
      req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";

    const guard = await verifyLicenseAndDevice(hostHeader, machineId, sessionToken);
    if (!guard.ok) {
      console.error("❌ [Warmup-Worker Step 2] Guard Rejected:", guard.error);
      return NextResponse.json(
        {
          error: guard.error || "License verification failed.",
          clearSession: guard.clearClientSession || false,
        },
        { status: 403 }
      );
    }

    const cleanSender = senderEmail.toLowerCase().trim();
    const cleanReceiver = receiverEmail.toLowerCase().trim();
    const cleanHeaderName = (senderName || "Colleague").trim();

    // 🔐 पासवर्ड डिक्रिप्शन
    let cleanPassword = rawPass.replace(/\s+/g, "");
    if (rawPass.includes(":") && rawPass.length > 20) {
      try {
        cleanPassword = decryptPassword(rawPass).replace(/\s+/g, "");
      } catch (decErr) {
        console.error("Warmup vault password decryption error:", decErr);
      }
    }

    // 🚀 Pure Native Gmail SMTP Connection
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: cleanSender,
        pass: cleanPassword,
      },
    });

    try {
      await transporter.verify();
    } catch (authErr: any) {
      console.error(`❌ [Warmup-Worker Step 3] SMTP Auth Error for ${cleanSender}:`, authErr.message);
      const isAuthError = authErr.code === "EAUTH" || authErr.responseCode === 535;
      return NextResponse.json(
        {
          error: `Authentication failed for ${cleanSender}. Check App Password.`,
          accountErrorType: isAuthError ? "AUTH_FAILED" : "CONNECTION_FAILED",
        },
        { status: 400 }
      );
    }

    const { subject, body: rawTopicBody } = getRandomWarmupMessage();

    const randomGreeting = pickRandom(GREETINGS, "Hi,");
    const randomOpener = pickRandom(OPENERS, "Hope this note finds you well.");
    const randomSignOff = pickRandom(SIGN_OFFS, "Best regards,");

    const cleanBody = (rawTopicBody || "")
      .trim()
      .replace(/^(hi|hello|hey|greetings)[^\n]*\n+/i, "")
      .replace(
        /^(hope this note finds you well|hope you are having a productive week|reaching out to quickly connect)[^\n]*\n+/i,
        ""
      );

    const formattedPlainText = `${randomGreeting}\n\n${randomOpener}\n\n${cleanBody}\n\n${randomSignOff}\n\n${cleanHeaderName}`;

    // 📨 Native Headers Dispatch
    const info = await transporter.sendMail({
      from: `"${cleanHeaderName}" <${cleanSender}>`,
      to: cleanReceiver,
      subject: (subject || "Connecting regarding our conversation").trim(),
      text: formattedPlainText,
    });

    console.log(`✅ [Warmup-Worker Step 4] Dispatched OK: Message-ID ${info.messageId}`);

    transporter.close();
    transporter = null;

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

    console.error("POST /api/silent-warmup Critical Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to dispatch silent warmup mail." },
      { status: 500 }
    );
  }
}