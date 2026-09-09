// api/check-license/route.ts

import { NextResponse } from "next/server";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { machineId, domain, sessionToken } = body;

    const result = await verifyLicenseAndDevice(domain, machineId, sessionToken);

    if (!result.ok) {
      return NextResponse.json(
        {
          allowed: false,
          reason: result.reason || "UNKNOWN", // use actual reason, fallback only if missing
          expiryDate: result.expiryDate || "",
          error: result.error,
          clearSession: result.clearClientSession || false,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      allowed: true,
      sessionToken: result.sessionToken,
      expiryDate: result.expiryDate || "",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        allowed: false,
        reason: "SERVER_ERROR",
        error: error?.message || "License check failed",
        expiryDate: "",
      },
      { status: 500 }
    );
  }
}