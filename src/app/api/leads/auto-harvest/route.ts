// src/app/api/leads/auto-harvest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToCentralDB } from "@/lib/db/centralDb";
import { Lead } from "@/lib/models/Lead";
import { getDuckDuckGoDomains } from "@/lib/harvester/sources/duckduckgo";
import { getOverpassDomains } from "@/lib/harvester/sources/overpass";
import { getWikipediaDomains } from "@/lib/harvester/sources/wikipedia";
import { getYellowpagesDomains } from "@/lib/harvester/sources/yellowpages";
import { getSeedDomains } from "@/lib/harvester/sources/seedPool";
import { extractEmailsDeep } from "@/lib/harvester/emailExtractor";
import { verifyEmailHealth } from "@/lib/harvester/emailValidator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const TIME_LIMIT_MS = 40000; // ⚡ 40 सेकंड कटऑफ (सॉकेट या Vercel हैंग से सुरक्षा)

  try {
    await connectToCentralDB();
    const {
      serviceType,
      nicheCategory,
      country,
      pageIndex = 0,
      scannedHistory = [],
      pendingDomains = []
    } = await req.json();

    const logs: string[] = [];
    const historySet = new Set<string>(
      (scannedHistory || []).map((d: string) => d.toLowerCase().replace(/\/$/, ""))
    );

    let domainsToProcess: string[] = [];

    // ⚡ अगर फ्रंटएंड के पास पिछले चंक से बचे हुए डोमेन हैं, तो सर्च इंजन पर लोड न डालें
    if (pendingDomains && pendingDomains.length > 0) {
      domainsToProcess = pendingDomains;
      logs.push(`🔁 [RESUME CHUNK] Continuing with ${domainsToProcess.length} pending domains...`);
    } else {
      // 🚀 1. सभी 5 सोर्सेज को नए PageIndex और ऑफसेट के साथ चलाएं
      const [ddgSites, overpassSites, wikiSites, ypSites] = await Promise.all([
        getDuckDuckGoDomains(nicheCategory, country, pageIndex).catch(() => []),
        getOverpassDomains(nicheCategory, country, pageIndex).catch(() => []),
        getWikipediaDomains(nicheCategory, country, pageIndex).catch(() => []),
        getYellowpagesDomains(nicheCategory, country, pageIndex).catch(() => []),
      ]);

      const fallbackSeeds = getSeedDomains(nicheCategory, country, pageIndex) || [];

      logs.push(
        `📊 [SOURCES AUDIT - Page ${pageIndex + 1}] DDG: ${ddgSites.length} | Overpass: ${overpassSites.length} | Wiki: ${wikiSites.length} | YellowPages: ${ypSites.length} | Seeds: ${fallbackSeeds.length}`
      );

      // ⚡ 2. मर्ज और हिस्ट्री से पुराने डोमेन को हटाना (Deduplication)
      const allDiscovered = Array.from(
        new Set([...ddgSites, ...overpassSites, ...wikiSites, ...ypSites, ...fallbackSeeds])
      );

      domainsToProcess = allDiscovered.filter((site) => {
        try {
          const host = new URL(site).hostname.toLowerCase();
          return !historySet.has(host) && !historySet.has(site.toLowerCase());
        } catch {
          return false;
        }
      });

      logs.push(`🔍 Fresh Unseen Domains in this round: ${domainsToProcess.length}`);
    }

    const validLeads: Array<{ email: string; sourceUrl: string }> = [];
    const seenEmails = new Set<string>();
    const newlyScannedDomains: string[] = [];
    const remainingDomains: string[] = [...domainsToProcess];

    // 🌐 3. डीप क्रॉलिंग (40 सेकंड की समय सीमा के अंदर)
    while (remainingDomains.length > 0) {
      if (Date.now() - startTime > TIME_LIMIT_MS) {
        logs.push(`⏱️ [TIME CUTOFF] Reached 40s execution threshold. Saving chunk and returning...`);
        break;
      }

      const site = remainingDomains.shift()!;
      newlyScannedDomains.push(site);
      logs.push(`🌐 Scanning: ${site}`);

      try {
        const rawEmails = await extractEmailsDeep(site);

        for (const email of rawEmails) {
          if (seenEmails.has(email)) continue;
          seenEmails.add(email);

          const isHealthy = await verifyEmailHealth(email);
          if (isHealthy) {
            validLeads.push({ email, sourceUrl: site });
            logs.push(`  ✅ [MX VALID] ${email} (${site})`);
          } else {
            logs.push(`  ⚠️ [SKIP/DEAD] ${email}`);
          }
        }
      } catch {
        continue;
      }
    }

    // 💾 4. डेटाबेस में 100 के चंक्स में सुरक्षित सेविंग
    let savedCount = 0;
    const CHUNK_SIZE = 100;

    for (let i = 0; i < validLeads.length; i += CHUNK_SIZE) {
      const chunk = validLeads.slice(i, i + CHUNK_SIZE);
      const bulkOps = chunk.map((item) => ({
        updateOne: {
          filter: { email: item.email },
          update: {
            $setOnInsert: {
              email: item.email,
              serviceType: serviceType || "Custom Business Solution",
              nicheCategory,
              country,
              sourceUrl: item.sourceUrl,
              isContacted: false,
              contactCount: 0,
              lastContactedAt: null,
              coolDownUntil: null,
              isVerified: true,
              mxRecordValid: true,
            },
          },
          upsert: true,
        },
      }));

      const res = await Lead.bulkWrite(bulkOps, { ordered: false });
      savedCount += res.upsertedCount || 0;
    }

    if (savedCount > 0) {
      logs.push(`💾 [DB SAVED] Successfully stored ${savedCount} fresh leads in DB.`);
    }

    return NextResponse.json({
      success: true,
      scannedCount: newlyScannedDomains.length,
      scannedDomains: newlyScannedDomains,
      rawFound: seenEmails.size,
      verified: validLeads.length,
      saved: savedCount,
      hasMore: remainingDomains.length > 0,
      remainingDomains,
      logs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}