// src/app/api/warmup/verify-peer/route.ts
import { NextResponse, NextRequest } from "next/server";
import nodemailer from "nodemailer";
import { decryptPassword } from "@/lib/encryption";

export async function POST(req: NextRequest) {
  try {
    const { email, appPassword } = await req.json();

    if (!email || !appPassword) {
      return NextResponse.json({ ok: false, error: "Credentials missing" }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    let cleanPass = String(appPassword).trim();

    if (cleanPass.includes(":") && cleanPass.length > 20) {
      try {
        cleanPass = decryptPassword(cleanPass);
      } catch (_) {}
    }
    cleanPass = cleanPass.replace(/\s+/g, "");

    // क्विक SMTP ऑथ टेस्ट (1-2 सेकंड)
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: cleanEmail, pass: cleanPass },
      connectionTimeout: 4000,
      greetingTimeout: 4000,
    });

    try {
      await transporter.verify();
      transporter.close();
      return NextResponse.json({ ok: true, active: true });
    } catch (authErr: any) {
      transporter.close();
      return NextResponse.json({
        ok: false,
        active: false,
        reason: authErr.code === "EAUTH" ? "SUSPENDED_OR_BAD_PASSWORD" : "CONNECTION_FAILED",
      });
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, active: false, error: err.message }, { status: 500 });
  }
}