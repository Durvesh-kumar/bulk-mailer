// src/app/api/verify-dns/route.ts
import { NextResponse } from "next/server";
import dns from "dns";

interface BatchCheckRequest {
  emails: string[];
}

const domainCache = new Map<string, boolean>();

async function checkMx(domain: string, timeoutMs = 2500): Promise<boolean> {
  if (domainCache.has(domain)) {
    // console.log(`[Cache Hit] Domain: ${domain}`);
    return domainCache.get(domain)!;
  }

//   console.log(`[DNS Checking...] Looking up MX for: ${domain}`);

  const dnsPromise = dns.promises
    .resolveMx(domain)
    .then((records) => {
      const isValid = Boolean(records && records.length > 0);
    //   console.log(`[DNS Result] ${domain} -> ${isValid ? "Valid MX Found ✅" : "No MX ❌"}`);
      return isValid;
    })
    .catch(() => {
      console.log(`[DNS Error/NXDOMAIN] Failed for domain: ${domain}`);
      return false;
    });

  const timeoutPromise = new Promise<boolean>((resolve) =>
    setTimeout(() => {
    //   console.log(`[DNS Timeout] ${domain}`);
      resolve(false);
    }, timeoutMs)
  );

  try {
    const isValid = await Promise.race([dnsPromise, timeoutPromise]);
    domainCache.set(domain, isValid);
    return isValid;
  } catch {
    domainCache.set(domain, false);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body: BatchCheckRequest = await req.json();
    const emails = body.emails || [];

    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ valid: [], invalid: [] });
    }

    const valid: string[] = [];
    const invalid: { email: string; reason: string; description: string }[] = [];

    await Promise.all(
      emails.map(async (email) => {
        const parts = email.split("@");
        if (parts.length !== 2) {
          invalid.push({
            email,
            reason: "INVALID_SYNTAX",
            description: "Malformed email structure",
          });
          return;
        }

        const domain = parts[1].toLowerCase().trim();
        const hasMx = await checkMx(domain);

        if (hasMx) {
          valid.push(email);
        } else {
          invalid.push({
            email,
            reason: "NO_MX_RECORD",
            description: "Domain does not exist or has no active mail server (NXDOMAIN)",
          });
        }
      })
    );

    return NextResponse.json({ valid, invalid });
  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}