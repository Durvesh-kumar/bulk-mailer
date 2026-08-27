import { NextResponse } from "next/server";

let engineRunning = false;
let batchSpeed = 3;

export async function GET() {
  return NextResponse.json({
    isRunning: engineRunning,
    batchPerMinute: batchSpeed,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (typeof body.isRunning === "boolean") {
      engineRunning = body.isRunning;
    }
    if (typeof body.batchPerMinute === "number") {
      batchSpeed = Math.max(1, Math.min(20, body.batchPerMinute));
    }

    return NextResponse.json({
      success: true,
      isRunning: engineRunning,
      batchPerMinute: batchSpeed,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}