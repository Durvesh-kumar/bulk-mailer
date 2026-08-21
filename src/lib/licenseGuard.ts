import { connectToDatabase } from "@/lib/db";
import { LicenseModel } from "@/lib/models/License";

export const ENABLE_DEVICE_LOCK = true;

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
    return { ok: false, reason: "NEW_DEVICE", error: "Machine fingerprint missing." };
  }

  const appDomain = cleanAppDomain(rawAppDomain);

  try {
    await connectToDatabase();
    const license = await LicenseModel.findOne({ appDomain });

    // 1️⃣ डोमेन डेटाबेस में नहीं है
    if (!license) {
      return {
        ok: false,
        reason: "NEW_DEVICE",
        error: `App Domain (${appDomain}) is not registered. Contact Admin.`,
        clearClientSession: true,
      };
    }

    const formattedExpiry = license.expiresAt 
      ? new Date(license.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "N/A";

    // 2️⃣ एक्सपायर हो चुका है
    if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
      return {
        ok: false,
        reason: "EXPIRED",
        expiryDate: formattedExpiry,
        error: `Subscription Expired on ${formattedExpiry}.`,
        clearClientSession: true,
      };
    }

    // 3️⃣ सस्पेंड है
    if (license.status !== "ACTIVE") {
      return {
        ok: false,
        reason: "SUSPENDED",
        expiryDate: formattedExpiry,
        error: "License Suspended. Contact Admin.",
        clearClientSession: true,
      };
    }

    // 4️⃣ पहली बार: Unbound है तो इसी मशीन को लॉक कर दो
    if (!license.lockedDeviceId) {
      license.lockedDeviceId = machineId;
      license.lastBoundAt = new Date();
      await license.save();

      return { ok: true, reason: "ACTIVE", sessionToken: "SECURE_AUTH", expiryDate: formattedExpiry };
    }

    // 5️⃣ दूसरी बार: अगर कोई नया डिवाइस है तो ब्लॉक करो
    if (license.lockedDeviceId !== machineId) {
      return {
        ok: false,
        reason: "NEW_DEVICE",
        expiryDate: formattedExpiry,
        error: "New Device detected on this domain. Please contact Admin.",
        clearClientSession: true,
      };
    }

    // ✅ मशीन सही है -> डायरेक्ट अंदर जाने दो
    return { ok: true, reason: "ACTIVE", sessionToken: "SECURE_AUTH", expiryDate: formattedExpiry };

  } catch (err: any) {
    return { ok: false, reason: "DB_ERROR", error: "Database Error: " + err.message };
  }
}