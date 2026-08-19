import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";

// 🔒 1.5s से 2.5s का नेचुरल डिले
const sleepRandom = (min = 1500, max = 2500): Promise<void> => {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const pickRandom = (arr: string[]): string => {
  return arr[Math.floor(Math.random() * arr.length)];
};

const GREETINGS = ["Hi,", "Hello,", "Hey,", "Hi there,"];
const OPENERS = [
  "Hope you are having a productive week.",
  "Hope this note finds you well.",
  "Hope everything is going well on your end.",
  "Reaching out to quickly connect.",
];
const SIGN_OFFS = ["Best regards,", "Thanks & regards,", "Warm regards,", "Best,"];

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
      machineId,
      sessionToken 
    } = body;

    if (!senderEmail || !appPassword || !recipients?.length || !subject || !template) {
      return NextResponse.json(
        { error: "Please fill in all fields (Sender Email, App Password, Leads, Subject, Body)." },
        { status: 400 }
      );
    }

    const hostHeader =
      req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";

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
    const cleanName = (senderName || "Babu").trim();

    // 1. Google Hostname Masking Transport
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: cleanSender,
        pass: cleanPassword,
      },
      name: "mail.google.com",
    });

    try {
      await transporter.verify();
    } catch (authErr: any) {
      return NextResponse.json(
        { error: "Authentication or SMTP error. Please check your email and app password." },
        { status: 401 }
      );
    }

    const logs: Array<{ email: string; status: "SUCCESS" | "FAILED"; error?: string }> = [];

    for (let i = 0; i < recipients.length; i++) {
      const recipientEmail = recipients[i].trim().toLowerCase();

      const randomGreeting = pickRandom(GREETINGS);
      const randomOpener = pickRandom(OPENERS);
      const randomSignOff = pickRandom(SIGN_OFFS);

      let cleanUserBody = template.trim()
        .replace(/^(hi|hello|hey|greetings)[^\n]*\n+/i, "")
        .replace(/^(hope this note finds you well|hope you are having a productive week|reaching out to quickly connect)[^\n]*\n+/i, "");

      const plainText = `${randomGreeting}\n\n${randomOpener}\n\n${cleanUserBody}\n\n${randomSignOff}\n${cleanName}`;

      const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, Helvetica, sans-serif; font-size: 14.5px; line-height: 1.6; color: #111; margin: 0; padding: 0;">
  <p style="margin: 0 0 12px 0;">${randomGreeting}</p>
  <p style="margin: 0 0 12px 0;">${randomOpener}</p>
  <p style="margin: 0 0 12px 0;">${cleanUserBody.replace(/\n\n/g, "</p><p style='margin: 0 0 12px 0;'>").replace(/\n/g, "<br/>")}</p>
  <p style="margin: 16px 0 0 0;">${randomSignOff}<br/>${cleanName}</p>
</body>
</html>
      `.trim();

      // 2. Exact Genuine Google Message-ID
      const randomHex = Math.random().toString(36).substring(2, 15);
      const customMessageId = `<${Date.now()}.${randomHex}@mail.gmail.com>`;

      try {
        await transporter.sendMail({
          from: `"${cleanName}" <${cleanSender}>`,
          to: recipientEmail,
          subject: subject.trim(),
          text: plainText,
          html: htmlContent,
          messageId: customMessageId,
          headers: {
            "MIME-Version": "1.0",
            "Content-Type": "text/html; charset=UTF-8",
          },
        });

        logs.push({ email: recipientEmail, status: "SUCCESS" });

        if (i < recipients.length - 1) {
          await sleepRandom(1500, 2500);
        }
      } catch (err: any) {
        logs.push({ email: recipientEmail, status: "FAILED", error: "Failed to send: " + err.message });
      }
    }

    return NextResponse.json({ 
      report: logs,
      sessionToken: guard.sessionToken 
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Authentication or SMTP error. Please check your email and app password." },
      { status: 500 }
    );
  }
}