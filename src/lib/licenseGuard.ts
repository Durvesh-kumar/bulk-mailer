// src/lib/licenseGuard.ts
import jwt from "jsonwebtoken";
import { connectToCentralDB } from "./db/centralDb";
import { getLicenseModel } from "@/lib/models/License";
import { getLicenseWithCache, forcePurgeLicenseCache } from "./licenseCache";

function getRequiredJwtSecret(): string {
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret || secret.trim() === "") {
    throw new Error("JWT_SECRET_KEY is missing in environment variables!");
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

export async function verifyLicenseAndDevice(
  rawAppDomain: string,
  machineId?: string | null,
  sessionToken?: string | null
) {
  const appDomain = cleanAppDomain(rawAppDomain);
  const currentMachine = machineId ? machineId.trim() : "";

  if (!currentMachine) {
    return {
      ok: false,
      reason: "MISSING_HARDWARE_ID",
      error: "Hardware fingerprint missing.",
      clearClientSession: true,
      expiryDate: null,
      expiresAt: null,
    };
  }

  try {
    let license = await getLicenseWithCache(appDomain);

    if (!license) {
      return {
        ok: false,
        reason: "NEW_USER",
        error: `Domain (${appDomain}) not registered.`,
        clearClientSession: true,
        expiryDate: null,
        expiresAt: null,
      };
    }

    const licenseExpiry = license.expiresAt ? new Date(license.expiresAt).toISOString() : null;

    if (license.status !== "ACTIVE") {
      return {
        ok: false,
        reason: "SUSPENDED",
        error: "License Suspended. Contact Admin.",
        clearClientSession: true,
        expiryDate: licenseExpiry,
        expiresAt: licenseExpiry,
      };
    }

    if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
      return {
        ok: false,
        reason: "EXPIRED",
        error: "Subscription Expired.",
        clearClientSession: true,
        expiryDate: licenseExpiry,
        expiresAt: licenseExpiry,
      };
    }

    const isDeviceUnbound =
      !license.lockedDeviceId ||
      license.lockedDeviceId.trim() === "" ||
      license.lockedDeviceId.toLowerCase() === "unbound";

    if (isDeviceUnbound) {
      const centralConn = await connectToCentralDB();
      const License = getLicenseModel(centralConn);

      await License.updateOne(
        { appDomain },
        { lockedDeviceId: currentMachine, lastBoundAt: new Date() }
      );

      license.lockedDeviceId = currentMachine;
      forcePurgeLicenseCache(appDomain);
    } else if (license.lockedDeviceId !== currentMachine) {
      return {
        ok: false,
        reason: "NEW_DEVICE",
        error: "Device mismatch! Please contact Admin to reset your hardware binding.",
        clearClientSession: true,
        expiryDate: licenseExpiry,
        expiresAt: licenseExpiry,
      };
    }

    const jwtSecret = getRequiredJwtSecret();
    const currentVersion = license.tokenVersion || 1;
    const resolvedUserId = String(license._id);

    const token = jwt.sign(
      {
        domain: appDomain,
        machineId: currentMachine,
        userId: resolvedUserId,
        licenseId: resolvedUserId,
        tokenVersion: currentVersion,
      },
      jwtSecret,
      { expiresIn: "24h" }
    );

    return {
      ok: true,
      reason: "ACTIVE",
      sessionToken: token,
      machineId: currentMachine,
      userId: resolvedUserId,
      licenseId: resolvedUserId,
      expiryDate: licenseExpiry,
      expiresAt: licenseExpiry,
    };
  } catch (err: any) {
    return {
      ok: false,
      reason: "SERVER_ERROR",
      error: "DB Error: " + err.message,
      expiryDate: null,
      expiresAt: null,
    };
  }
}