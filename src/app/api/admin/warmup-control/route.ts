// src/app/api/admin/warmup-control/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "STANDBY",
    mode: "BROWSER_MANAGED",
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return NextResponse.json({
      success: true,
      received: body,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}