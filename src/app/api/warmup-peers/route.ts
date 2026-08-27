import { NextResponse } from "next/server";
import { getTenantDB } from "@/lib/db/tenantDb";
import { getSmtpVaultModel } from "@/lib/models/SmtpVault";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const machineId = searchParams.get("machineId");
    const sessionToken = req.headers.get("x-session-token");

    const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";
    const clientDomain = hostHeader.split(":")[0].toLowerCase().trim();

    const guard = await verifyLicenseAndDevice(clientDomain, machineId, sessionToken);
    if (!guard.ok || !guard.machineId) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const currentUserId = String(guard.licenseId || guard.userId || clientDomain);
    const db = await getTenantDB();
    const VaultModel = getSmtpVaultModel(db);

    const allVaults = await VaultModel.find(
      {},
      { userId: 1, "accounts.email": 1, "accounts.senderName": 1, "accounts.profileTier": 1 }
    ).lean();

    const uniquePeerMap = new Map<string, any>();

    allVaults.forEach((v: any) => {
      const isExternal = String(v.userId) !== currentUserId;
      if (Array.isArray(v.accounts)) {
        v.accounts.forEach((acc: any) => {
          if (acc.email && typeof acc.email === "string") {
            const cleanEmail = acc.email.toLowerCase().trim();
            if (!uniquePeerMap.has(cleanEmail)) {
              uniquePeerMap.set(cleanEmail, {
                email: cleanEmail,
                senderName: acc.senderName || "Warmup Peer",
                profileTier: acc.profileTier || "ACTIVE",
                isExternalPeer: isExternal,
              });
            }
          }
        });
      }
    });

    const uniqueReceivers = Array.from(uniquePeerMap.values());

    return NextResponse.json({
      success: true,
      receivers: uniqueReceivers,
      totalCount: uniqueReceivers.length,
      sessionToken: guard.sessionToken,
    });
  } catch (error: any) {
    console.error("GET /api/warmup-peers Error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch peers" }, { status: 500 });
  }
}