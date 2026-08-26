// src/lib/licenseCache.ts
import { connectToCentralDB } from "./db/centralDb";
import { getLicenseModel } from "@/lib/models/License";

type CachedLicense = {
  _id: string;
  status: string;
  lockedDeviceId: string;
  tokenVersion: number;
  expiresAt?: Date;
};

// Node.js ग्लोबल इन-मेमोरी मैप (Zero External Cost)
const globalCache = global as unknown as { licenseMemoryMap?: Map<string, CachedLicense> };
export const licenseMemoryMap = globalCache.licenseMemoryMap || new Map<string, CachedLicense>();
if (process.env.NODE_ENV !== "production") globalCache.licenseMemoryMap = licenseMemoryMap;

// ⚡ 1. कैशे से डेटा पढ़ें (Zero-DB: जब तक एडमिन अपडेट न करे, RAM से सीधा रिटर्न)
export async function getLicenseWithCache(appDomain: string) {
  const cached = licenseMemoryMap.get(appDomain);

  // अगर RAM में पहले से मौजूद है, तो डेटाबेस को कभी मत छुओ (0 DB Query)
  if (cached) {
    return cached;
  }

  // केवल पहली बार (या एडमिन द्वारा कैशे पर्ज होने पर) 1 बार DB से फेच होगा
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
    lockedDeviceId: license.lockedDeviceId || "",
    tokenVersion: license.tokenVersion || 1,
    expiresAt: license.expiresAt ? new Date(license.expiresAt) : undefined,
  };

  // RAM कैशे में स्टोर करो
  licenseMemoryMap.set(appDomain, dataToCache);
  return dataToCache;
}

// ⚡ 2. जब एडमिन स्टेटस बदले या मशीन रीसेट करे, तभी कैशे साफ़ होगा
export function forcePurgeLicenseCache(appDomain: string) {
  licenseMemoryMap.delete(appDomain);
}