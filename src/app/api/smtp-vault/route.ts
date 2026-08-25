// src/app/api/smtp-vault/route.ts
import { NextResponse } from "next/server";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";
import { getTenantDB } from "@/lib/db/tenantDb";
import { getSmtpVaultModel, ProfileTier } from "@/lib/models/SmtpVault";
import { encryptPassword, decryptPassword } from "@/lib/encryption";

// 🛡️ Strict Security Gatekeeper Helper
async function enforceSecurity(req: Request, machineId: string | null | undefined, sessionToken?: string | null) {
  const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";
  const clientDomain = hostHeader.split(":")[0].toLowerCase().trim();

  const safeMachineId = machineId || undefined;
  const safeSessionToken = sessionToken || undefined;

  const guard = await verifyLicenseAndDevice(clientDomain, safeMachineId, safeSessionToken);
  if (!guard.ok || !guard.machineId) {
    return { 
      allowed: false, 
      error: `Access Denied: ${guard.error || "Invalid license or device mismatch."}`, 
      status: guard.reason === "NEW_DEVICE" ? 401 : 403 
    };
  }

  // 🎯 लाइसेंस से यूनिक userId निकालना (Fallback to licenseId या domain)
  const resolvedUserId = String(guard.licenseId || guard.userId || clientDomain);

  return { 
    allowed: true, 
    domain: clientDomain, 
    machineId: guard.machineId, 
    sessionToken: guard.sessionToken,
    userId: resolvedUserId 
  };
}

// 1. GET
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const machineId = searchParams.get("machineId");
    const sessionToken = req.headers.get("x-session-token");
    const requestedTier = searchParams.get("tier");
    const checkCooldown = searchParams.get("checkCooldown") === "true";

    const auth = await enforceSecurity(req, machineId, sessionToken);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const db = await getTenantDB();
    const VaultModel = getSmtpVaultModel(db);

    // 🎯 अब डेटाबेस में सिर्फ userId पर फिल्टर होगा
    const vault = await VaultModel.findOne(
      { userId: auth.userId },
      { accounts: 1 }
    ).lean();

    if (!vault || !vault.accounts) {
      return NextResponse.json({ accounts: [], sessionToken: auth.sessionToken });
    }

    // 🎯 हमेशा पासवर्ड को पूरी तरह डिक्रिप्ट करके 16-अक्षर का पासवर्ड ही दें
    let accounts = vault.accounts.map((acc: any) => {
      let clearPass = acc.appPassword;
      try {
        clearPass = decryptPassword(acc.appPassword);
      } catch (e) {
        clearPass = acc.appPassword;
      }
      return {
        ...acc,
        appPassword: clearPass,
      };
    });

    if (requestedTier && requestedTier !== "ALL") {
      accounts = accounts.filter((a: any) => a.profileTier === requestedTier);
    }

    if (checkCooldown) {
      const now = new Date().getTime();
      const COOL_DOWN_PERIOD = 24 * 60 * 60 * 1000;

      accounts = accounts.map((acc: any) => {
        if (acc.lastSentAt) {
          const lastSentTime = new Date(acc.lastSentAt).getTime();
          const timeDiff = now - lastSentTime;
          if (timeDiff < COOL_DOWN_PERIOD) {
            return { 
              ...acc, 
              isCoolingDown: true, 
              remainingHours: Math.ceil((COOL_DOWN_PERIOD - timeDiff) / (1000 * 60 * 60)) 
            };
          }
        }
        return { ...acc, isCoolingDown: false };
      });
    }

    return NextResponse.json({ accounts, sessionToken: auth.sessionToken });
  } catch (error: any) {
    console.error("GET /api/smtp-vault Error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch accounts." }, { status: 500 });
  }
}

// 2. POST
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { machineId, sessionToken, accountData } = body;

    const auth = await enforceSecurity(req, machineId, sessionToken);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!accountData?.email || !accountData?.appPassword || !accountData?.senderName) {
      return NextResponse.json({ error: "Missing required credential parameters." }, { status: 400 });
    }

    const db = await getTenantDB();
    const VaultModel = getSmtpVaultModel(db);

    // 🎯 userId के आधार पर वॉल्ट ढूंढो या नया बनाओ
    let vault = await VaultModel.findOne({ userId: auth.userId });

    if (!vault) {
      vault = new VaultModel({
        userId: auth.userId,
        accounts: [],
      });
    }

    const email = accountData.email.toLowerCase().trim();
    const exists = vault.accounts.some((a: any) => a.email === email);
    if (exists) {
      return NextResponse.json({ error: "This Gmail ID already exists in your private vault." }, { status: 400 });
    }

    let cleanAppPassword = accountData.appPassword.replace(/\s+/g, "");
    let secureEncryptedPassword = "";
    try {
      secureEncryptedPassword = encryptPassword(cleanAppPassword);
    } catch (encErr: any) {
      console.error("Encryption failed in POST /api/smtp-vault:", encErr);
      return NextResponse.json({ error: `Encryption Error: ${encErr.message}` }, { status: 500 });
    }

    vault.accounts.push({
      email,
      appPassword: secureEncryptedPassword,
      senderName: accountData.senderName.trim(),
      profileTier: (accountData.profileTier as ProfileTier) || "YEAR_2",
      lastSentAt: undefined,
    });

    await vault.save();
    return NextResponse.json({ success: true, message: "Account saved securely.", sessionToken: auth.sessionToken }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/smtp-vault Error:", error);
    return NextResponse.json({ error: error.message || "Failed to securely store account." }, { status: 500 });
  }
}

// 3. PATCH
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { machineId, sessionToken, accountId, updateType, updateData } = body;

    const auth = await enforceSecurity(req, machineId, sessionToken);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const db = await getTenantDB();
    const VaultModel = getSmtpVaultModel(db);

    if (updateType === "BULK_UPDATE_TIMESTAMP") {
      const emailsToUpdate = updateData?.emails || [];
      if (emailsToUpdate.length > 0) {
        const vault = await VaultModel.findOne({ userId: auth.userId });
        if (vault) {
          for (const email of emailsToUpdate) {
            const acc: any = vault.accounts.find((a: any) => a.email === email.toLowerCase().trim());
            if (acc && acc.lastSentAt) {
              const diff = new Date().getTime() - new Date(acc.lastSentAt).getTime();
              if (diff < 24 * 60 * 60 * 1000) {
                return NextResponse.json({ error: `Account ${email} is still in 24-hour cool-down period!` }, { status: 400 });
              }
            }
          }
        }

        await VaultModel.updateOne(
          { userId: auth.userId },
          { $set: { "accounts.$[elem].lastSentAt": new Date() } },
          { arrayFilters: [{ "elem.email": { $in: emailsToUpdate.map((e: string) => e.toLowerCase().trim()) } }] }
        );
      }
      return NextResponse.json({ success: true, message: "Bulk cool-down timestamps updated successfully!", sessionToken: auth.sessionToken });
    }

    if (!accountId) {
      return NextResponse.json({ error: "Target Account ID is missing." }, { status: 400 });
    }

    const setQuery: Record<string, any> = {};

    if (updateType === "EDIT") {
      if (updateData.senderName) setQuery["accounts.$.senderName"] = updateData.senderName.trim();
      
      // 🛡️ केवल तभी एन्क्रिप्ट करो जब यूजर ने सच में नया पासवर्ड भरा हो
      if (updateData.appPassword && updateData.appPassword.trim().length > 0) {
        const cleanPwd = updateData.appPassword.replace(/\s+/g, "");
        setQuery["accounts.$.appPassword"] = encryptPassword(cleanPwd);
      }
      
      if (updateData.profileTier) setQuery["accounts.$.profileTier"] = updateData.profileTier as ProfileTier;
    } else if (updateType === "UPGRADE_TIER") {
      setQuery["accounts.$.profileTier"] = updateData.targetTier as ProfileTier;
    }

    const updatedVault = await VaultModel.findOneAndUpdate(
      { 
        userId: auth.userId,
        "accounts._id": accountId 
      },
      { $set: setQuery },
      { new: true }
    ).lean();

    if (!updatedVault) {
      return NextResponse.json({ error: "Account not found or access denied." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Account updated successfully.", sessionToken: auth.sessionToken });
  } catch (error: any) {
    console.error("PATCH /api/smtp-vault Error:", error);
    return NextResponse.json({ error: error.message || "Failed to update account." }, { status: 500 });
  }
}

// 4. DELETE
export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { machineId, sessionToken, accountId } = body;

    const auth = await enforceSecurity(req, machineId, sessionToken);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!accountId) {
      return NextResponse.json({ error: "Target Account ID is missing." }, { status: 400 });
    }

    const db = await getTenantDB();
    const VaultModel = getSmtpVaultModel(db);

    const updatedVault = await VaultModel.findOneAndUpdate(
      { userId: auth.userId },
      { $pull: { accounts: { _id: accountId } } },
      { new: true }
    ).lean();

    if (!updatedVault) {
      return NextResponse.json({ error: "Account not found or access denied." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Account deleted securely.", sessionToken: auth.sessionToken });
  } catch (error: any) {
    console.error("DELETE /api/smtp-vault Error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete account securely." }, { status: 500 });
  }
}