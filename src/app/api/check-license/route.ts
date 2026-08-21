// app/api/check-license/route.ts
import { NextResponse } from "next/server";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { machineId, domain, sessionToken } = body;

    // licenseGuard.ts के जरिए डेटाबेस और डिवाइस वेरीफाई करें
    const result = await verifyLicenseAndDevice(domain, machineId, sessionToken);

    // अगर यूजर नया है, सस्पेंड है या पैकेज एक्सपायर है
    if (!result.ok) {
      return NextResponse.json(
        {
          allowed: false,
          reason: result.reason || "SUSPENDED",
          expiryDate: result.expiryDate || "",
          error: result.error,
          clearSession: result.clearClientSession || false,
        },
        { status: 403 }
      );
    }

    // अगर सब सही है (एक्सेस की अनुमति दें)
    return NextResponse.json({
      allowed: true,
      sessionToken: result.sessionToken,
      expiryDate: result.expiryDate,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        allowed: false,
        reason: "SUSPENDED",
        error: error.message || "License check failed",
      },
      { status: 500 }
    );
  }
}