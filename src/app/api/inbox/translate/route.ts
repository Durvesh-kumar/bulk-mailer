// src/app/api/inbox/translate/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { text, subject } = await req.json();

    if (!text && !subject) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Translate the following business email into clear, simple, and polite Hindi (सरल और आसान हिंदी). 
Keep the tone natural so that anyone can easily read and understand what the client is saying:

Subject: ${subject}
Email Content:
${text}

Return the response in this format:
विषय: [हिंदी अनुवाद]
संदेश: [हिंदी अनुवाद]`;

    const result = await model.generateContent(prompt);
    const translatedText = result.response.text();

    return NextResponse.json({ success: true, translatedText });
  } catch (err: any) {
    console.error("Translation Error:", err);
    return NextResponse.json({ error: err.message || "Failed to translate" }, { status: 500 });
  }
}