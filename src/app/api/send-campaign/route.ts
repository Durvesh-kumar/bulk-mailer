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

    // 2. Safety limit enforcement
    const rule = MODE_CONFIGS[accountAgeMode as AccountAgeMode];
    if (rule && recipients.length > rule.maxLot) {
      return NextResponse.json(
        { error: `Safety Limit Exceeded: Max allowed emails per batch is ${rule.maxLot}. You submitted ${recipients.length}.` },
        { status: 400 }
      );
    }

    // 3. Security and license verification
    const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";
    const guard = await verifyLicenseAndDevice(hostHeader, machineId, sessionToken);
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error || "License verification failed.", clearSession: guard.clearClientSession || false },
        { status: 403 }
      );
    }

    // 4. Sender credentials preparation
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

    // Fresh Transporter per dispatch (No connection pooling to prevent Gmail IP bans)
    const getFreshTransporter = () =>
      nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: cleanSender, pass: cleanPassword },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
      });

    // 5. Initial sender authentication verification
    const initialTest = getFreshTransporter();
    try {
      await initialTest.verify();
    } catch (authErr: any) {
      const isAuthError = authErr.code === "EAUTH" || authErr.responseCode === 535;
      return NextResponse.json(
        {
          error: "Authentication failed. Sender Gmail ID or 16-digit App Password is invalid.",
          accountError: true,
          accountErrorType: isAuthError ? "AUTH_FAILED" : "CONNECTION_FAILED",
          report: recipients.map((email: string) => ({
            email,
            status: "FAILED",
            error: "Sender Authentication Failed",
            bounceCode: 535,
          })),
        },
        { status: 401 }
      );
    } finally {
      initialTest.close();
    }

    // 6. Template preparation
    const logs: Array<{
      email: string;
      status: "SUCCESS" | "FAILED";
      error?: string;
      bounceCode?: number | string;
      isBadRecipient?: boolean;
    }> = [];

    let isQuotaHit = false;
    let badRecipientDetected = false;

    const cleanUserBody = template
      .trim()
      .replace(/^(hi|hello|hey|greetings|dear)[^\n]*\n+/i, "")
      .replace(/^(hope.*?connect)[^\n]*\n+/i, "")
      .trim();

    // 7. Dispatch loop
    for (let i = 0; i < recipients.length; i++) {
      const recipientEmail = recipients[i].trim().toLowerCase();
      if (isQuotaHit || badRecipientDetected) break;

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
        const errMessage = String(err?.message || "").toLowerCase();
        const errResponse = String(err?.response || "").toLowerCase();
        const respCode = Number(err?.responseCode) || 0;

        // A. 🛑 Sender Daily Quota Reached (Google 5.4.5 Limit)
        const isQuotaErr = respCode === 550 && /5\.4\.5|quota|limit|daily limit/i.test(errMessage + errResponse);
        if (isQuotaErr) {
          isQuotaHit = true;
          logs.push({
            email: recipientEmail,
            status: "FAILED",
            error: "Sender daily quota exceeded (Google 5.4.5 Daily Limit Reached).",
            bounceCode: 550,
          });
          break;
        }

        // B. 🛑 Recipient-Side Handshake Rejection (550, 553, 501, 552, 554)
        const isBadRecipient =
          respCode === 550 ||
          respCode === 553 ||
          respCode === 501 ||
          respCode === 552 ||
          respCode === 554 ||
          /user not found|does not exist|mailbox unavailable|invalid recipient|no such user|relay denied|syntax error/i.test(
            errMessage + errResponse
          );

        if (isBadRecipient) {
          badRecipientDetected = true;
          // सटीक बाउंस कोड ताकि डैशबोर्ड के चार्ट में एकदम सही संख्या दिखे
          const cleanBounceCode = respCode || (errMessage.includes("553") ? 553 : 550);
          logs.push({
            email: recipientEmail,
            status: "FAILED",
            error: err?.response || "Recipient address not found or rejected by receiving mail server.",
            bounceCode: cleanBounceCode,
            isBadRecipient: true,
          });
          // खराब लीड मिलते ही तुरंत बाहर निकलें ताकि वर्कर इसे स्वैप कर सके
          break;
        }

        // C. 🛑 Rate Limited / Connection Blocked (421)
        const isRateLimited = respCode === 421 || /try again later|service unavailable|too many connections/i.test(errMessage + errResponse);
        if (isRateLimited) {
          logs.push({
            email: recipientEmail,
            status: "FAILED",
            error: "Temporary Rate Limit or Greylisting (421): " + (err?.message || "Service unavailable"),
            bounceCode: 421,
          });
        } else {
          // D. General Delivery Failure
          logs.push({
            email: recipientEmail,
            status: "FAILED",
            error: "Delivery failed: " + (err?.message || "Unknown error"),
            bounceCode: respCode || "OTHER",
          });
        }
      } finally {
        currentTransporter.close();
      }

      if (isQuotaHit || badRecipientDetected) break;
      if (rule && i < recipients.length - 1) {
        await sleepRandom(rule.minDelay, rule.maxDelay);
      }
    }

    // 8. Return comprehensive diagnostic response for Dashboard & Worker Telemetry
    return NextResponse.json({
      report: logs,
      sessionToken: guard.sessionToken,
      expiryDate: guard.expiryDate || "",
      modeApplied: accountAgeMode,
      accountError: isQuotaHit,
      accountErrorType: isQuotaHit ? "QUOTA_EXCEEDED" : null,
      shouldSwapLeadImmediately: badRecipientDetected,
      badLeadCount: logs.filter((l) => l.isBadRecipient).length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error occurred." }, { status: 500 });
  }
}