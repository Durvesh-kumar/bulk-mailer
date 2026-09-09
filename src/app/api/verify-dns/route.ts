// app/api/verify-dns/route.ts
import { NextResponse } from "next/server";
import dns from "dns";

const dnsPromises = dns.promises;
const mxCache = new Map<string, { records: any[]; ts: number }>();
const txtCache = new Map<string, { records: any[]; ts: number }>();
const TTL_MS = 30 * 60 * 1000; // 30 minutes cache

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
  if (domain.includes("..") || domain.startsWith("-") || domain.endsWith("-")) return false;
  return true;
}

async function getCachedTxt(domain: string, prefix = "") {
  const key = prefix ? `${prefix}.${domain}` : domain;
  const cached = txtCache.get(key);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.records;
  try {
    const records = await dnsPromises.resolveTxt(key);
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
    const records = await dnsPromises.resolveMx(cleanDomain);
    if (!records || records.length === 0) {
      mxCache.set(cleanDomain, { records: [], ts: Date.now() }); // cache negative
      return [];
    }
    records.sort((a, b) => a.priority - b.priority);
    const formatted = records.map((r) => ({ type: "MX", exchange: r.exchange, priority: r.priority }));
    mxCache.set(cleanDomain, { records: formatted, ts: Date.now() });
    return formatted;
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body?.email?.trim();

    // Syntax check
    if (!email || !isValidEmailSyntax(email)) {
      return NextResponse.json(
        { email, valid: false, status: "INVALID_SYNTAX", message: "Invalid email format" },
        { status: 400 }
      );
    }

    const domain = email.split("@")[1].toLowerCase().trim();

    // Typo check
    if (TYPO_DOMAINS.has(domain)) {
      return NextResponse.json(
        { email, domain, valid: false, status: "INVALID_TYPO", message: "Common domain typo detected" },
        { status: 400 }
      );
    }

    const strictChecks = {
      syntaxValid: true,
      typoCheckPassed: true,
      domainResolves: false,
      mxFound: false,
      mxHostResolves: false,
      spfPresent: false,
      dmarcPresent: false
    };

    // MX check
    const mxRecords = await getMxRecords(domain);
    if (mxRecords.length > 0) {
      strictChecks.mxFound = true;

      // Run all checks in parallel
      const [aRes, aaaaRes, spfRes, dmarcRes, mxHostRes] = await Promise.allSettled([
        dnsPromises.resolve4(domain),
        dnsPromises.resolve6(domain), // drop if not needed
        getCachedTxt(domain),
        getCachedTxt("_dmarc." + domain),
        Promise.all(mxRecords.map(async (mx) => {
          try {
            const [ipv4] = await Promise.allSettled([
              dnsPromises.resolve4(mx.exchange),
              dnsPromises.resolve6(mx.exchange)
            ]);
            const ips: string[] = [];
            if (ipv4.status === "fulfilled") ips.push(...ipv4.value);
            return { exchange: mx.exchange, ips };
          } catch {
            return { exchange: mx.exchange, ips: [] };
          }
        }))
      ]);

      strictChecks.domainResolves =
        (aRes.status === "fulfilled" && aRes.value.length > 0) ||
        (aaaaRes.status === "fulfilled" && aaaaRes.value.length > 0);

      if (spfRes.status === "fulfilled" && spfRes.value.flat().some(r => r.startsWith("v=spf1")))
        strictChecks.spfPresent = true;
      if (dmarcRes.status === "fulfilled" && dmarcRes.value.flat().some(r => r.startsWith("v=DMARC1")))
        strictChecks.dmarcPresent = true;

      if (mxHostRes.status === "fulfilled") {
        strictChecks.mxHostResolves = mxHostRes.value.every(h => h.ips.length > 0);
      }

      return NextResponse.json({
        email,
        domain,
        valid: strictChecks.mxFound && strictChecks.mxHostResolves,
        status: strictChecks.mxHostResolves ? "HAS_MX" : "MX_HOST_INVALID",
        records: mxRecords,
        primary: mxRecords[0],
        dnsSummary: strictChecks.mxHostResolves
          ? `Domain has MX records; primary is ${mxRecords[0].exchange} (priority ${mxRecords[0].priority}).`
          : "MX records found but host did not resolve to IP.",
        strictChecks
      });
    }

    // No MX fallback
    return NextResponse.json({
      email,
      domain,
      valid: false,
      status: "NO_MX",
      message: "Domain has no MX records; cannot receive mail.",
      dnsSummary: "Domain resolves but lacks MX records, so email delivery is not possible.",
      strictChecks
    });
  } catch (error: any) {
    return NextResponse.json(
      { valid: false, status: "ERROR", message: error.message || "INTERNAL_SERVER_ERROR" },
      { status: 500 }
    );
  }
}