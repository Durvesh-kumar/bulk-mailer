import { NextRequest, NextResponse } from "next/server";

const rawKeysString = process.env.GOOGLE_API_KEYS || "";
const GOOGLE_API_KEYS = rawKeysString
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

const SEARCH_ENGINE_ID = process.env.GOOGLE_CSE_ID || "";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JUNK_ASSET_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|ttf|ico|bmp)$/i;

function extractRawDataFromSnippets(items: any[]) {
  if (!items || !Array.isArray(items)) return { emails: [], rawSnippets: [] };
  const emailSet = new Set<string>();
  const rawSnippets: any[] = [];

  for (const item of items) {
    rawSnippets.push({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
    });

    const textBlob = `${item.title || ""} ${item.snippet || ""} ${item.link || ""}`;
    const matches = textBlob.match(EMAIL_REGEX) || [];

    for (const emailMatch of matches) {
      let clean = emailMatch.toLowerCase().trim();
      clean = clean.replace(/^[.,;:<>()"'/\\&]+/, "").replace(/^[.,;:<>()"'/\\&]+$/, "");
      if (!JUNK_ASSET_EXTENSIONS.test(clean) && clean.includes(".")) {
        emailSet.add(clean);
      }
    }
  }

  return {
    emails: Array.from(emailSet),
    rawSnippets,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, page = 2 } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Valid query required." }, { status: 400 });
    }

    if (GOOGLE_API_KEYS.length === 0) {
      return NextResponse.json({ error: "No API keys configured." }, { status: 500 });
    }

    const pageNumber = Math.max(2, Number(page)); // पेज 1 हमेशा स्किप रहेगा
    const startOffset = (pageNumber - 1) * 10 + 1;
    const encodedQuery = encodeURIComponent(query.trim());

    let searchData: any = null;
    let usedKeyIndex = -1;

    // Multi-API Key Auto-Rotation Loop (कैसी भी 2 या 50+ कीज़ हों)
    for (let i = 0; i < GOOGLE_API_KEYS.length; i++) {
      const apiKey = GOOGLE_API_KEYS[i];
      const apiUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${SEARCH_ENGINE_ID}&q=${encodedQuery}&start=${startOffset}`;

      try {
        const response = await fetch(apiUrl, { cache: "no-store" });

        if (response.ok) {
          searchData = await response.json();
          usedKeyIndex = i;
          break;
        }

        const errJson = await response.json().catch(() => ({}));
        if (response.status === 429 || response.status === 403 || errJson?.error?.code === 429) {
          continue; // कोटा खत्म होने पर अगली की पर स्विच करें
        } else {
          break;
        }
      } catch (err) {
        continue;
      }
    }

    if (!searchData) {
      return NextResponse.json({
        emails: [],
        rawSnippets: [],
        isRateLimited: true,
        isLastPage: true,
        message: "All configured API keys exhausted!",
      });
    }

    const items = searchData.items || [];
    const { emails, rawSnippets } = extractRawDataFromSnippets(items);
    const totalResults = Number(searchData.searchInformation?.totalResults || 0);
    const isLastPage = startOffset + 10 >= totalResults || items.length === 0 || pageNumber >= 15;

    return NextResponse.json({
      emails,
      rawSnippets,
      page: pageNumber,
      activeKeyUsed: usedKeyIndex + 1,
      isRateLimited: false,
      isLastPage,
    });
  } catch (error: any) {
    return NextResponse.json(
      { emails: [], rawSnippets: [], isRateLimited: false, isLastPage: true, error: error.message },
      { status: 500 }
    );
  }
}