import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";
import { GREETINGS, OPENERS, SIGN_OFFS } from "@/lib/ctaConfig";

// 🔒 ऑप्टिमाइज्ड नेचुरल रैंडम डिले (1.2s से 2.2s) - हाई स्पीड + स्पैम सेफ
const sleepRandom = (min = 1200, max = 2200): Promise<void> => {
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
      sessionToken 
    } = body;

    // 1. इनपुट वैलिडेशन
    if (!senderEmail || !appPassword || !recipients?.length || !subject || !template) {
      return NextResponse.json(
        { error: "Please fill in all required fields (Sender Email, App Password, Leads, Subject, Body)." },
        { status: 400 }
      );
    }

    const hostHeader =
      req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";

    // 2. लाइसेंस, डिवाइस और सेशन वेरिफिकेशन
    const guard = await verifyLicenseAndDevice(hostHeader, machineId, sessionToken);
    if (!guard.ok) {
      return NextResponse.json(
        { 
          error: guard.error || "License verification failed.",
          clearSession: guard.clearClientSession || false 
        },
        { status: 403 }
      );
    }

    const cleanSender = senderEmail.trim().toLowerCase();
    const cleanPassword = appPassword.replace(/\s+/g, "");
    const cleanHeaderName = (senderName || "Ruby").trim();

    // नीचे का नाम (कस्टम या हेडर नाम)
    const finalSignoffName = (customSignoffName && customSignoffName.trim().length > 0)
      ? customSignoffName.trim()
      : cleanHeaderName;

    // 3. 🚀 हाई-स्पीड SMTP Connection Pool सेटअप
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: cleanSender,
        pass: cleanPassword,
      },
      pool: true,          // सॉकेट्स को री-यूज़ करेगा (फास्ट डिलीवरी)
      maxConnections: 5,   // 5 पैरेलल पाइप्स
      maxMessages: 100,    // 100 मेल्स बाद सेफ री-कनेक्ट
      name: "mail.google.com",
    });

    try {
      await transporter.verify();
    } catch (authErr: any) {
      return NextResponse.json(
        { error: "Authentication failed. Check your Gmail ID or 16-digit App Password." },
        { status: 401 }
      );
    }

    const logs: Array<{ email: string; status: "SUCCESS" | "FAILED"; error?: string }> = [];

    // 4. ईमेल डिस्पैच लूप
    for (let i = 0; i < recipients.length; i++) {
      const recipientEmail = recipients[i].trim().toLowerCase();

      const randomGreeting = pickRandom(GREETINGS);
      const randomOpener = pickRandom(OPENERS);
      const randomSignOff = pickRandom(SIGN_OFFS);

      let cleanUserBody = template.trim()
        .replace(/^(hi|hello|hey|greetings)[^\n]*\n+/i, "")
        .replace(/^(hope this note finds you well|hope you are having a productive week|reaching out to quickly connect)[^\n]*\n+/i, "");

      // साफ़ इनलाइन फ़ॉर्मेट
      const plainText = `${randomGreeting}\n\n${randomOpener}\n\n${cleanUserBody}\n\n${randomSignOff}\n\n${finalSignoffName}`;

      try {
        await transporter.sendMail({
          from: `"${cleanHeaderName}" <${cleanSender}>`,
          to: recipientEmail,
          subject: subject.trim(),
          text: plainText,
        });

        logs.push({ email: recipientEmail, status: "SUCCESS" });

        // मेल के बीच नेचुरल गैप
        if (i < recipients.length - 1) {
          await sleepRandom(1200, 2200);
        }
      } catch (err: any) {
        logs.push({ email: recipientEmail, status: "FAILED", error: "Failed to send: " + err.message });
      }
    }

    // पूल कनेक्शन बंद करें
    transporter.close();

    return NextResponse.json({ 
      report: logs,
      sessionToken: guard.sessionToken 
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error." },
      { status: 500 }
    );
  }
}