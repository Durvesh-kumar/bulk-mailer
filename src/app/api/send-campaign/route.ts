import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";

// 🔒 4.5s से 5.0s का सुरक्षित रैंडम डिले (Gmail Anti-Spam Human Mimicking)
const sleepRandom = (min = 4500, max = 5000): Promise<void> => {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const pickRandom = (arr: string[]): string => {
  return arr[Math.floor(Math.random() * arr.length)];
};

// 🎯 Spintax Variation Banks (100% Inbox Placement Formula)
const GREETINGS = ["Hi,", "Hello,", "Hey,", "Hi there,"];
const OPENERS = [
  "Hope you are having a productive week.",
  "Hope this note finds you well.",
  "Hope everything is going well on your end.",
  "Reaching out to quickly connect.",
];
const SIGN_OFFS = ["Best regards,", "Thanks & regards,", "Warm regards,", "Best,"];

// Execution timeout configuration for Vercel Serverless Functions
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

    // 1. Mandatory Input Fields Validation
    if (!senderEmail || !appPassword || !recipients?.length || !subject || !template) {
      return NextResponse.json(
        { error: "Please fill in all required fields (Sender Email, App Password, Leads, Subject, Body)." },
        { status: 400 }
      );
    }

    // 2. Extract Host / App Domain from Request Headers
    const hostHeader =
      req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";

    // 3. License, App Domain Whitelist, Device Lock & 24-Hour Cache Check
    const guard = await verifyLicenseAndDevice(hostHeader, machineId, sessionToken);
    if (!guard.ok) {
      return NextResponse.json(
        { 
          error: guard.error || "License verification failed or device unauthorized.",
          clearSession: guard.clearClientSession || false 
        },
        { status: 403 }
      );
    }

    const cleanSender = senderEmail.trim().toLowerCase();
    const cleanPassword = appPassword.replace(/\s+/g, "");
    const cleanName = (senderName || "Babu").trim();

    // 4. Dynamic SMTP Setup (Auto-Detect Zoho vs Gmail)
    const isZoho = cleanSender.includes("@zoho") || !cleanSender.endsWith("@gmail.com");
    const smtpHost = isZoho ? "smtppro.zoho.in" : "smtp.gmail.com";

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: 465,
      secure: true,
      auth: {
        user: cleanSender,
        pass: cleanPassword,
      },
      name: isZoho ? "zoho.com" : "mail.google.com",
    });

    // 5. Verify SMTP Credentials before dispatching loop
    try {
      await transporter.verify();
    } catch (authErr: any) {
      return NextResponse.json(
        { error: `Authentication failed on ${smtpHost}. Check your email ID or 16-digit App Password.` },
        { status: 401 }
      );
    }

    const logs: Array<{ email: string; status: "SUCCESS" | "FAILED"; error?: string }> = [];

    // 6. Sequential Email Dispatch Loop with Human Randomization & Dynamic Variations
    for (let i = 0; i < recipients.length; i++) {
      const recipientEmail = recipients[i].trim().toLowerCase();

      const randomGreeting = pickRandom(GREETINGS);
      const randomOpener = pickRandom(OPENERS);
      const randomSignOff = pickRandom(SIGN_OFFS);

      // Clean leading greetings/openers if user accidentally included them in template box
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

      // Custom RFC-compliant Message-ID header matching sender domain for high inbox delivery
      const randomHex = Math.random().toString(36).substring(2, 15);
      const domainPart = cleanSender.split("@")[1] || "mail.com";
      const customMessageId = `<${Date.now()}.${randomHex}@${domainPart}>`;

      try {
        await transporter.sendMail({
          from: `"${cleanName}" <${cleanSender}>`,
          to: recipientEmail,
          subject: subject.trim(),
          text: plainText,
          html: htmlContent,
          messageId: customMessageId,
        });

        logs.push({ email: recipientEmail, status: "SUCCESS" });

        // Natural human delay (4.5s to 5.0s) between emails in the chunk
        if (i < recipients.length - 1) {
          await sleepRandom(4500, 5000);
        }
      } catch (err: any) {
        logs.push({ email: recipientEmail, status: "FAILED", error: err.message || "Failed to dispatch email" });
      }
    }

    // Return logs + refreshed 24-hour cryptographic sessionToken for client caching
    return NextResponse.json({ 
      report: logs,
      sessionToken: guard.sessionToken 
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error occurred while processing campaign." },
      { status: 500 }
    );
  }
}