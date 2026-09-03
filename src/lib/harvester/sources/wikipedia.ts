// src/lib/harvester/sources/wikipedia.ts
import * as cheerio from "cheerio";

const JUNK_DOMAINS = [
  "wikipedia", "wikimedia", "wikidata", "archive.org", "doi.org",
  "ncbi.nlm.nih.gov", "nih.gov", "pubmed", "worldcat.org", "springer",
  "w3.org", "github.com", "google.com", "biodiversitylibrary.org",
  "nytimes.com", "wsj.com", "bbc.com", "reuters.com", "bloomberg.com",
  "forbes.com", "theguardian.com", "techcrunch.com", "medium.com"
];

export async function getWikipediaDomains(
  niche: string,
  country: string,
  pageIndex: number = 0
): Promise<string[]> {
  const domains = new Set<string>();
  const cleanNiche = niche.split(",")[0].replace(/&/g, " ").trim();
  const cleanCountry = country.split("(")[0].trim();

  // ⚡ ऑफसेट शिफ्ट ताकि हर राउंड में नए पेजों के परिणाम आएँ
  const offset = pageIndex * 3;
  const searchQueries = [
    `${cleanNiche} in ${cleanCountry}`,
    `List of ${cleanNiche} companies`,
    `${cleanNiche} corporate`,
  ];

  const query = searchQueries[pageIndex % searchQueries.length];

  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=4&namespace=0&format=json`;

    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 LeadHarvester/4.0" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const pageUrls: string[] = data[3] || [];

    await Promise.all(
      pageUrls.slice(0, 2).map(async (pUrl) => {
        try {
          const pageRes = await fetch(pUrl, {
            headers: { "User-Agent": "Mozilla/5.0 LeadHarvester/4.0" },
            signal: AbortSignal.timeout(5000),
          });
          if (!pageRes.ok) return;

          const html = await pageRes.text();
          const $ = cheerio.load(html);

          $(".infobox a.external, .wikitable a.external").each((_: number, el: any) => {
            const href = $(el).attr("href");
            if (href && href.startsWith("http")) {
              try {
                const host = new URL(href).hostname.toLowerCase();
                const isJunk = JUNK_DOMAINS.some((junk) => host.includes(junk)) || host.endsWith(".gov") || host.endsWith(".edu");
                if (!isJunk) {
                  domains.add(`https://${host}`);
                }
              } catch (_) {}
            }
          });
        } catch (_) {}
      })
    );
  } catch (_) {}

  return Array.from(domains);
}