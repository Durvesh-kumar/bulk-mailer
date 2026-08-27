// src/lib/licenseCache.ts
import { connectToCentralDB } from "./db/centralDb";
import { getLicenseModel } from "@/lib/models/License";

export type CachedLicense = {
  _id: string;
  status: string;
  lockedDeviceId: string;
  tokenVersion: number;
  expiresAt?: Date;
};

// Node.js ग्लोबल इन-मेमोरी मैप
const globalCache = global as unknown as { licenseMemoryMap?: Map<string, CachedLicense> };
export const licenseMemoryMap = globalCache.licenseMemoryMap || new Map<string, CachedLicense>();
if (process.env.NODE_ENV !== "production") globalCache.licenseMemoryMap = licenseMemoryMap;

// ⚡ 1. कैशे से डेटा पढ़ें (Zero-DB Query जब तक कैशे में मौजूद है)
export async function getLicenseWithCache(appDomain: string): Promise<CachedLicense | null> {
  const cached = licenseMemoryMap.get(appDomain);

  if (cached) {
    return cached;
  }

  const centralConn = await connectToCentralDB();
  const License = getLicenseModel(centralConn);
  const license = await License.findOne(
    { appDomain },
    { status: 1, lockedDeviceId: 1, tokenVersion: 1, expiresAt: 1, _id: 1 }
  ).lean();

  if (!license) return null;

  const dataToCache: CachedLicense = {
    _id: String(license._id),
    status: license.status,
    lockedDeviceId: license.lockedDeviceId ? String(license.lockedDeviceId).trim() : "",
    tokenVersion: license.tokenVersion || 1,
    expiresAt: license.expiresAt ? new Date(license.expiresAt) : undefined,
  };

  licenseMemoryMap.set(appDomain, dataToCache);
  return dataToCache;
}

// ⚡ 2. जब एडमिन स्टेटस बदले, रीसेट करे या नई बाइंडिंग हो — तुरंत फ़ोर्सफुल पर्ज
export function forcePurgeLicenseCache(appDomain: string) {
  licenseMemoryMap.delete(appDomain);
}