import { NextResponse } from "next/server";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";
import { decryptPassword } from "@/lib/encryption";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { machineId, sessionToken, action, encryptedPassword } = body;

    // 1. एक्शन चेक करें
    if (action !== "DECRYPT") {
      return NextResponse.json({ error: "Invalid action type" }, { status: 400 });
    }

    // 2. एन्क्रिप्टेड पासवर्ड वैलिडेशन
    if (!encryptedPassword) {
      return NextResponse.json({ error: "Missing encryptedPassword" }, { status: 400 });
    }

    // 3. बिना DB कॉल किए डिवाइस/लाइसेंस वेरिफिकेशन (In-Memory / Token Base)
    const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";
    const clientDomain = hostHeader.split(":")[0].toLowerCase().trim();

    const guard = await verifyLicenseAndDevice(clientDomain, machineId, sessionToken);
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error || "Access Denied: Invalid security credentials." },
        { status: 403 }
      );
    }

    // 4. डायरेक्ट मेमोरी क्रिप्टो डिक्रिप्शन (Zero DB Call)
    let plainPassword = "";
    try {
      plainPassword = decryptPassword(encryptedPassword);
    } catch (decErr: any) {
      console.error("Decryption failed:", decErr);
      return NextResponse.json({ error: "Failed to decrypt password. Invalid ciphertext." }, { status: 500 });
    }

    // 5. डिक्रिप्टेड पासवर्ड रिटर्न करें
    return NextResponse.json({
      success: true,
      decryptedPassword: plainPassword,
      sessionToken: guard.sessionToken || sessionToken,
    });
  } catch (error: any) {
    console.error("POST /api/smtp-vault/decrypt Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error during decryption" },
      { status: 500 }
    );
  }
}