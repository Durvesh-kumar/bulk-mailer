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

const pickRandom = (arr: string[]): string => arr[Math.floor(Math.random() * arr.length)];

const GENERIC_NAMES = new Set(["info", "sales", "support", "admin", "contact"]);

const getNameFromEmail = (email: string): string => {
  const localPart = email.split("@")[0] || "";
  const cleanName = localPart
    .replace(/[._-]/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  return cleanName && !/^\d+$/.test(cleanName) ? cleanName : "there";
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

    // 1. Input validation
    if (!senderEmail || !appPassword || !recipients?.length || !subject || !template) {
      return NextResponse.json(
        { error: "Please fill in all required fields (Sender Email, App Password, Leads, Subject, Body)." },
        { status: 400 }
      );
    }

    // 2. Safety rule check
    const rule = MODE_CONFIGS[accountAgeMode as AccountAgeMode];
    if (rule && recipients.length > rule.maxLot) {
      return NextResponse.json(
        { error: `Safety Limit Exceeded: Max allowed emails per batch is ${rule.maxLot}. You submitted ${recipients.length}.` },
        { status: 400 }
      );
    }

    // 3. License verification
    const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";
    const guard = await verifyLicenseAndDevice(hostHeader, machineId, sessionToken);
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error || "License verification failed.", clearSession: guard.clearClientSession || false },
        { status: 403 }
      );
    }

    // 4. Sender credentials
    const cleanSender = senderEmail.trim().toLowerCase();
    const rawPass = String(appPassword).trim();
    let cleanPassword = rawPass.replace(/\s+/g, "");
    if (rawPass.includes(":") && rawPass.length > 20) {
      try {
        cleanPassword = decryptPassword(rawPass).replace(/\s+/g, "");
      } catch (decErr) {
        console.error("Vault password decryption fallback:", decErr);
      }
    }

    const cleanHeaderName = String(senderName || "").trim();
    const finalSignoffName = customSignoffName?.trim().length ? customSignoffName.trim() : cleanHeaderName;

    const getFreshTransporter = () =>
      nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: cleanSender, pass: cleanPassword },
      });

    // 5. Initial credential test
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
          report: recipients.map((email: string) => ({ email, status: "FAILED", error: "Authentication Failed" })),
        },
        { status: 400 }
      );
    } finally {
      initialTest.close();
    }

    // 6. Dispatch loop
    const logs: Array<{ email: string; status: "SUCCESS" | "FAILED"; error?: string }> = [];
    let isQuotaHit = false;

    const cleanUserBody = template
      .trim()
      .replace(/^(hi|hello|hey|greetings|dear)[^\n]*\n+/i, "")
      .replace(/^(hope.*?connect)[^\n]*\n+/i, "")
      .trim();

    for (let i = 0; i < recipients.length; i++) {
      const recipientEmail = recipients[i].trim().toLowerCase();
      if (isQuotaHit) break;

      const recipientName = getNameFromEmail(recipientEmail);
      const dynamicGreeting =
        recipientName === "there" || GENERIC_NAMES.has(recipientName.toLowerCase())
          ? pickRandom(GREETINGS)
          : `Hi ${recipientName},`;

      const plainText = `${dynamicGreeting}\n\n${pickRandom(OPENERS)}\n\n${cleanUserBody}\n\n${pickRandom(SIGN_OFFS)}\n\n${finalSignoffName}`;
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
        const isQuotaErr = /5\.4\.5|quota|limit/i.test(errMessage);
        logs.push({ email: recipientEmail, status: "FAILED", error: "Failed to send: " + errMessage });
        if (isQuotaErr) isQuotaHit = true;
      } finally {
        currentTransporter.close();
      }

      if (isQuotaHit) break;
      if (rule && i < recipients.length - 1) await sleepRandom(rule.minDelay, rule.maxDelay);
    }

    // 7. Final response
    return NextResponse.json({
      report: logs,
      sessionToken: guard.sessionToken,
      expiryDate: guard.expiryDate || "",
      modeApplied: accountAgeMode,
      accountError: isQuotaHit,
      accountErrorType: isQuotaHit ? "QUOTA_EXCEEDED" : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error." }, { status: 500 });
  }
}