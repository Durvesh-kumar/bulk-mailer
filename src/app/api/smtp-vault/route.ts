// src/app/api/smtp-vault/route.ts
import { NextResponse } from "next/server";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";
import { connectToDatabase } from "@/lib/db";
import { SmtpVaultModel, ProfileTier } from "@/lib/models/SmtpVault";

// 🛡️ Strict Security Gatekeeper Helper
async function enforceSecurity(req: Request, machineId: string | null, sessionToken?: string | null) {
  if (!machineId || machineId.trim().length < 10) {
    return { allowed: false, error: "Unauthorized: Invalid or missing hardware identifier.", status: 401 };
  }

  const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";
  const clientDomain = hostHeader.split(":")[0].toLowerCase().trim();

  // आपके मौजूदा लाइसेंस गार्ड से डिवाइस + डोमेन + सेशन का स्ट्रिक्ट वेरिफिकेशन
  const guard = await verifyLicenseAndDevice(clientDomain, machineId, sessionToken || undefined);
  if (!guard.ok) {
    return { 
      allowed: false, 
      error: `Access Denied: ${guard.error || "Device unauthorized or license invalid."}`, 
      status: 403 
    };
  }

  return { allowed: true, domain: clientDomain };
}

// 1. GET (Strictly Isolated Account Read with Optional On-Demand Tier Filtering)
export async function GET(req: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const machineId = searchParams.get("machineId");
    const sessionToken = req.headers.get("x-session-token");
    const requestedTier = searchParams.get("tier"); // 🎯 On-Demand Tier Filter

    const auth = await enforceSecurity(req, machineId, sessionToken);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const cleanMachineId = machineId!.trim();

    // 🔒 स्ट्रिक्ट डबल-फ़िल्टर: केवल वही डेटा निकलेगा जिसका machineId AND appDomain दोनों 100% मैच करेंगे
    const vault = await SmtpVaultModel.findOne(
      { machineId: cleanMachineId, appDomain: auth.domain },
      { accounts: 1 }
    ).lean();

    if (!vault || !vault.accounts) {
      return NextResponse.json({ accounts: [] });
    }

    // 🎯 अगर किसी ख़ास Tier का डेटा माँगा गया है तो सिर्फ़ उसी Tier के अकाउंट्स रिटर्न होंगे
    if (requestedTier && requestedTier !== "ALL") {
      const filtered = vault.accounts.filter((a: any) => a.profileTier === requestedTier);
      return NextResponse.json({ accounts: filtered });
    }

    return NextResponse.json({ accounts: vault.accounts });
  } catch {
    return NextResponse.json({ error: "Security validation error." }, { status: 500 });
  }
}

// 2. POST (Strict Create)
export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { machineId, sessionToken, accountData } = body;

    const auth = await enforceSecurity(req, machineId, sessionToken);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!accountData?.email || !accountData?.appPassword || !accountData?.senderName) {
      return NextResponse.json({ error: "Missing required credential parameters." }, { status: 400 });
    }

    let vault = await SmtpVaultModel.findOne({ 
      machineId: machineId.trim(),
      appDomain: auth.domain 
    });

    if (!vault) {
      vault = new SmtpVaultModel({
        machineId: machineId.trim(),
        appDomain: auth.domain,
        accounts: [],
      });
    }

    const email = accountData.email.toLowerCase().trim();
    const exists = vault.accounts.some((a: any) => a.email === email);
    if (exists) {
      return NextResponse.json({ error: "This Gmail ID already exists in your private vault." }, { status: 400 });
    }

    vault.accounts.push({
      email,
      appPassword: accountData.appPassword.replace(/\s+/g, ""),
      senderName: accountData.senderName.trim(),
      profileTier: (accountData.profileTier as ProfileTier) || "YEAR_2",
    });

    await vault.save();
    return NextResponse.json({ success: true, accounts: vault.accounts }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to securely store account." }, { status: 500 });
  }
}

// 3. PATCH (Strict Atomic Update)
export async function PATCH(req: Request) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { machineId, sessionToken, accountId, updateType, updateData } = body;

    const auth = await enforceSecurity(req, machineId, sessionToken);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!accountId) {
      return NextResponse.json({ error: "Target Account ID is missing." }, { status: 400 });
    }

    const setQuery: Record<string, any> = {};

    if (updateType === "EDIT") {
      if (updateData.senderName) setQuery["accounts.$.senderName"] = updateData.senderName.trim();
      if (updateData.appPassword) setQuery["accounts.$.appPassword"] = updateData.appPassword.replace(/\s+/g, "");
      if (updateData.profileTier) setQuery["accounts.$.profileTier"] = updateData.profileTier as ProfileTier;
    } else if (updateType === "UPGRADE_TIER") {
      setQuery["accounts.$.profileTier"] = updateData.targetTier as ProfileTier;
    }

    // 🔒 स्ट्रिक्ट एटॉमिक अपडेट: मशीन आईडी, डोमेन और अकाउंट आईडी तीनों मैच होने पर ही मॉडिफाई होगा
    const updatedVault = await SmtpVaultModel.findOneAndUpdate(
      { 
        machineId: machineId.trim(), 
        appDomain: auth.domain, 
        "accounts._id": accountId 
      },
      { $set: setQuery },
      { new: true }
    ).lean();

    if (!updatedVault) {
      return NextResponse.json({ error: "Account not found or access denied." }, { status: 404 });
    }

    return NextResponse.json({ success: true, accounts: updatedVault.accounts });
  } catch {
    return NextResponse.json({ error: "Failed to securely update account." }, { status: 500 });
  }
}

// 4. DELETE (Strict Atomic Removal)
export async function DELETE(req: Request) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { machineId, sessionToken, accountId } = body;

    const auth = await enforceSecurity(req, machineId, sessionToken);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!accountId) {
      return NextResponse.json({ error: "Target Account ID is missing." }, { status: 400 });
    }

    // 🔒 स्ट्रिक्ट एटॉमिक डिलीट
    const updatedVault = await SmtpVaultModel.findOneAndUpdate(
      { 
        machineId: machineId.trim(), 
        appDomain: auth.domain 
      },
      { $pull: { accounts: { _id: accountId } } },
      { new: true }
    ).lean();

    if (!updatedVault) {
      return NextResponse.json({ error: "Account not found or access denied." }, { status: 404 });
    }

    return NextResponse.json({ success: true, accounts: updatedVault.accounts });
  } catch {
    return NextResponse.json({ error: "Failed to delete account securely." }, { status: 500 });
  }
}