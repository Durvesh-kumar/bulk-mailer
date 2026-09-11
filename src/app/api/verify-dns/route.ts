// app/api/verify-dns/route.ts
import { NextResponse } from "next/server";
import dns from "dns";

const dnsPromises = dns.promises;
const mxCache = new Map<string, { records: any[]; ts: number }>();
const txtCache = new Map<string, { records: any[]; ts: number }>();
const badDomainCache = new Map<string, number>(); // फेल हुए डोमेन का कैश
const TTL_MS = 30 * 60 * 1000; // 30 मिनट कैश

// 🛑 अधिकतम 3.5 सेकंड (3500ms) की कड़क सीमा
const DNS_MAX_TIMEOUT_MS = 3500;

// Common typo domains
const TYPO_DOMAINS = new Set([
  "gnail.com", "yaho.co", "hotmial.com", "outlok.com",
  "gmial.com", "yahhoo.com", "hotmail.co", "outlook.co"
]);

function isValidEmailSyntax(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const emailRegex =
    /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,63})@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;
  if (!emailRegex.test(email)) return false;
  const [local, domain] = email.split("@");
  if (local.length > 64 || domain.length > 255) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (domain.includes("..") || domain.startsWith("-") || domain.endsWith("-") || !domain.includes(".")) return false;
  return true;
}

// ⏱️ टाइमआउट रैपर
function withTimeout<T>(promise: Promise<T>, timeoutMs: number = DNS_MAX_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("DNS_TIMEOUT")), timeoutMs)
    ),
  ]);
}

async function getCachedTxt(domain: string, prefix = "") {
  const key = prefix ? `${prefix}.${domain}` : domain;
  const cached = txtCache.get(key);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.records;
  try {
    const records = await withTimeout(dnsPromises.resolveTxt(key), 1500);
    txtCache.set(key, { records, ts: Date.now() });
    return records;
  } catch {
    return [];
  }
}

async function getMxRecords(domain: string) {
  const cleanDomain = domain.toLowerCase().trim();
  const cached = mxCache.get(cleanDomain);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.records;

  try {
    const records = await withTimeout(dnsPromises.resolveMx(cleanDomain), DNS_MAX_TIMEOUT_MS);
    if (!records || records.length === 0) {
      mxCache.set(cleanDomain, { records: [], ts: Date.now() });
      return [];
    }
    records.sort((a, b) => a.priority - b.priority);
    const formatted = records.map((r) => ({ type: "MX", exchange: r.exchange, priority: r.priority }));
    mxCache.set(cleanDomain, { records: formatted, ts: Date.now() });
    return formatted;
  } catch (err: any) {
    mxCache.set(cleanDomain, { records: [], ts: Date.now() });
    if (err?.message === "DNS_TIMEOUT") {
      throw new Error("DNS_TIMEOUT");
    }
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body?.email?.trim().toLowerCase();

    // ==========================================
    // 🔴 1. सिंटैक्स टेस्ट (Syntax Check)
    // ==========================================
    if (!email || !isValidEmailSyntax(email) || email.startsWith("www.")) {
      return NextResponse.json(
        { email, valid: false, status: "INVALID_SYNTAX", message: "Failed: Invalid email format or syntax" },
        { status: 400 }
      );
    }

    const domain = email.split("@")[1].toLowerCase().trim();

    // ==========================================
    // 🔴 2. टाइपो डोमेन टेस्ट (Typo Check)
    // ==========================================
    if (TYPO_DOMAINS.has(domain)) {
      return NextResponse.json(
        { email, domain, valid: false, status: "INVALID_TYPO", message: "Failed: Common domain typo detected" },
        { status: 400 }
      );
    }

    // ==========================================
    // 🔴 3. पुराना फ़ेलियर कैश टेस्ट (Bad Cache)
    // ==========================================
    const lastFailed = badDomainCache.get(domain);
    if (lastFailed && Date.now() - lastFailed < TTL_MS) {
      return NextResponse.json(
        { email, domain, valid: false, status: "BLACKLISTED_CACHE", message: "Failed: Domain previously failed checks" },
        { status: 400 }
      );
    }

    // ==========================================
    // 🔴 4. डोमेन IP रेजोल्यूशन टेस्ट (A / AAAA)
    // ==========================================
    let domainResolves = false;
    try {
      const [aRes, aaaaRes] = await withTimeout(
        Promise.allSettled([dnsPromises.resolve4(domain), dnsPromises.resolve6(domain)]),
        2000
      );
      if (
        (aRes.status === "fulfilled" && aRes.value.length > 0) ||
        (aaaaRes.status === "fulfilled" && aaaaRes.value.length > 0)
      ) {
        domainResolves = true;
      }
    } catch {
      domainResolves = false;
    }

    if (!domainResolves) {
      badDomainCache.set(domain, Date.now());
      return NextResponse.json(
        { email, domain, valid: false, status: "DOMAIN_UNRESOLVED", message: "Failed: Domain does not resolve to any IP address" },
        { status: 400 }
      );
    }

    // ==========================================
    // 🔴 5. MX रिकॉर्ड टेस्ट (Hard 3.5s Timeout)
    // ==========================================
    let mxRecords: any[] = [];
    try {
      mxRecords = await getMxRecords(domain);
    } catch (mxErr: any) {
      badDomainCache.set(domain, Date.now());
      if (mxErr?.message === "DNS_TIMEOUT") {
        return NextResponse.json(
          { email, domain, valid: false, status: "DNS_TIMEOUT", message: "Failed: Domain DNS took more than 3.5s to respond" },
          { status: 400 }
        );
      }
    }

    if (!mxRecords || mxRecords.length === 0) {
      badDomainCache.set(domain, Date.now());
      return NextResponse.json(
        { email, domain, valid: false, status: "NO_MX", message: "Failed: Domain has no MX records" },
        { status: 400 }
      );
    }

    // ==========================================
    // 🔴 6. MX होस्ट IP रेजोल्यूशन टेस्ट (Dummy MX Filter)
    // ==========================================
    const primaryExchange = mxRecords[0]?.exchange;
    if (!primaryExchange) {
      badDomainCache.set(domain, Date.now());
      return NextResponse.json(
        { email, domain, valid: false, status: "MX_HOST_INVALID", message: "Failed: Primary MX host is empty" },
        { status: 400 }
      );
    }

    let mxHostResolves = false;
    try {
      const [ipv4] = await Promise.allSettled([
        withTimeout(dnsPromises.resolve4(primaryExchange), 2000),
        withTimeout(dnsPromises.resolve6(primaryExchange), 2000)
      ]);
      if (ipv4.status === "fulfilled" && ipv4.value.length > 0) {
        mxHostResolves = true;
      }
    } catch {
      mxHostResolves = false;
    }

    if (!mxHostResolves) {
      badDomainCache.set(domain, Date.now());
      return NextResponse.json(
        { email, domain, valid: false, status: "MX_HOST_INVALID", message: "Failed: MX host did not resolve to a reachable IP address" },
        { status: 400 }
      );
    }

    // ==========================================
    // 🔴 7 & 8. SPF और DMARC टेस्ट
    // ==========================================
    const [spfRes, dmarcRes] = await Promise.all([
      getCachedTxt(domain),
      getCachedTxt("_dmarc." + domain)
    ]);

    const spfPresent = spfRes.flat().some((r: string) => r.startsWith("v=spf1"));
    const dmarcPresent = dmarcRes.flat().some((r: string) => r.startsWith("v=DMARC1"));

    // ✅ सारे टेस्ट पास होने पर ही यहाँ रिस्पॉन्स जाएगा
    return NextResponse.json({
      email,
      domain,
      valid: true,
      status: "HAS_MX",
      records: mxRecords,
      primary: mxRecords[0],
      dnsSummary: `Domain has valid MX; primary is ${mxRecords[0].exchange} (priority ${mxRecords[0].priority}).`,
      strictChecks: {
        syntaxValid: true,
        typoCheckPassed: true,
        domainResolves: true,
        mxFound: true,
        mxHostResolves: true,
        spfPresent,
        dmarcPresent
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { valid: false, status: "ERROR", message: error?.message || "INTERNAL_SERVER_ERROR" },
      { status: 500 }
    );
  }
}