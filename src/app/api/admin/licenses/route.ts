// src/app/api/admin/licenses/route.ts
import { NextResponse } from "next/server";
import { LicenseModel } from "@/lib/models/License";
import { cleanAppDomain } from "@/lib/licenseGuard";
import { connectToCentralDB } from "@/lib/db/centralDb";
import { getTenantDB } from "@/lib/db/tenantDb";
import { SmtpVaultModel, getSmtpVaultModel } from "@/lib/models/SmtpVault";
import { forcePurgeLicenseCache } from "@/lib/licenseCache"; // 👈 [FIX] सीधे RAM कैशे इनवैलिडेटर

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY;

// 📅 शुद्ध कैलेंडर मंथ/ईयर जोड़ने वाला फंक्शन
function addMonthsToDate(fromDate: Date, monthsToAdd: number): Date {
  const date = new Date(fromDate);
  const originalDay = date.getDate();
  
  date.setMonth(date.getMonth() + monthsToAdd);
  
  if (date.getDate() < originalDay) {
    date.setDate(0);
  }
  return date;
}

// 1. GET (List all licenses)
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("x-admin-key");
    if (!ADMIN_SECRET || authHeader !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    await connectToCentralDB();
    const licenses = await LicenseModel.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, licenses: licenses || [] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Server Error" }, { status: 500 });
  }
}

// 2. POST (Create, Renew, Reset Device, or Toggle Status)
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("x-admin-key");
    if (!ADMIN_SECRET || authHeader !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    await connectToCentralDB();

    const body = await req.json();
    const action = body.action || "CREATE_APP_DOMAIN";
    const targetDomain = cleanAppDomain(body.appDomain || "");
    const clientName = (body.clientName || "Client").trim();
    
    const monthsToAdd = body.validityMonths ? Number(body.validityMonths) : (Number(body.validityYears || 1) * 12);

    if (!targetDomain) {
      return NextResponse.json({ error: "App Domain is required" }, { status: 400 });
    }

    // 1️⃣ CREATE ACTION
    if (action === "CREATE_APP_DOMAIN" || action === "CREATE_LICENSE") {
      const existing = await LicenseModel.findOne({ appDomain: targetDomain });

      if (existing) {
        return NextResponse.json(
          { error: `App Domain (${targetDomain}) is already registered!` },
          { status: 400 }
        );
      }

      const expiry = addMonthsToDate(new Date(), monthsToAdd);

      const newLicense = await LicenseModel.create({
        clientName: clientName,
        appDomain: targetDomain,
        lockedDeviceId: null,
        status: "ACTIVE",
        tokenVersion: 1,
        expiresAt: expiry,
      });

      forcePurgeLicenseCache(targetDomain); // ⚡ कैशे पर्ज

      return NextResponse.json({
        success: true,
        message: `Domain (${targetDomain}) whitelisted until ${expiry.toLocaleDateString("en-GB")}!`,
        license: newLicense,
      });
    }

    // 2️⃣ RENEW SUBSCRIPTION
    if (action === "RENEW_SUBSCRIPTION") {
      const lic = await LicenseModel.findOne({ appDomain: targetDomain });
      if (!lic) return NextResponse.json({ error: `Domain not found.` }, { status: 404 });

      const baseDate = lic.expiresAt && new Date(lic.expiresAt) > new Date()
        ? new Date(lic.expiresAt)
        : new Date();

      const newExpiry = addMonthsToDate(baseDate, monthsToAdd);
      lic.expiresAt = newExpiry;
      lic.status = "ACTIVE";
      lic.tokenVersion = (lic.tokenVersion || 1) + 1; // 👈 टोकन वर्जन अपडेट
      await lic.save();

      forcePurgeLicenseCache(targetDomain); // ⚡ कैशे पर्ज

      const periodLabel = monthsToAdd === 12 ? "1 Year" : `${monthsToAdd} Month(s)`;

      return NextResponse.json({
        success: true,
        message: `Plan renewed (+${periodLabel})! Extended until ${newExpiry.toLocaleDateString("en-GB")}.`,
      });
    }

    // 3️⃣ RESET DEVICE LOCK
    if (action === "RESET_DEVICE") {
      const lic = await LicenseModel.findOne({ appDomain: targetDomain });
      if (!lic) return NextResponse.json({ error: `Domain not found.` }, { status: 404 });

      lic.lockedDeviceId = null;
      lic.lastResetAt = new Date();
      lic.tokenVersion = (lic.tokenVersion || 1) + 1; // 👈 पुराना टोकन इनवैलिड
      await lic.save();

      forcePurgeLicenseCache(targetDomain); // ⚡ कैशे पर्ज

      return NextResponse.json({
        success: true,
        message: `Device lock cleared for ${targetDomain}! Ready for new machine binding.`,
      });
    }

    // 4️⃣ TOGGLE STATUS (Active / Suspended)
    if (action === "TOGGLE_STATUS") {
      const lic = await LicenseModel.findOne({ appDomain: targetDomain });
      if (!lic) return NextResponse.json({ error: `Domain not found.` }, { status: 404 });

      lic.status = lic.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
      lic.lastResetAt = new Date();
      lic.tokenVersion = (lic.tokenVersion || 1) + 1; // 👈 पुराना टोकन तुरंत इनवैलिड
      await lic.save();

      forcePurgeLicenseCache(targetDomain); // ⚡ कैशे पर्ज

      return NextResponse.json({
        success: true,
        message: `Status of ${targetDomain} changed to ${lic.status}`,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

// 3. DELETE (Cascading Delete)
export async function DELETE(req: Request) {
  try {
    const authHeader = req.headers.get("x-admin-key");
    if (!ADMIN_SECRET || authHeader !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    const body = await req.json();
    const targetDomain = cleanAppDomain(body.appDomain || "");
    const directUserId = body.userId ? String(body.userId).trim() : "";

    if (!targetDomain && !directUserId) {
      return NextResponse.json(
        { error: "Target App Domain or userId is required for deletion." },
        { status: 400 }
      );
    }

    await connectToCentralDB();

    let deletedLicense = null;
    if (targetDomain) {
      deletedLicense = await LicenseModel.findOneAndDelete({ appDomain: targetDomain });
    } else if (directUserId) {
      deletedLicense = await LicenseModel.findOneAndDelete({ _id: directUserId });
    }

    if (!deletedLicense) {
      return NextResponse.json({ error: "License not found in Central Database." }, { status: 404 });
    }

    const resolvedUserId = String(deletedLicense._id);

    try {
      const tenantConn = await getTenantDB();
      const TenantVault = getSmtpVaultModel(tenantConn);

      await TenantVault.deleteMany({
        $or: [
          { userId: resolvedUserId },
          ...(directUserId ? [{ userId: directUserId }] : [])
        ]
      });
    } catch (tenantErr) {
      console.error("Warning: Tenant DB cleanup failed during license deletion:", tenantErr);
    }

    if (deletedLicense.appDomain) {
      forcePurgeLicenseCache(deletedLicense.appDomain); // ⚡ कैशे से भी डिलीट
    }

    return NextResponse.json({
      success: true,
      message: `License (${deletedLicense.appDomain || resolvedUserId}) and all associated tenant vault data have been permanently deleted!`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to delete license." }, { status: 500 });
  }
}