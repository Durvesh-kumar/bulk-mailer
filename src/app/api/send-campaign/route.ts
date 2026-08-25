import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";
import { GREETINGS, OPENERS, SIGN_OFFS } from "@/lib/ctaConfig";
import { AccountAgeMode, MODE_CONFIGS } from "@/config/AccountAgeMode";
import { decryptPassword } from "@/lib/encryption"; // 👈 लोकल AES-256 डिक्रिप्शन इम्पोर्ट

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
      accountAgeMode = "AGED",
    } = body;

    if (!senderEmail || !appPassword || !recipients?.length || !subject || !template) {
      return NextResponse.json(
        { error: "Please fill in all required fields (Sender Email, App Password, Leads, Subject, Body)." },
        { status: 400 }
      );
    }

    // 🔒 @/config/accountModes से मोड कॉन्फ़िगरेशन लोड करना
    const selectedMode: AccountAgeMode = (
      MODE_CONFIGS[accountAgeMode as AccountAgeMode] ? accountAgeMode : "AGED"
    ) as AccountAgeMode;
    const rule = MODE_CONFIGS[selectedMode];

    // सुरक्षा नियम: अगर यूजर मोड लिमिट से ज्यादा लीड्स भेजता है
    if (recipients.length > rule.maxLot) {
      return NextResponse.json(
        {
          error: `Safety Limit Exceeded: For ${selectedMode} accounts, maximum allowed emails per batch is ${rule.maxLot}. You submitted ${recipients.length}.`,
        },
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
          clearSession: guard.clearClientSession || false,
        },
        { status: 403 }
      );
    }

    const cleanSender = senderEmail.trim().toLowerCase();

    // 🛡️ Smart Dual Password Handler:
    // 1. अगर यूजर ने सीधे 16-अक्षर का ऐप पासवर्ड टाइप किया है -> सीधा इस्तेमाल करो
    // 2. अगर वॉल्ट का एन्क्रिप्टेड सिफरटेक्स्ट आया है (iv:cipher) -> सर्वर मेमोरी में डिक्रिप्ट करो
    const rawPass = String(appPassword).trim();
    let cleanPassword = rawPass.replace(/\s+/g, "");

    if (rawPass.includes(":") && rawPass.length > 32) {
      try {
        cleanPassword = decryptPassword(rawPass).replace(/\s+/g, "");
      } catch (decErr) {
        console.error("Vault password decryption fallback:", decErr);
      }
    }

    const cleanHeaderName = senderName.trim();

    // 🔒 साइन-ऑफ नाम लॉजिक: अगर कस्टम नाम नहीं है या खाली है, तो सेंडर का नाम ही जाएगा
    const finalSignoffName =
      customSignoffName && customSignoffName.trim().length > 0
        ? customSignoffName.trim()
        : cleanHeaderName;

    // 🔒 SMTP Connection Pool (Max 3 Connections)
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: cleanSender,
        pass: cleanPassword,
      },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      name: "mail.google.com",
    });

    try {
      await transporter.verify();
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
            error: "Authentication / Connection Failed",
          })),
        },
        { status: 400 }
      );
    }

    const logs: Array<{ email: string; status: "SUCCESS" | "FAILED"; error?: string }> = [];
    let isQuotaHit = false;

    // यूजर के टेम्पलेट से डुप्लिकेट ग्रीटिंग/ओपनर लाइन्स को सुरक्षित रूप से क्लीन करना
    const cleanUserBody = template
      .trim()
      .replace(/^(hi|hello|hey|greetings|dear)[^\n]*\n+/i, "")
      .replace(
        /^(hope this note finds you well|hope you are having a productive week|hope you are doing well|hope everything is going well|reaching out to quickly connect)[^\n]*\n+/i,
        ""
      )
      .trim();

    for (let i = 0; i < recipients.length; i++) {
      const recipientEmail = recipients[i].trim().toLowerCase();

      // अगर कोटा लिमिट हिट हो गई, तो बाकी बची लीड्स को वेस्ट किए बिना तुरंत ब्रेक करना
      if (isQuotaHit) {
        break;
      }

      const randomGreeting = pickRandom(GREETINGS);
      const randomOpener = pickRandom(OPENERS);
      const randomSignOff = pickRandom(SIGN_OFFS);

      // रैंडम ग्रीटिंग + रैंडम ओपनर + यूजर की क्लीन बॉडी + रैंडम साइनऑफ + फाइनल नाम
      const plainText = `${randomGreeting}\n\n${randomOpener}\n\n${cleanUserBody}\n\n${randomSignOff}\n\n${finalSignoffName}`;

      try {
        await transporter.sendMail({
          from: `"${cleanHeaderName}" <${cleanSender}>`,
          to: recipientEmail,
          subject: subject.trim(),
          text: plainText,
        });

        logs.push({ email: recipientEmail, status: "SUCCESS" });

        if (i < recipients.length - 1) {
          await sleepRandom(rule.minDelay, rule.maxDelay);
        }
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
          break;
        }
      }
    }

    transporter.close();

    return NextResponse.json({
      report: logs,
      sessionToken: guard.sessionToken,
      modeApplied: selectedMode,
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