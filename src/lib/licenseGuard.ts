// src/lib/licenseGuard.ts
import jwt from "jsonwebtoken";
import { connectToCentralDB } from "./db/centralDb";
import { getLicenseModel } from "@/lib/models/License";

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
  let effectiveMachineId = machineId ? machineId.trim() : "";

  // 🛡️ 12-घंटे का टोकन चेक (अगर टोकन वैलिड है और मशीन मैच है)
  if (sessionToken && sessionToken !== "SECURE_AUTH") {
    try {
      const decoded: any = jwt.verify(sessionToken, JWT_SECRET);
      if (decoded && decoded.domain === appDomain) {
        if (!effectiveMachineId && decoded.machineId) {
          effectiveMachineId = decoded.machineId;
        }

        if (decoded.machineId === effectiveMachineId) {
          const resolvedId = String(decoded.userId || decoded.licenseId || appDomain);
          return { 
            ok: true, 
            reason: "ACTIVE", 
            sessionToken, 
            machineId: effectiveMachineId,
            userId: resolvedId,
            licenseId: resolvedId
          };
        }
      }
    } catch (e) {
      // टोकन अमान्य या एक्सपायर होने पर नीचे सेंट्रल DB चेक पर जाएगा
    }
  }

  if (!effectiveMachineId) {
    return { ok: false, reason: "NEW_DEVICE", error: "Hardware fingerprint missing." };
  }

  try {
    const centralConn = await connectToCentralDB();
    const License = getLicenseModel(centralConn);
    const license = await License.findOne({ appDomain });

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

    if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
      return {
        ok: false,
        reason: "EXPIRED",
        expiryDate: formattedExpiry,
        error: `Subscription Expired on ${formattedExpiry}.`,
        clearClientSession: true,
      };
    }

    if (license.status !== "ACTIVE") {
      return {
        ok: false,
        reason: "SUSPENDED",
        expiryDate: formattedExpiry,
        error: "License Suspended. Contact Admin.",
        clearClientSession: true,
      };
    }

    // 🔒 हार्डवेयर बाइंडिंग (अगर खाली है तो तुरंत लॉक करें)
    if (!license.lockedDeviceId || license.lockedDeviceId.trim() === "") {
      license.lockedDeviceId = effectiveMachineId;
      license.lastBoundAt = new Date();
      await license.save();
    } else if (license.lockedDeviceId !== effectiveMachineId) {
      return {
        ok: false,
        reason: "NEW_DEVICE",
        expiryDate: formattedExpiry,
        error: "New Device detected on this domain. Please contact Admin.",
        clearClientSession: true,
      };
    }

    const resolvedUserId = String(license._id);

    // 🎯 नया 12-घंटे का JWT टोकन (पेलोड में userId और licenseId जोड़ दिया)
    const newSessionToken = jwt.sign(
      { 
        domain: appDomain, 
        machineId: effectiveMachineId,
        userId: resolvedUserId,
        licenseId: resolvedUserId 
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    return { 
      ok: true, 
      reason: "ACTIVE", 
      sessionToken: newSessionToken, 
      machineId: effectiveMachineId,
      userId: resolvedUserId,
      licenseId: resolvedUserId,
      expiryDate: formattedExpiry 
    };

  } catch (err: any) {
    console.error("Central DB License Check Failed:", err);
    return { ok: false, reason: "DB_ERROR", error: "Database Error: " + err.message };
  }
}