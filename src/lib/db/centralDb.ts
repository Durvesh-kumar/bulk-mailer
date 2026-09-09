import mongoose from "mongoose";

let cached = (global as any).mongooseCentral;

if (!cached) {
  cached = (global as any).mongooseCentral = { conn: null, promise: null };
}

export async function connectToCentralDB() {
  const CENTRAL_DB_URI = process.env.MONGODB_URI;

  if (!CENTRAL_DB_URI) {
    throw new Error("MONGODB_URI is missing in environment variables!");
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
    };

    cached.promise = mongoose.connect(CENTRAL_DB_URI, opts).then((instance) => instance);
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