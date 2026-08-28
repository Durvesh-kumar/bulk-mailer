// src/app/api/warmup-peers/route.ts
import { NextResponse } from "next/server";
import { getTenantDB } from "@/lib/db/tenantDb";
import { getSmtpVaultModel } from "@/lib/models/SmtpVault";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";

// 🧠 इन-मेमोरी कैश (ताकि बार-बार DB क्वेरी न चले)
let cachedPeers: any[] = [];
let lastFetchTime = 0;
const PEER_CACHE_TTL = 5 * 60 * 1000; // 5 मिनट कैश

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const machineId = searchParams.get("machineId");
    const sessionToken = req.headers.get("x-session-token");

    const hostHeader =
      req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";

    const guard = await verifyLicenseAndDevice(hostHeader, machineId, sessionToken);
    if (!guard.ok || !guard.machineId) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const currentUserId = String(guard.licenseId || guard.userId || hostHeader);
    const now = Date.now();

    // अगर कैश मौजूद है तो सीधे कैश से लौटाएँ
    if (cachedPeers.length > 0 && now - lastFetchTime < PEER_CACHE_TTL) {
      const dynamicReceivers = cachedPeers.map((p) => ({
        ...p,
        isExternalPeer: String(p.vaultUserId) !== currentUserId,
      }));

      return NextResponse.json({
        success: true,
        receivers: dynamicReceivers,
        totalCount: dynamicReceivers.length,
        sessionToken: guard.sessionToken,
        cached: true,
      });
    }

    // कैश समाप्त होने पर सिर्फ 1 बार DB क्वेरी
    const db = await getTenantDB();
    const VaultModel = getSmtpVaultModel(db);

    const allVaults = await VaultModel.find(
      {},
      { userId: 1, "accounts.email": 1, "accounts.senderName": 1, "accounts.profileTier": 1, "accounts.appPassword": 1, "accounts.password": 1, "accounts.smtpPassword": 1 }
    ).lean();

    const uniquePeerMap = new Map<string, any>();

    allVaults.forEach((v: any) => {
      if (Array.isArray(v.accounts)) {
        v.accounts.forEach((acc: any) => {
          if (acc.email && typeof acc.email === "string") {
            const cleanEmail = acc.email.toLowerCase().trim();
            const pass = acc.appPassword || acc.password || acc.smtpPassword;
            if (!uniquePeerMap.has(cleanEmail)) {
              uniquePeerMap.set(cleanEmail, {
                email: cleanEmail,
                appPassword: pass ? String(pass) : "",
                senderName: acc.senderName || "Warmup Peer",
                profileTier: acc.profileTier || "ACTIVE",
                vaultUserId: String(v.userId || ""),
              });
            }
          }
        });
      }
    });

    cachedPeers = Array.from(uniquePeerMap.values());
    lastFetchTime = now;

    const uniqueReceivers = cachedPeers.map((p) => ({
      ...p,
      isExternalPeer: String(p.vaultUserId) !== currentUserId,
    }));

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