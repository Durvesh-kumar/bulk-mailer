// src/lib/harvester/emailExtractor.ts
import * as cheerio from "cheerio";

const IGNORED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".css", ".js", ".woff", ".woff2"];

function sanitizeEmail(raw: string): string | null {
  try {
    let clean = decodeURIComponent(raw)
      .replace(/%20|\s+/g, "")
      .replace(/\[at\]|\(at\)/gi, "@")
      .replace(/\[dot\]|\(dot\)/gi, ".")
      .trim()
      .toLowerCase();

    clean = clean.replace(/^[./\\]+|[./\\]+$/g, "");

    // ⚡ B2B ईमेल रेगेक्स (.com, .co.uk, .org, .net, ইত্যাদি)
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!regex.test(clean)) return null;

    if (IGNORED_EXTENSIONS.some((ext) => clean.endsWith(ext))) return null;

    return clean;
  } catch (_) {
    return null;
  }
}

export async function extractEmailsDeep(baseUrl: string): Promise<string[]> {
  const foundEmails = new Set<string>();
  const isDirectory = baseUrl.includes("yellowpages") || baseUrl.includes("manta") || baseUrl.includes("hotfrog");
  // केवल आवश्यक मुख्य संपर्क पेजों को ही स्कैन करें
  const subPaths = isDirectory ? [""] : ["", "/contact", "/contact-us", "/about", "/about-us"];
  const cleanBase = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;

  for (const path of subPaths) {
    try {
      const targetUrl = `${cleanBase.replace(/\/$/, "")}${path}`;
      const res = await fetch(targetUrl, {
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9"
        },
        signal: AbortSignal.timeout(4500),
      });

      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      // 1. पूरे HTML बॉडी टेक्स्ट से सभी कॉर्पोरेट/बिज़नेस ईमेल खोजना
      const bodyText = $("body").text();
      const textMatches = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      
      textMatches.forEach((em: string) => {
        const cleaned = sanitizeEmail(em);
        if (cleaned) foundEmails.add(cleaned);
      });

      // 2. Mailto लिंक्स से ईमेल निकालना
      $('a[href^="mailto:"]').each((_: number, el: any) => {
        const rawMailto = $(el).attr("href")?.replace("mailto:", "").split("?")[0] || "";
        const cleaned = sanitizeEmail(rawMailto);
        if (cleaned) foundEmails.add(cleaned);
      });

      // 15 वैध ईमेल मिलने पर अगले सब-पेज की आवश्यकता नहीं
      if (foundEmails.size >= 15) break;
    } catch (_) {}
  }

  return Array.from(foundEmails);
}