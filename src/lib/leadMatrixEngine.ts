// src/lib/leadMatrixEngine.ts

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// 1. प्रोवाइडर्स और प्रीफिक्स का क्लीन कॉम्बो (फ्रंटएंड के साथ पूरी तरह सिंक)
export function buildProviderCombos(providers: string[], comboSize: number): string[] {
  if (!providers || providers.length === 0) {
    return ['("@gmail.com" OR "owner@")'];
  }
  
  const cleanSize = Math.max(1, comboSize);
  const chunks = chunkArray(providers, cleanSize);

  return chunks.map((chunk) => {
    const formatted = chunk.map((item) => `"${item}"`).join(" OR ");
    return `(${formatted})`;
  });
}

// 2. पावरफुल और फ्लेक्सिबल Google Dork Generator
export function generateSingleDorkQuery(
  niche: string,
  location: string,
  comboString: string
): string {
  // लोकेशन से USA या United States का नाम क्लीन करो ताकि स्टेट का नाम सटीक मैच हो
  const cleanLocation = location.replace(/USA|United States/gi, "").trim();

  // Google Dork: निश + स्टेट/लोकेशन + प्रोवाइडर कॉम्बो + जॉब/करियर हटाना
  return `"${niche.trim()}" ${cleanLocation} ${comboString} -intitle:jobs -intitle:careers`;
}

// 3. रॉ HTML या टेक्स्ट से साफ़ ईमेल एक्सट्रैक्टर
export function extractCleanEmails(rawHtml: string): string[] {
  if (!rawHtml) return [];
  const matches = rawHtml.match(EMAIL_REGEX) || [];
  const junkExtensions = /\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|ttf|ico|bmp)$/i;

  const cleanSet = new Set<string>();
  for (const item of matches) {
    let email = item.toLowerCase().trim();

    // ट्रेलिंग सिंबल और पंकचुएशन साफ़ करें
    email = email.replace(/^[.,;:<>()"'/\\&]+/, "").replace(/^[.,;:<>()"'/\\&]+$/, "");

    if (!junkExtensions.test(email) && email.includes(".") && !email.includes("..")) {
      cleanSet.add(email);
    }
  }

  return Array.from(cleanSet);
}