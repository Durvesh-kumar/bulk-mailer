// src/app/api/silent-warmup/route.ts
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";
import { decryptPassword } from "@/lib/encryption";
import { getRandomWarmupMessage } from "@/lib/warmupTopics";
import { GREETINGS, OPENERS, SIGN_OFFS } from "@/lib/ctaConfig";
import { WARMUP_TAG } from "@/types/vault";

const pickRandom = (arr: string[] | undefined, fallback: string): string => {
  if (!arr || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
};

export const maxDuration = 60;

export async function POST(req: Request) {
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

    if (!machineId || !senderEmail || !receiverEmail || !rawPass) {
      return NextResponse.json(
        { error: "Missing required parameters: machineId, senderEmail, receiverEmail, or Password." },
        { status: 400 }
      );
    }

    const hostHeader =
      req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";

    // 1. लाइसेंस और सेशन वेरिफिकेशन
    const guard = await verifyLicenseAndDevice(hostHeader, machineId, sessionToken);
    if (!guard.ok) {
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
    const cleanHeaderName = String(senderName || "").trim();

    // 🔐 2. पासवर्ड डिक्रिप्शन
    let cleanPassword = rawPass.replace(/\s+/g, "");
    if (rawPass.includes(":") && rawPass.length > 20) {
      try {
        cleanPassword = decryptPassword(rawPass).replace(/\s+/g, "");
      } catch (decErr) {
        console.error("Warmup vault password decryption error:", decErr);
      }
    }

    // 🚀 3. Fresh Single-Use Transport Factory
    const createFreshTransport = () => {
      return nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: cleanSender,
          pass: cleanPassword,
        },
        name: "mail.google.com",
      });
    };

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

    const baseSubject = (subject || "Connecting regarding our conversation").trim();
    const finalSubjectWithTag = baseSubject.includes(WARMUP_TAG)
      ? baseSubject
      : `${baseSubject} ${WARMUP_TAG}`;

    // 🔌 नया फ्रेश कनेक्शन ओपन करें
    const activeTransporter = createFreshTransport();
    let info: nodemailer.SentMessageInfo;

    try {
      // 📨 100% ओरिजिनल Google MIME हेडर डिस्पैच
      info = await activeTransporter.sendMail({
        from: cleanHeaderName ? `"${cleanHeaderName}" <${cleanSender}>` : cleanSender,
        to: cleanReceiver,
        subject: finalSubjectWithTag,
        text: formattedPlainText,
      });
    } catch (err: any) {
      const isAuthError = err.code === "EAUTH" || err.responseCode === 535;
      return NextResponse.json(
        {
          error: `Delivery failed for ${cleanSender}: ${err.message}`,
          accountErrorType: isAuthError ? "AUTH_FAILED" : "CONNECTION_FAILED",
        },
        { status: 400 }
      );
    } finally {
      // 🔒 मेल जाते ही कनेक्शन तुरंत पूरी तरह क्लोज़ (Socket Terminated)
      activeTransporter.close();
    }

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      sender: cleanSender,
      receiver: cleanReceiver,
      sessionToken: guard.sessionToken,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to dispatch silent warmup mail." },
      { status: 500 }
    );
  }
}