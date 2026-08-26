// src/app/api/smtp-vault/route.ts
import { NextResponse } from "next/server";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";
import { getTenantDB } from "@/lib/db/tenantDb";
import { getSmtpVaultModel, ProfileTier } from "@/lib/models/SmtpVault";
import { encryptPassword } from "@/lib/encryption";

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

  // 🎯 लाइसेंस से यूनिक userId निकालना
  const resolvedUserId = String(guard.licenseId || guard.userId || clientDomain);

  return { 
    allowed: true, 
    domain: clientDomain, 
    machineId: guard.machineId, 
    sessionToken: guard.sessionToken,
    userId: resolvedUserId 
  };
}

// 1. GET (Fetch Accounts - Returns Safe Encrypted Ciphertext Only)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const machineId = searchParams.get("machineId");
    const sessionToken = req.headers.get("x-session-token");
    const requestedTier = searchParams.get("tier");

    const auth = await enforceSecurity(req, machineId, sessionToken);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const db = await getTenantDB();
    const VaultModel = getSmtpVaultModel(db);

    const vault = await VaultModel.findOne(
      { userId: auth.userId },
      { accounts: 1 }
    ).lean();

    if (!vault || !vault.accounts || vault.accounts.length === 0) {
      return NextResponse.json({ accounts: [], sessionToken: auth.sessionToken });
    }

    // 🔒 नो डिक्रिप्शन इन ब्राउज़र: पासवर्ड हमेशा एन्क्रिप्टेड सिफरटेक्स्ट रहेगा
    let accounts = vault.accounts.map((acc: any) => ({
      _id: String(acc._id),
      email: acc.email,
      senderName: acc.senderName,
      profileTier: acc.profileTier,
      appPassword: acc.appPassword,
      lastSentAt: acc.lastSentAt ? new Date(acc.lastSentAt).toISOString() : null,
    }));

    if (requestedTier && requestedTier !== "ALL") {
      accounts = accounts.filter((a: any) => a.profileTier === requestedTier);
    }

    return NextResponse.json({ accounts, sessionToken: auth.sessionToken });
  } catch (error: any) {
    console.error("GET /api/smtp-vault Error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch accounts." }, { status: 500 });
  }
}

// 2. POST (Add New Smtp Account Only)
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

    let vault = await VaultModel.findOne({ userId: auth.userId });

    if (!vault) {
      vault = new VaultModel({
        userId: auth.userId,
        accounts: [],
      });
    }

    const email = accountData.email.toLowerCase().trim();

    // 🛡️ Case-insensitive email duplicate check
    const exists = vault.accounts.some((a: any) => a.email?.toLowerCase().trim() === email);
    if (exists) {
      return NextResponse.json({ error: "This Gmail ID already exists in your private vault." }, { status: 400 });
    }

    const cleanAppPassword = accountData.appPassword.replace(/\s+/g, "");
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

// 3. PATCH (Update Account or Timestamps)
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

    // 🛡️ Bulk Timestamp Update (फ्रंटएंड टाइमस्टैम्प सिंक)
    if (updateType === "BULK_UPDATE_TIMESTAMP") {
      const records: Array<{ email: string; sentAt?: string | Date }> =
        updateData?.records ||
        (updateData?.emails || []).map((e: string) => ({ email: e, sentAt: new Date() }));

      if (records.length > 0) {
        const bulkOps = records
          .filter((r) => r.email && typeof r.email === "string")
          .map((r) => {
            const cleanEmail = r.email.toLowerCase().trim();
            const timestamp = r.sentAt ? new Date(r.sentAt) : new Date();

            return {
              updateOne: {
                filter: {
                  userId: auth.userId,
                  "accounts.email": cleanEmail,
                },
                update: {
                  $set: {
                    "accounts.$.lastSentAt": timestamp,
                  },
                },
              },
            };
          });

        if (bulkOps.length > 0) {
          await VaultModel.bulkWrite(bulkOps);
        }
      }

      return NextResponse.json({
        success: true,
        message: "Timestamps synced successfully!",
        sessionToken: auth.sessionToken,
      });
    }

    if (!accountId) {
      return NextResponse.json({ error: "Target Account ID is missing." }, { status: 400 });
    }

    const setQuery: Record<string, any> = {};

    if (updateType === "EDIT" && updateData) {
      if (updateData.senderName && updateData.senderName.trim()) {
        setQuery["accounts.$.senderName"] = updateData.senderName.trim();
      }

      if (
        updateData.appPassword &&
        updateData.appPassword.trim().length > 0 &&
        !updateData.appPassword.includes("•") &&
        !updateData.appPassword.includes("*")
      ) {
        const cleanPwd = updateData.appPassword.replace(/\s+/g, "");
        setQuery["accounts.$.appPassword"] = encryptPassword(cleanPwd);
      }

      if (updateData.profileTier) {
        setQuery["accounts.$.profileTier"] = updateData.profileTier as ProfileTier;
      }
    } else if (updateType === "UPGRADE_TIER" && updateData?.targetTier) {
      setQuery["accounts.$.profileTier"] = updateData.targetTier as ProfileTier;
    }

    if (Object.keys(setQuery).length === 0) {
      return NextResponse.json({ success: true, message: "No fields modified.", sessionToken: auth.sessionToken });
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

// 4. DELETE (Remove Smtp Account)
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