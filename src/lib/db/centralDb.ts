// src/lib/db/centralDb.ts
import mongoose from "mongoose";

const MONGODB_URI = process.env.CENTRAL_DB_URI || process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("⚠️ Please define CENTRAL_DB_URI or MONGODB_URI in your .env.local file.");
}

let cached = (global as any).mongooseCentral;

if (!cached) {
  cached = (global as any).mongooseCentral = { conn: null, promise: null };
}

export async function connectToCentralDB() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
    };

    cached.promise = mongoose.connect(MONGODB_URI!, opts).then((instance) => instance);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error("❌ Central Database Connection Failed:", e);
    throw e;
  }

  return cached.conn;
}