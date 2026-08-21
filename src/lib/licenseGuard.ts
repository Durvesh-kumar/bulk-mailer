import { connectToDatabase } from "@/lib/db";
import { LicenseModel } from "@/lib/models/License";

export const ENABLE_DEVICE_LOCK = process.env.ENABLE_DEVICE_LOCK === "true" || true;

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

export interface GuardResult {
  ok: boolean;
  reason?: "NEW_DEVICE" | "SUSPENDED" | "EXPIRED" | "ACTIVE" | "DB_ERROR";
  expiryDate?: string;
  error?: string;
}

export async function verifyLicenseAndDevice(
  rawAppDomain: string,
  machineId?: string
): Promise<GuardResult> {
  // अगर लॉक बंद है तो डायरेक्ट जाने दो
  if (!ENABLE_DEVICE_LOCK) return { ok: true, reason: "ACTIVE" };

  // अगर ब्राउज़र/मशीन से ID ही नहीं आई
  if (!machineId) {
    return { 
      ok: false, 
      reason: "NEW_DEVICE", 
      error: "Security Alert: Machine fingerprint missing from device." 
    };
  }

  const appDomain = cleanAppDomain(rawAppDomain);

  try {
    await connectToDatabase();

    const license = await LicenseModel.findOne({ appDomain });

    // 1️⃣ अगर डोमेन डेटाबेस में रजिस्टर्ड नहीं है
    if (!license) {
      return {
        ok: false,
        reason: "NEW_DEVICE",
        error: `App Domain (${appDomain}) is not registered. Please contact Admin.`,
      };
    }

    const formattedExpiry = license.expiresAt 
      ? new Date(license.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "N/A";

    // 2️⃣ अगर सब्सक्रिप्शन एक्सपायर हो चुका है
    if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
      return {
        ok: false,
        reason: "EXPIRED",
        expiryDate: formattedExpiry,
        error: `Subscription Expired: Package expired on ${formattedExpiry}.`,
      };
    }

    // 3️⃣ अगर स्टेटस ACTIVE नहीं है
    if (license.status !== "ACTIVE") {
      return {
        ok: false,
        reason: "SUSPENDED",
        expiryDate: formattedExpiry,
        error: "License Suspended: Account is on hold. Contact Admin.",
      };
    }

    // 4️⃣ पहली बार: अगर कोई मशीन लॉक नहीं है, तो इस मशीन को परमानेंट लॉक कर दो
    if (!license.lockedDeviceId) {
      license.lockedDeviceId = machineId;
      license.lastBoundAt = new Date();
      await license.save();

      return { 
        ok: true, 
        reason: "ACTIVE", 
        expiryDate: formattedExpiry 
      };
    }

    // 5️⃣ दूसरी बार से: सिर्फ मशीन आईडी मैच करो (नो सेशन टोकन ड्रामा)
    if (license.lockedDeviceId !== machineId) {
      return {
        ok: false,
        reason: "NEW_DEVICE",
        expiryDate: formattedExpiry,
        error: "New Device detected! This license is locked to another machine.",
      };
    }

    // ✅ मशीन आईडी मैच हो गई -> सीधा एंट्री
    return { 
      ok: true, 
      reason: "ACTIVE", 
      expiryDate: formattedExpiry 
    };

  } catch (err: any) {
    return { 
      ok: false, 
      reason: "DB_ERROR", 
      error: "Database Connection Error: " + err.message 
    };
  }
}