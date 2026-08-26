// src/lib/licenseGuard.ts
import jwt from "jsonwebtoken";
import { connectToCentralDB } from "./db/centralDb";
import { getLicenseModel } from "@/lib/models/License";
import { getLicenseWithCache, forcePurgeLicenseCache } from "./licenseCache";

const JWT_SECRET: string = process.env.JWT_SECRET_KEY || (() => {
  throw new Error("JWT_SECRET_KEY is missing in environment variables!");
})();

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
  machineId?: string;
  ok: boolean;
  reason?: "NEW_DEVICE" | "SUSPENDED" | "EXPIRED" | "ACTIVE" | "DB_ERROR";
  expiryDate?: string;
  userId?: string;
  licenseId?: string;
  error?: string;
  sessionToken?: string;
  clearClientSession?: boolean;
}

export async function verifyLicenseAndDevice(
  rawAppDomain: string,
  machineId?: string | null,
  sessionToken?: string | null
): Promise<GuardResult> {
  if (!ENABLE_DEVICE_LOCK) return { ok: true, reason: "ACTIVE", machineId: machineId || undefined };

  const appDomain = cleanAppDomain(rawAppDomain);
  const effectiveMachineId = machineId ? machineId.trim() : "";

  if (!effectiveMachineId) {
    return { ok: false, reason: "NEW_DEVICE", error: "Hardware fingerprint missing.", clearClientSession: true };
  }

  try {
    // ⚡ स्टेप 1: सीधे RAM कैशे से उठाओ (0 DB Query)
    let license = await getLicenseWithCache(appDomain);

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

    // ⚡ स्टेप 2: स्टेटस चेक
    if (license.status !== "ACTIVE") {
      return {
        ok: false,
        reason: "SUSPENDED",
        expiryDate: formattedExpiry,
        error: "License Suspended. Contact Admin.",
        clearClientSession: true,
      };
    }

    // ⚡ स्टेप 3: एक्सपायरी चेक
    if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
      return {
        ok: false,
        reason: "EXPIRED",
        expiryDate: formattedExpiry,
        error: `Subscription Expired on ${formattedExpiry}.`,
        clearClientSession: true,
      };
    }

    // ⚡ स्टेप 4: हार्डवेयर बाइंडिंग & मिसमैच चेक
    if (!license.lockedDeviceId || license.lockedDeviceId.trim() === "") {
      const centralConn = await connectToCentralDB();
      const License = getLicenseModel(centralConn);
      await License.updateOne(
        { appDomain },
        { lockedDeviceId: effectiveMachineId, lastBoundAt: new Date() }
      );
      license.lockedDeviceId = effectiveMachineId;
      forcePurgeLicenseCache(appDomain); // नई बाइंडिंग के बाद कैशे रिफ्रेश
    } else if (license.lockedDeviceId !== effectiveMachineId) {
      return {
        ok: false,
        reason: "NEW_DEVICE",
        expiryDate: formattedExpiry,
        error: "Device mismatch! Please contact Admin to reset your hardware binding.",
        clearClientSession: true,
      };
    }

    // ⚡ स्टेप 5: 24-घंटे का JWT और टोकन वर्जन मैच
    const currentVersion = license.tokenVersion || 1;
    const resolvedUserId = String(license._id);
    let shouldGenerateNewToken = true;
    let finalSessionToken = sessionToken || "";

    if (sessionToken && sessionToken !== "SECURE_AUTH") {
      try {
        const decoded: any = jwt.verify(sessionToken, JWT_SECRET);
        if (
          decoded &&
          decoded.domain === appDomain &&
          decoded.machineId === effectiveMachineId &&
          decoded.tokenVersion === currentVersion // अगर एडमिन ने वर्जन बदला, तो यह फेल होगा
        ) {
          shouldGenerateNewToken = false;
        }
      } catch {
        shouldGenerateNewToken = true;
      }
    }

    // ⚡ स्टेप 6: अगर टोकन नहीं है या एडमिन ने फ़ोर्स अपडेट किया है -> नया 24-घंटे का टोकन
    if (shouldGenerateNewToken) {
      finalSessionToken = jwt.sign(
        {
          domain: appDomain,
          machineId: effectiveMachineId,
          userId: resolvedUserId,
          licenseId: resolvedUserId,
          tokenVersion: currentVersion, // टोकन में वर्जन एम्बेड
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      );
    }

    return {
      ok: true,
      reason: "ACTIVE",
      sessionToken: finalSessionToken,
      machineId: effectiveMachineId,
      userId: resolvedUserId,
      licenseId: resolvedUserId,
      expiryDate: formattedExpiry,
    };
  } catch (err: any) {
    console.error("License check error:", err);
    return { ok: false, reason: "DB_ERROR", error: "Database Error: " + err.message };
  }
}