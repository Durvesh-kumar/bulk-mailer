// src/lib/encryption.ts
import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

function getVaultKey(): Buffer {
  const secret = process.env.DB_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("DB_ENCRYPTION_KEY is missing in environment variables!");
  }
  return crypto.createHash("sha256").update(String(secret).trim()).digest();
}

// 🔒 O(1) एन्क्रिप्शन
export function encryptPassword(text: string): string {
  if (!text) return "";
  const key = getVaultKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text.trim(), "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

// 🔓 O(1) डिक्रिप्शन
export function decryptPassword(encryptedText: string): string {
  if (!encryptedText) return "";
  if (!encryptedText.includes(":")) return encryptedText;

  try {
    const key = getVaultKey();
    const splitIndex = encryptedText.indexOf(":");
    const ivHex = encryptedText.substring(0, splitIndex);
    const cipherHex = encryptedText.substring(splitIndex + 1);

    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted.trim();
  } catch (err) {
    console.error("Decryption failure:", err);
    return encryptedText;
  }
}