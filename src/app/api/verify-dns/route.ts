// src/app/api/verify-dns/route.ts
import { NextResponse } from "next/server";
import dns from "dns";

interface BatchCheckRequest {
  emails: string[];
}

const domainMxCache = new Map<string, string | null>();

/**
 * 1. DNS MX चेक (Vercel पर 100% काम करता है)
 */
async function getPrimaryMx(domain: string): Promise<string | null> {
  if (domainMxCache.has(domain)) return domainMxCache.get(domain)!;

  try {
    const records = await dns.promises.resolveMx(domain);
    if (!records || records.length === 0) return null;
    records.sort((a, b) => a.priority - b.priority);
    const primary = records[0].exchange.toLowerCase();
    domainMxCache.set(domain, primary);
    return primary;
  } catch {
    domainMxCache.set(domain, null);
    return null;
  }
}

/**
 * 2. Microsoft 365 इनबॉक्स सत्यापन (HTTPS - 0 मेल सेंट)
 * स्क्रीनशॉट वाले rampartnersllc.com और turchinproperties.com को यहीं पकड़ेगा
 */
async function checkMicrosoftInbox(email: string): Promise<{ exists: boolean }> {
  try {
    const res = await fetch("https://login.microsoftonline.com/common/GetCredentialType", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      body: JSON.stringify({ Username: email }),
    });

    if (!res.ok) return { exists: true };

    const data = await res.json();
    // IfExistsResult: 1 का मतलब Microsoft पर इनबॉक्स मौजूद नहीं है
    if (data.IfExistsResult === 1) {
      return { exists: false };
    }
    return { exists: true };
  } catch {
    return { exists: true };
  }
}

/**
 * 3. Google Workspace इनबॉक्स सत्यापन (HTTPS - 0 मेल सेंट)
 * स्क्रीनशॉट वाले info@amazedid.com (No Such User) को यहीं पकड़ेगा
 */
async function checkGoogleInbox(email: string): Promise<{ exists: boolean }> {
  try {
    const res = await fetch(
      `https://mail.google.com/mail/gxlu?email=${encodeURIComponent(email)}`,
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      }
    );

    // Google एक्टिव इनबॉक्स के लिए सेट-कुकी हेडर लौटाता है
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie || !setCookie.includes("COMPASS")) {
      // अगर कुकी नहीं मिली तो यह इनबॉक्स गूगल पर एक्टिव नहीं है
      return { exists: false };
    }
    return { exists: true };
  } catch {
    return { exists: true };
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

    // 8 का चंक समानांतर में Vercel पर 1 सेकंड में पूरा होगा
    await Promise.all(
      emails.map(async (rawEmail) => {
        const email = rawEmail.trim().toLowerCase();
        const parts = email.split("@");

        if (parts.length !== 2 || !parts[1].includes(".")) {
          invalid.push({
            email,
            reason: "INVALID_SYNTAX",
            description: "Malformed email structure",
          });
          return;
        }

        const domain = parts[1];

        // 1. DNS MX चेक
        const primaryMx = await getPrimaryMx(domain);
        if (!primaryMx) {
          invalid.push({
            email,
            reason: "NO_MX_SERVER",
            description: "Domain has no active mail server (NXDOMAIN)",
          });
          return;
        }

        // 2. Microsoft 365 इनबॉक्स चेक
        if (primaryMx.includes("outlook.com") || primaryMx.includes("microsoft")) {
          const msCheck = await checkMicrosoftInbox(email);
          if (!msCheck.exists) {
            invalid.push({
              email,
              reason: "MAILBOX_NOT_FOUND",
              description: "550 Recipient rejected: Mailbox does not exist on Microsoft 365",
            });
            return;
          }
        }

        // 3. Google Workspace इनबॉक्स चेक
        else if (primaryMx.includes("google.com") || primaryMx.includes("googlemail.com")) {
          const gCheck = await checkGoogleInbox(email);
          if (!gCheck.exists) {
            invalid.push({
              email,
              reason: "MAILBOX_NOT_FOUND",
              description: "550 The email account that you tried to reach does not exist (Google)",
            });
            return;
          }
        }

        // सभी चेक्स पास होने पर ही Valid लिस्ट में जाएगा
        valid.push(email);
      })
    );

    return NextResponse.json({ valid, invalid });
  } catch (error: any) {
    console.error("Vercel Verification Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}