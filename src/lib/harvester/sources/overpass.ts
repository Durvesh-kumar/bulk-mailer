// src/lib/harvester/sources/overpass.ts

// 🌍 19 देशों के प्रमुख शहरों के रोटेटिंग कोऑर्डिनेट्स (ताकि हर राउंड में नए शहर से डोमेन मिलें)
const MULTI_GEO: Record<string, Array<{ lat: number; lon: number }>> = {
  "United States (USA)": [
    { lat: 40.7128, lon: -74.0060 }, // New York
    { lat: 34.0522, lon: -118.2437 }, // Los Angeles
    { lat: 41.8781, lon: -87.6298 },  // Chicago
    { lat: 29.7604, lon: -95.3698 },  // Houston
  ],
  "Canada": [
    { lat: 43.6532, lon: -79.3832 }, // Toronto
    { lat: 45.5017, lon: -73.5673 }, // Montreal
    { lat: 49.2827, lon: -123.1207 }, // Vancouver
  ],
  "United Kingdom (UK)": [
    { lat: 51.5074, lon: -0.1278 },  // London
    { lat: 52.4862, lon: -1.8904 },  // Birmingham
    { lat: 53.4808, lon: -2.2426 },  // Manchester
  ],
  "Ireland": [
    { lat: 53.3498, lon: -6.2603 },  // Dublin
    { lat: 51.8985, lon: -8.4756 },  // Cork
  ],
  "Germany": [
    { lat: 52.5200, lon: 13.4050 },  // Berlin
    { lat: 48.1351, lon: 11.5820 },  // Munich
    { lat: 50.1109, lon: 8.6821 },   // Frankfurt
  ],
  "Netherlands": [
    { lat: 52.3676, lon: 4.9041 },   // Amsterdam
    { lat: 51.9244, lon: 4.4777 },   // Rotterdam
  ],
  "Switzerland": [
    { lat: 47.3769, lon: 8.5417 },   // Zurich
    { lat: 46.2044, lon: 6.1432 },   // Geneva
  ],
  "France": [
    { lat: 48.8566, lon: 2.3522 },   // Paris
    { lat: 45.7640, lon: 4.8357 },   // Lyon
  ],
  "Sweden": [
    { lat: 59.3293, lon: 18.0686 },  // Stockholm
    { lat: 57.7089, lon: 11.9746 },  // Gothenburg
  ],
  "Norway": [
    { lat: 59.9139, lon: 10.7522 },  // Oslo
    { lat: 60.3913, lon: 5.3221 },   // Bergen
  ],
  "United Arab Emirates (Dubai & Abu Dhabi)": [
    { lat: 25.2048, lon: 55.2708 },  // Dubai
    { lat: 24.4539, lon: 54.3773 },  // Abu Dhabi
  ],
  "Saudi Arabia (Riyadh & Jeddah)": [
    { lat: 24.7136, lon: 46.6753 },  // Riyadh
    { lat: 21.4858, lon: 39.1925 },  // Jeddah
  ],
  "Qatar (Doha)": [{ lat: 25.2854, lon: 51.5310 }],
  "Kuwait": [{ lat: 29.3759, lon: 47.9774 }],
  "Australia": [
    { lat: -33.8688, lon: 151.2093 }, // Sydney
    { lat: -37.8136, lon: 144.9631 }, // Melbourne
  ],
  "New Zealand": [
    { lat: -36.8485, lon: 174.7633 }, // Auckland
    { lat: -41.2865, lon: 174.7762 }, // Wellington
  ],
  "Japan (Tokyo & Osaka)": [
    { lat: 35.6762, lon: 139.6503 }, // Tokyo
    { lat: 34.6937, lon: 135.5023 }, // Osaka
  ],
  "Singapore": [{ lat: 1.3521, lon: 103.8198 }],
  "India (Metro & IT Tech Hubs)": [
    { lat: 12.9716, lon: 77.5946 },  // Bengaluru
    { lat: 28.6139, lon: 77.2090 },  // Delhi NCR
    { lat: 19.0760, lon: 72.8777 },  // Mumbai
    { lat: 17.3850, lon: 78.4867 },  // Hyderabad
  ],
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

function getOsmTag(niche: string): string {
  const n = niche.toLowerCase();
  if (n.includes("car") || n.includes("auto")) return `["shop"="car_repair"]`;
  if (n.includes("dent") || n.includes("doctor")) return `["amenity"="dentist"]`;
  if (n.includes("gym") || n.includes("fitness")) return `["leisure"="fitness_centre"]`;
  if (n.includes("roof") || n.includes("solar")) return `["craft"="roofer"]`;
  if (n.includes("restaurant") || n.includes("cafe")) return `["amenity"="restaurant"]`;
  return `["amenity"]`;
}

export async function getOverpassDomains(niche: string, country: string, pageIndex: number = 0): Promise<string[]> {
  const domains = new Set<string>();

  let cityList = MULTI_GEO[country];
  if (!cityList) {
    const matchedKey = Object.keys(MULTI_GEO).find(k => country.toLowerCase().includes(k.toLowerCase().split(" ")[0]));
    cityList = matchedKey ? MULTI_GEO[matchedKey] : [{ lat: 40.7128, lon: -74.0060 }];
  }

  // ⚡ हर राउंड में शहर बदलेगा (City Rotation)
  const currentCity = cityList[pageIndex % cityList.length];
  const tag = getOsmTag(niche);

  // दायरा 30 किमी और 12 सेकंड का सुरक्षित टाइमआउट
  const query = `
    [out:json][timeout:12];
    (
      node${tag}["website"](around:30000,${currentCity.lat},${currentCity.lon});
      node${tag}["contact:website"](around:30000,${currentCity.lat},${currentCity.lon});
      way${tag}["website"](around:30000,${currentCity.lat},${currentCity.lon});
    );
    out tags 35;
  `;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 LeadEngine/4.0"
        },
        signal: AbortSignal.timeout(9000),
      });

      if (res.ok) {
        const data = await res.json();
        const elements = data.elements || [];

        for (const el of elements) {
          const tags = el.tags || {};
          let web = tags.website || tags["contact:website"] || tags.url;

          if (web && typeof web === "string") {
            if (!web.startsWith("http")) web = `https://${web}`;
            try {
              const host = new URL(web).hostname.toLowerCase();
              if (!host.includes("facebook") && !host.includes("google") && !host.includes("instagram")) {
                domains.add(`https://${host}`);
              }
            } catch (_) {}
          }
        }

        if (domains.size > 0) break;
      }
    } catch (_) {
      continue;
    }
  }

  return Array.from(domains);
}