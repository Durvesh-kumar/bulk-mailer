import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

// 5 से 8 सेकंड का सुरक्षित इंसानी डिले
const sleepRandom = (min = 5000, max = 8000): Promise<void> => {
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

interface CampaignPayload {
  senderName: string;
  senderEmail: string;
  appPassword: string;
  recipients: string[];
  subject: string;
  template: string;
}

export async function POST(req: Request) {
  try {
    const body: CampaignPayload = await req.json();
    const { senderName, senderEmail, appPassword, recipients, subject, template } = body;

    if (!senderEmail || !appPassword || !recipients?.length || !subject || !template) {
      return NextResponse.json(
        { error: "सभी फ़ील्ड्स (Sender Email, App Password, Leads, Subject, Body) भरें।" },
        { status: 400 }
      );
    }

    const cleanSender = senderEmail.trim().toLowerCase();
    const cleanPassword = appPassword.replace(/\s+/g, "");
    const cleanName = (senderName || "Babu").trim();

    // शुद्ध Gmail SMTP Transporter (मल्टी-अकाउंट रेडी)
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: cleanSender,
        pass: cleanPassword,
      },
      xMailer: false,
    });

    await transporter.verify();

    const logs: Array<{ email: string; status: "SUCCESS" | "FAILED"; error?: string }> = [];

    for (let i = 0; i < recipients.length; i++) {
      const recipientEmail = recipients[i].trim();

      const randomGreeting = pickRandom(GREETINGS);
      const randomOpener = pickRandom(OPENERS);
      const randomSignOff = pickRandom(SIGN_OFFS);

      let cleanUserBody = template.trim().replace(/^(hi|hello|hey|greetings)[^\n]*\n+/i, "");

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

      try {
        await transporter.sendMail({
          from: `"${cleanName}" <${cleanSender}>`,
          to: recipientEmail,
          subject: subject.trim(),
          text: plainText,
          html: htmlContent,
          headers: {
            "MIME-Version": "1.0",
          },
        });

        logs.push({ email: recipientEmail, status: "SUCCESS" });

        if (i < recipients.length - 1) {
          await sleepRandom(5000, 8000);
        }
      } catch (err: any) {
        logs.push({ email: recipientEmail, status: "FAILED", error: err.message });
      }
    }

    return NextResponse.json({ report: logs });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Authentication / SMTP Error" },
      { status: 500 }
    );
  }
}