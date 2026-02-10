import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = process.env.CRIPTKEY || "";

// Validate encryption key on startup
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error("CRIPTKEY must be configured and at least 32 characters long for secure encryption");
}

// Ensure key is exactly 32 bytes for AES-256
const getKey = (): Buffer => {
  // Take first 32 bytes or pad with zeros if needed
  const key = ENCRYPTION_KEY.substring(0, 32).padEnd(32, "0");
  return Buffer.from(key, "utf8");
};

/**
 * Encrypts a text string using AES-256-CBC
 * @param text - The text to encrypt
 * @returns The encrypted text in format: iv:encryptedData
 */
export const encrypt = (text: string): string => {
  if (text === null || text === undefined) {
    throw new Error("Cannot encrypt null or undefined value");
  }
  
  if (text === "") {
    throw new Error("Cannot encrypt empty string");
  }
  
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
  if (text === null || text === undefined) {
    throw new Error("Cannot decrypt null or undefined value");
  }
  
  if (!text.includes(":")) {
    throw new Error("Invalid encrypted text format - expected format: iv:encryptedData");
  }
  
  const [ivHex, encryptedData] = text.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
};
