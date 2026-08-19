import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { LicenseModel } from "@/lib/models/License";

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY;

// URL से शुद्ध होस्टनेम निकालने वाला हेल्पर
function cleanInputDomain(raw: string): string {
  if (!raw) return "localhost";
  let cleaned = raw.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  cleaned = cleaned.split("/")[0].split(":")[0].trim();
  return cleaned || "localhost";
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("x-admin-key");
    if (!ADMIN_SECRET || authHeader !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    await connectToDatabase();
    const licenses = await LicenseModel.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ licenses: licenses || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("x-admin-key");
    if (!ADMIN_SECRET || authHeader !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    await connectToDatabase();

    const body = await req.json();
    const action = body.action || "CREATE_APP_DOMAIN";
    const rawDomain = body.appDomain || "";
    const targetDomain = cleanInputDomain(rawDomain);
    const clientName = (body.clientName || "Babu Dev").trim();

    // 1. CREATE ACTION (Whitelist App Domain)
    if (action === "CREATE_APP_DOMAIN" || action === "CREATE_LICENSE") {
      const existing = await LicenseModel.findOne({ appDomain: targetDomain });

      if (existing) {
        return NextResponse.json(
          { error: `App Domain (${targetDomain}) is already registered!` },
          { status: 400 }
        );
      }

      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 365);

      const newLicense = await LicenseModel.create({
        clientName: clientName,
        appDomain: targetDomain,
        lockedDeviceId: null,
        status: "ACTIVE",
        expiresAt: expiry,
      });

      return NextResponse.json({
        message: `App Domain (${targetDomain}) successfully whitelisted for 1 year!`,
        license: newLicense,
      });
    }

    // 2. RENEW ACTION (+365 Days)
    if (action === "RENEW_SUBSCRIPTION") {
      const lic = await LicenseModel.findOne({ appDomain: targetDomain });

      if (!lic) {
        return NextResponse.json({ error: `App Domain (${targetDomain}) not found.` }, { status: 404 });
      }

      const baseDate =
        lic.expiresAt && new Date(lic.expiresAt) > new Date()
          ? new Date(lic.expiresAt)
          : new Date();

      baseDate.setDate(baseDate.getDate() + 365);
      lic.expiresAt = baseDate;
      lic.status = "ACTIVE";
      await lic.save();

      return NextResponse.json({
        message: `Plan renewed! ${targetDomain} extended to ${baseDate.toLocaleDateString()}.`,
      });
    }

    // 3. RESET DEVICE LOCK
    if (action === "RESET_DEVICE") {
      const lic = await LicenseModel.findOne({ appDomain: targetDomain });

      if (!lic) {
        return NextResponse.json({ error: `App Domain (${targetDomain}) not found.` }, { status: 404 });
      }

      lic.lockedDeviceId = null;
      lic.lastResetAt = new Date();
      await lic.save();

      return NextResponse.json({
        message: `Device lock cleared for ${targetDomain}! Ready for new machine binding.`,
      });
    }

    // 4. TOGGLE STATUS (Active / Suspended)
    if (action === "TOGGLE_STATUS") {
      const lic = await LicenseModel.findOne({ appDomain: targetDomain });

      if (!lic) {
        return NextResponse.json({ error: `App Domain (${targetDomain}) not found.` }, { status: 404 });
      }

      lic.status = lic.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
      await lic.save();

      return NextResponse.json({
        message: `Status of ${targetDomain} changed to ${lic.status}`,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}