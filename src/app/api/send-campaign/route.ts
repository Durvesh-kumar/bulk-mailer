// src/app/api/send-campaign/route.ts
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";
import { GREETINGS, OPENERS, SIGN_OFFS } from "@/lib/ctaConfig";
import { AccountAgeMode, MODE_CONFIGS } from "@/config/AccountAgeMode";
import { decryptPassword } from "@/lib/encryption";

const sleepRandom = (min: number, max: number): Promise<void> => {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const pickRandom = (arr: string[]): string => {
  return arr[Math.floor(Math.random() * arr.length)];
};

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      senderName,
      senderEmail,
      appPassword,
      recipients,
      subject,
      template,
      customSignoffName,
      machineId,
      sessionToken,
      accountAgeMode,
    } = body;

    // 1. इनपुट वैलिडेशन
    if (!senderEmail || !appPassword || !recipients?.length || !subject || !template) {
      return NextResponse.json(
        { error: "Please fill in all required fields (Sender Email, App Password, Leads, Subject, Body)." },
        { status: 400 }
      );
    }

    // 🔒 सीधे आपके MODE_CONFIGS से रूल उठाएगा
    const rule = MODE_CONFIGS[accountAgeMode as AccountAgeMode];

    if (rule && recipients.length > rule.maxLot) {
      return NextResponse.json(
        {
          error: `Safety Limit Exceeded: Max allowed emails per batch is ${rule.maxLot}. You submitted ${recipients.length}.`,
        },
        { status: 400 }
      );
    }

    const hostHeader =
      req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";

    // 2. लाइसेंस व सेशन वेरिफिकेशन
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

    const cleanSender = senderEmail.trim().toLowerCase();
    const rawPass = String(appPassword).trim();
    let cleanPassword = rawPass.replace(/\s+/g, "");

    // 🔐 पासवर्ड डिक्रिप्शन
    if (rawPass.includes(":") && rawPass.length > 20) {
      try {
        cleanPassword = decryptPassword(rawPass).replace(/\s+/g, "");
      } catch (decErr) {
        console.error("Vault password decryption fallback:", decErr);
      }
    }

    // 🎯 सेंडर और साइन-ऑफ नाम लॉजिक
    const cleanHeaderName = String(senderName || "").trim();
    const finalSignoffName = (customSignoffName && customSignoffName.trim().length > 0)
      ? customSignoffName.trim()
      : cleanHeaderName;

    // 🚀 SMTP फ़ैक्ट्री
    const getFreshTransporter = () => {
      return nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: cleanSender,
          pass: cleanPassword,
        },
        // name: "mail.google.com",
      });
    };

    // शुरुआती क्रेडेंशियल टेस्ट और कनेक्शन क्लोज़
    const initialTest = getFreshTransporter();
    try {
      await initialTest.verify();
    } catch (authErr: any) {
      const isAuthError = authErr.code === "EAUTH" || authErr.responseCode === 535;
      return NextResponse.json(
        {
          error: "Authentication failed. Check your Gmail ID or 16-digit App Password.",
          accountError: true,
          accountErrorType: isAuthError ? "AUTH_FAILED" : "CONNECTION_FAILED",
          report: recipients.map((email: string) => ({
            email,
            status: "FAILED",
            error: "Authentication Failed",
          })),
        },
        { status: 400 }
      );
    } finally {
      initialTest.close();
    }

    const logs: Array<{ email: string; status: "SUCCESS" | "FAILED"; error?: string }> = [];
    let isQuotaHit = false;

    // टेम्पलेट क्लीनिंग
    const cleanUserBody = template
      .trim()
      .replace(/^(hi|hello|hey|greetings|dear)[^\n]*\n+/i, "")
      .replace(
        /^(hope this note finds you well|hope you are having a productive week|hope you are doing well|hope everything is going well|reaching out to quickly connect)[^\n]*\n+/i,
        ""
      )
      .trim();

    // 📨 ईमेल डिस्पैच लूप
    for (let i = 0; i < recipients.length; i++) {
      const recipientEmail = recipients[i].trim().toLowerCase();

      if (isQuotaHit) break;

      const randomGreeting = pickRandom(GREETINGS);
      const randomOpener = pickRandom(OPENERS);
      const randomSignOff = pickRandom(SIGN_OFFS);

      const plainText = `${randomGreeting}\n\n${randomOpener}\n\n${cleanUserBody}\n\n${randomSignOff}\n\n${finalSignoffName}`;

      const currentTransporter = getFreshTransporter();

      try {
        await currentTransporter.sendMail({
          from: cleanHeaderName ? `"${cleanHeaderName}" <${cleanSender}>` : cleanSender,
          to: recipientEmail,
          subject: subject.trim(),
          text: plainText,
        });

        logs.push({ email: recipientEmail, status: "SUCCESS" });
      } catch (err: any) {
        const errMessage = err.message || "";
        const isQuotaErr =
          errMessage.includes("5.4.5") ||
          errMessage.toLowerCase().includes("quota") ||
          errMessage.toLowerCase().includes("limit");

        logs.push({
          email: recipientEmail,
          status: "FAILED",
          error: "Failed to send: " + errMessage,
        });

        if (isQuotaErr) {
          isQuotaHit = true;
        }
      } finally {
        currentTransporter.close();
      }

      if (isQuotaHit) break;

      // ⏱️ सीधा आपके MODE_CONFIGS के minDelay और maxDelay से चलेगा
      if (rule && i < recipients.length - 1) {
        await sleepRandom(rule.minDelay, rule.maxDelay);
      }
    }

    return NextResponse.json({
      report: logs,
      sessionToken: guard.sessionToken,
      modeApplied: accountAgeMode,
      accountError: isQuotaHit,
      accountErrorType: isQuotaHit ? "QUOTA_EXCEEDED" : null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error." },
      { status: 500 }
    );
  }
}