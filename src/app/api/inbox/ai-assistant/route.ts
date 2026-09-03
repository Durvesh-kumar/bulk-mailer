// src/app/api/inbox/ai-assistant/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RequestPayload {
  emailText: string;
  subject: string;
  clientName?: string;
  previousOutreach?: string;
}

const SYSTEM_INSTRUCTION = `Expert B2B sales correspondent.
Analyze previous outreach and incoming reply. Return strict JSON.

Classification:
- HOT_LEAD: Interested/asks price/calls.
- DELAYED_OR_BUDGET: Tight budget/reconnect later. Keep warm, ask budget/timeline gently.
- NOT_INTERESTED: Refusal/unsubscribe. Polite closing note.

Rules:
1. Direct, warm, crisp, 100% human.
2. Bridge previous context with new reply.
3. Call scheduling: Use ONLY "today or tomorrow" (NEVER name days like Monday/Friday).
4. Exactly 2-3 sentences max.
5. No bracket placeholders.

JSON Format:
{"category":"HOT_LEAD"|"DELAYED_OR_BUDGET"|"NOT_INTERESTED","summary":"1 brief sentence","suggestedReply":"ready to send response"}`;

// 🛡️ बुलेटप्रूफ़ JSON पार्सर
function parseAiJson(rawText: string) {
  if (!rawText) {
    return {
      category: "HOT_LEAD",
      summary: "No content returned",
      suggestedReply: "",
    };
  }

  try {
    const cleaned = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (innerErr) {
        console.error("Regex parse failed:", innerErr);
      }
    }

    return {
      category: "HOT_LEAD",
      summary: "Direct AI generated response",
      suggestedReply: rawText.replace(/```/g, "").trim(),
    };
  }
}

export async function POST(req: Request) {
  try {
    const body: RequestPayload = await req.json();
    const { emailText, subject, clientName = "there", previousOutreach = "" } = body;

    if (!emailText && !subject) {
      return NextResponse.json({ error: "Email content is required." }, { status: 400 });
    }

    // ⚡ Keys की लिस्ट निकालें (GEMINI_API_KEYS या पुरानी GEMINI_API_KEY दोनों सपोर्ट करेगा)
    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
    const apiKeys = rawKeys
      .split(",")
      .map((k) => k.trim().replace(/['"]/g, ""))
      .filter(Boolean);

    if (apiKeys.length === 0) {
      return NextResponse.json(
        { error: "कोई भी GEMINI_API_KEY .env.local में नहीं मिली।" },
        { status: 500 }
      );
    }

    let modelName = (process.env.GEMINI_MODEL || "gemini-3.6-flash")
      .trim()
      .replace(/['"]/g, "")
      .replace(/^models\//, "")
      .replace(/\/+$/, "");

    const cleanCurrent = (emailText || "").slice(0, 1200).trim();
    const cleanPrevious = (previousOutreach || "").slice(0, 800).trim();

    const userPrompt = `Client: ${clientName}
Subject: ${subject}
Previous Sent: ${cleanPrevious || "Initial outreach"}
Current Reply: ${cleanCurrent}`;


console.log("AI Assistant Prompt:", userPrompt);

    const payload = {
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 1000,
      },
    };

    let lastError: any = null;
    let successfulData: any = null;
    let workingKeyIndex = -1;

    // 🔄 ऑटोमैटिक की-स्विचिंग लूप (Key 1 -> Key 2 -> Key 3...)
    for (let i = 0; i < apiKeys.length; i++) {
      const currentKey = apiKeys[i];
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${currentKey}`;
      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        // अगर लिमिट खत्म (429) या सर्वर लोड (503) हुआ, तो अगली Key पर स्विच करें
        if (response.status === 429 || response.status === 503) {
          console.warn(`⚠️ Key index [${i}] कोटा/लोड एरर (${response.status})। अगली Key पर स्विच किया जा रहा है...`);
          lastError = data.error?.message || `Status ${response.status}`;
          continue;
        }

        if (!response.ok) {
          console.error(`Key index [${i}] API Error:`, data);
          lastError = data.error?.message || `Status ${response.status}`;
          continue;
        }

        // सफलता मिली
        successfulData = data;
        workingKeyIndex = i;
        break;
      } catch (networkErr: any) {
        console.error(`Key index [${i}] नेटवर्क एरर:`, networkErr.message);
        lastError = networkErr.message;
      }
    }

    if (!successfulData) {
      return NextResponse.json(
        { error: `सभी API Keys की लिमिट खत्म या अमान्य हैं। अंतिम एरर: ${lastError}` },
        { status: 429 }
      );
    }

    const generatedRawText =
      successfulData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const analysis = parseAiJson(generatedRawText);

    return NextResponse.json({
      success: true,
      providerUsed: modelName,
      keyIndexUsed: workingKeyIndex + 1,
      analysis,
    });
  } catch (err: any) {
    console.error("AI Assistant Route Error:", err);
    return NextResponse.json(
      { error: err.message || "AI रिप्लाई तैयार नहीं कर पाया।" },
      { status: 500 }
    );
  }
}