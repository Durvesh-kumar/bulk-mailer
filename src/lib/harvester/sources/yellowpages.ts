// src/lib/harvester/sources/yellowpages.ts
import * as cheerio from "cheerio";

export async function getYellowpagesDomains(
  niche: string,
  country: string,
  pageIndex: number = 0
): Promise<string[]> {
  const domains = new Set<string>();

  // निच को साफ़ करें (उदा. "Car Clinic, Auto Repair" -> "car-repair")
  const cleanNiche = niche
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  // देश या शहर को साफ़ करें (उदा. "United States (USA)" -> "united-states")
  const cleanLocation = country
    .split("(")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  const pageNum = pageIndex + 1; // 1, 2, 3... (Pagination)

  // ⚡ केवल और केवल YellowPages की अपनी लाइव डायरेक्टरी
  const targetUrl = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(
    cleanNiche
  )}&geo_location_terms=${encodeURIComponent(cleanLocation)}&page=${pageNum}`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.yellowpages.com/",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      // YellowPages में कंपनी की असली वेबसाइट 'track-visit-website' या 'links' क्लास में होती है
      $('a.track-visit-website, .links a[href^="http"]').each((_: number, el: any) => {
        let href = $(el).attr("href");
        if (href && href.startsWith("http")) {
          try {
            const parsed = new URL(href);
            const host = parsed.hostname.toLowerCase();

            // डायरेक्टरी और जंक लिंक्स को बाहर रखें
            if (
              !host.includes("yellowpages") &&
              !host.includes("att.com") &&
              !host.includes("yp.com") &&
              !host.includes("facebook") &&
              !host.includes("google")
            ) {
              domains.add(`https://${host}`);
            }
          } catch (_) {}
        }
      });
    }
  } catch (_) {
    // अगर कोई नेटवर्क टाइमआउट हो तो सुरक्षित बाईपास
  }

  return Array.from(domains);
}