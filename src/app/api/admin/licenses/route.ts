// src/app/api/admin/licenses/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { LicenseModel } from "@/lib/models/License";
import { cleanAppDomain } from "@/lib/licenseGuard";

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY;

// 📅 शुद्ध कैलेंडर मंथ/ईयर जोड़ने वाला फंक्शन
function addMonthsToDate(fromDate: Date, monthsToAdd: number): Date {
  const date = new Date(fromDate);
  const originalDay = date.getDate();
  
  date.setMonth(date.getMonth() + monthsToAdd);
  
  // महीने के अंत का ओवरफ्लो प्रिवेंशन (जैसे 31 तारीख वाले महीने)
  if (date.getDate() < originalDay) {
    date.setDate(0);
  }
  return date;
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("x-admin-key");
    if (!ADMIN_SECRET || authHeader !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    await connectToDatabase();
    const licenses = await LicenseModel.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, licenses: licenses || [] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Server Error" }, { status: 500 });
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
    const targetDomain = cleanAppDomain(body.appDomain || "");
    const clientName = (body.clientName || "Client").trim();
    
    // अगर मंथ्स भेजे हैं तो मंथ्स, नहीं तो इयर्स को 12 से गुणा करके मंथ्स बनाएँ
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
        expiresAt: expiry,
      });

      return NextResponse.json({
        success: true,
        message: `Domain (${targetDomain}) whitelisted until ${expiry.toLocaleDateString("en-GB")}!`,
        license: newLicense,
      });
    }

    // 2️⃣ RENEW ACTION (Month या Year दोनों के लिए)
    if (action === "RENEW_SUBSCRIPTION") {
      const lic = await LicenseModel.findOne({ appDomain: targetDomain });
      if (!lic) return NextResponse.json({ error: `Domain not found.` }, { status: 404 });

      // अगर पहले से एक्सपायर है तो आज से जोड़ें, वरना मौजूदा एक्सपायरी से आगे बढ़ाएँ
      const baseDate = lic.expiresAt && new Date(lic.expiresAt) > new Date()
        ? new Date(lic.expiresAt)
        : new Date();

      const newExpiry = addMonthsToDate(baseDate, monthsToAdd);
      lic.expiresAt = newExpiry;
      lic.status = "ACTIVE";
      await lic.save();

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
      await lic.save();

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
      await lic.save();

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