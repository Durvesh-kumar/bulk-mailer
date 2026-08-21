import crypto from "crypto";
import { connectToDatabase } from "@/lib/db";
import { LicenseModel } from "@/lib/models/License";

export const ENABLE_DEVICE_LOCK = true;

// 🔒 सुरक्षित रूप से .env से सीक्रेट प्राप्त करने वाला हेल्पर
function getAdminSecret(): string {
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret) {
    throw new Error("Security Alert: ADMIN_SECRET_KEY is missing from environment variables.");
  }
  return secret;
}

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

// 🔐 टोकन जनरेशन
function generateDailyToken(domain: string, machineId: string, resetTime: number = 0): string {
  const secret = getAdminSecret();
  const today = new Date().toISOString().slice(0, 10);
  const payload = `${domain}:::${machineId}:::${today}:::${resetTime}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:::${signature}`).toString("base64");
}

// 🔐 टोकन वेरिफिकेशन
function verifyDailyToken(token: string, domain: string, machineId: string, expectedResetTime: number = 0): boolean {
  try {
    const secret = getAdminSecret();
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [tDomain, tMachine, tDate, tResetTime, signature] = decoded.split(":::");

    const today = new Date().toISOString().slice(0, 10);
    if (tDate !== today) return false;
    if (tDomain !== domain || tMachine !== machineId) return false;
    if (Number(tResetTime || 0) !== expectedResetTime) return false;

    const expectedPayload = `${domain}:::${machineId}:::${today}:::${expectedResetTime}`;
    const expectedSig = crypto.createHmac("sha256", secret).update(expectedPayload).digest("hex");

    return signature === expectedSig;
  } catch {
    return false;
  }
}

export interface GuardResult {
  ok: boolean;
  reason?: "NEW_DEVICE" | "SUSPENDED" | "EXPIRED" | "ACTIVE"; // 👈 NEW_USER को NEW_DEVICE से फिक्स किया
  expiryDate?: string;
  error?: string;
  sessionToken?: string;
  clearClientSession?: boolean;
}

export async function verifyLicenseAndDevice(
  rawAppDomain: string,
  machineId?: string,
  sessionToken?: string
): Promise<GuardResult> {
  if (!ENABLE_DEVICE_LOCK) return { ok: true, reason: "ACTIVE" };

  if (!machineId) {
    return { ok: false, reason: "NEW_DEVICE", error: "Security Alert: Machine fingerprint missing." };
  }

  const appDomain = cleanAppDomain(rawAppDomain);

  try {
    await connectToDatabase();

    const license = await LicenseModel.findOne({ appDomain });

    // 1️⃣ अगर डोमेन डेटाबेस में नहीं है (नया डोमेन / नई मशीन)
    if (!license) {
      return {
        ok: false,
        reason: "NEW_DEVICE",
        error: `App Domain (${appDomain}) is not registered. Please contact Admin.`,
        clearClientSession: true,
      };
    }

    const formattedExpiry = license.expiresAt 
      ? new Date(license.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "N/A";

    // 2️⃣ अगर पैकेज एक्सपायर हो चुका है
    if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
      return {
        ok: false,
        reason: "EXPIRED",
        expiryDate: formattedExpiry,
        error: `Subscription Expired: Package expired on ${formattedExpiry}.`,
        clearClientSession: true,
      };
    }

    // 3️⃣ अगर डोमेन पर पहले से दूसरी मशीन लॉक है (नया डिवाइस)
    if (license.lockedDeviceId && license.lockedDeviceId !== machineId) {
      return {
        ok: false,
        reason: "NEW_DEVICE",
        expiryDate: formattedExpiry,
        error: "New Device detected on this domain. Please register this machine with Admin.",
        clearClientSession: true,
      };
    }

    // 4️⃣ अगर स्टेटस ACTIVE नहीं है
    if (license.status !== "ACTIVE") {
      return {
        ok: false,
        reason: "SUSPENDED",
        expiryDate: formattedExpiry,
        error: "License Suspended: Account is on hold. Contact Admin.",
        clearClientSession: true,
      };
    }

    const resetTimestamp = license.lastResetAt ? new Date(license.lastResetAt).getTime() : 0;

    // 5️⃣ फ़ास्ट-पाथ टोकन वेरिफिकेशन
    if (sessionToken && verifyDailyToken(sessionToken, appDomain, machineId, resetTimestamp)) {
      return { ok: true, reason: "ACTIVE", sessionToken, expiryDate: formattedExpiry };
    }

    // 6️⃣ पहली बार मशीन आईडी ऑटो-बाइंड करना
    if (!license.lockedDeviceId) {
      license.lockedDeviceId = machineId;
      license.lastBoundAt = new Date();
      await license.save();
    }

    // 7️⃣ फ्रेश सेशन टोकन जारी करना
    const newDailyToken = generateDailyToken(appDomain, machineId, resetTimestamp);
    return { ok: true, reason: "ACTIVE", sessionToken: newDailyToken, expiryDate: formattedExpiry };

  } catch (err: any) {
    return { ok: false, reason: "NEW_DEVICE", error: "Database Connection Error: " + err.message };
  }
}