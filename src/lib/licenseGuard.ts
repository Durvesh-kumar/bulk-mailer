// src/lib/licenseGuard.ts
import crypto from "crypto";
import { connectToDatabase } from "@/lib/db";
import { LicenseModel } from "@/lib/models/License";

export const ENABLE_DEVICE_LOCK = true;

const TOKEN_SECRET = process.env.ADMIN_SECRET_KEY || "reachout_secure_vault_token_2026";

export function cleanAppDomain(input: string): string {
  if (!input) return "localhost";
  return input
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split(":")[0];
}

// टोकन में resetTimestamp जोड़ा गया है ताकि रीसेट होते ही पुराना टोकन अमान्य हो जाए
function generateDailyToken(domain: string, machineId: string, resetTime: number = 0): string {
  const today = new Date().toISOString().slice(0, 10);
  const payload = `${domain}:::${machineId}:::${today}:::${resetTime}`;
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:::${signature}`).toString("base64");
}

function verifyDailyToken(token: string, domain: string, machineId: string, expectedResetTime: number = 0): boolean {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [tDomain, tMachine, tDate, tResetTime, signature] = decoded.split(":::");

    const today = new Date().toISOString().slice(0, 10);
    if (tDate !== today) return false;
    if (tDomain !== domain || tMachine !== machineId) return false;
    if (Number(tResetTime || 0) !== expectedResetTime) return false; // 👈 अगर एडमिन ने रीसेट किया है तो टोकन फेल

    const expectedPayload = `${domain}:::${machineId}:::${today}:::${expectedResetTime}`;
    const expectedSig = crypto.createHmac("sha256", TOKEN_SECRET).update(expectedPayload).digest("hex");

    return signature === expectedSig;
  } catch {
    return false;
  }
}

interface GuardResult {
  ok: boolean;
  error?: string;
  sessionToken?: string;
  clearClientSession?: boolean; // ब्राउज़र से टोकन हटाने का सिग्नल
}

export async function verifyLicenseAndDevice(
  rawAppDomain: string,
  machineId?: string,
  sessionToken?: string
): Promise<GuardResult> {
  if (!ENABLE_DEVICE_LOCK) return { ok: true };

  if (!machineId) {
    return { ok: false, error: "Security Alert: Machine fingerprint missing." };
  }

  const appDomain = cleanAppDomain(rawAppDomain);
  if (!appDomain) {
    return { ok: false, error: "Security Alert: App Domain not detected." };
  }

  try {
    await connectToDatabase();

    const license = await LicenseModel.findOne({ appDomain });

    if (!license) {
      return {
        ok: false,
        error: `Access Denied: App Domain (${appDomain}) is not whitelisted by Admin.`,
        clearClientSession: true,
      };
    }

    if (license.status !== "ACTIVE") {
      return {
        ok: false,
        error: "License Suspended: App Domain is inactive. Contact Admin.",
        clearClientSession: true,
      };
    }

    if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
      return {
        ok: false,
        error: `Subscription Expired: App Domain expired on ${new Date(license.expiresAt).toLocaleDateString()}.`,
        clearClientSession: true,
      };
    }

    const resetTimestamp = license.lastResetAt ? new Date(license.lastResetAt).getTime() : 0;

    // ⚡ 1. FAST-PATH: टोकन + रीसेट टाइमस्टैम्प दोनों मैच होने चाहिए
    if (sessionToken && verifyDailyToken(sessionToken, appDomain, machineId, resetTimestamp)) {
      return { ok: true, sessionToken };
    }

    // 🔍 2. SLOW-PATH: अगर रीसेट हुआ है या पहली बार बाइंड हो रहा है
    if (!license.lockedDeviceId) {
      license.lockedDeviceId = machineId;
      license.lastBoundAt = new Date();
      await license.save();
    } else if (license.lockedDeviceId !== machineId) {
      return {
        ok: false,
        error: "Device Violation: This App Domain is locked to another machine. Contact Admin to reset.",
        clearClientSession: true,
      };
    }

    // नया फ्रेश टोकन जनरेट करें
    const newDailyToken = generateDailyToken(appDomain, machineId, resetTimestamp);
    return { ok: true, sessionToken: newDailyToken };
  } catch (err: any) {
    return { ok: false, error: "Database Error: " + err.message };
  }
}