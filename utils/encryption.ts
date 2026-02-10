import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = process.env.CRIPTKEY || "";

if (!ENCRYPTION_KEY) {
  console.warn("CRIPTKEY não configurada no ambiente");
}

// Ensure key is 32 bytes for AES-256
const getKey = (): Buffer => {
  const key = ENCRYPTION_KEY.padEnd(32, "0").substring(0, 32);
  return Buffer.from(key, "utf8");
};

/**
 * Encrypts a text string using AES-256-CBC
 * @param text - The text to encrypt
 * @returns The encrypted text in format: iv:encryptedData
 */
export const encrypt = (text: string): string => {
  if (!text) return text;
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  return `${iv.toString("hex")}:${encrypted}`;
};

/**
 * Decrypts an encrypted text string
 * @param text - The encrypted text in format: iv:encryptedData
 * @returns The decrypted text
 */
export const decrypt = (text: string): string => {
  if (!text || !text.includes(":")) return text;
  
  const [ivHex, encryptedData] = text.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
};
