// src/lib/db/tenantDb.ts
import mongoose, { Connection } from "mongoose";

const tenantConnections: Record<string, Connection> = {};

export async function getTenantDB(customUri?: string): Promise<Connection> {
  const targetUri = customUri || process.env.MONGODB_URI_USER;

  if (!targetUri) {
    throw new Error("⚠️ Please define MONGODB_URI_USER in your .env.local file.");
  }

  const existingConn = tenantConnections[targetUri];
  if (existingConn && existingConn.readyState === 1) {
    return existingConn;
  }

  if (existingConn) {
    delete tenantConnections[targetUri];
  }

  try {
    const conn = await mongoose.createConnection(targetUri, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    }).asPromise();

    conn.on("disconnected", () => {
      delete tenantConnections[targetUri];
    });

    tenantConnections[targetUri] = conn;
    return conn;
  } catch (error: any) {
    console.error("❌ User/Tenant Database Connection Failed:", error);
    delete tenantConnections[targetUri];
    throw error;
  }
}