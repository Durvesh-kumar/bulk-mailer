// src/lib/harvester/sources/duckduckgo.ts
import * as cheerio from "cheerio";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

export async function getDuckDuckGoDomains(
  niche: string,
  country: string,
  pageIndex: number = 0
): Promise<string[]> {
  const domains = new Set<string>();
  const cleanNiche = niche.split(",")[0].replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  const cleanCountry = country.split("(")[0].trim();

  // ⚡ ऑफसेट शिफ्ट: Page 0 = 0, Page 1 = 30, Page 2 = 60
  const offset = pageIndex * 30;
  const query = `${cleanNiche} in ${cleanCountry} contact email info`;
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=${offset}&dc=${offset + 1}`;

  const randomUA = USER_AGENTS[pageIndex % USER_AGENTS.length];

  try {
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": randomUA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://html.duckduckgo.com/",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      $(".result__url, .result__snippet").each((_: number, el: any) => {
        let rawUrl = $(el).text().trim();
        if (rawUrl) {
          if (!rawUrl.startsWith("http")) rawUrl = `https://${rawUrl}`;
          try {
            const host = new URL(rawUrl).hostname.toLowerCase();
            if (
              !host.includes("duckduckgo") &&
              !host.includes("facebook") &&
              !host.includes("instagram") &&
              !host.includes("linkedin") &&
              !host.includes("youtube") &&
              !host.includes("yelp") &&
              !host.includes("wikipedia")
            ) {
              domains.add(`https://${host}`);
            }
          } catch (_) {}
        }
      });
    }
  } catch (_) {}

  return Array.from(domains);
}