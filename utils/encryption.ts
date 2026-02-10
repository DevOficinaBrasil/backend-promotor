import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = process.env.CRIPTKEY || "";

// Validate encryption key on startup
if (!ENCRYPTION_KEY) {
  throw new Error("CRIPTKEY must be configured in environment variables");
}

// Derive a proper 32-byte key from the provided CRIPTKEY using SHA-256
const getKey = (): Buffer => {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
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
  
  const parts = text.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted text format - expected exactly one colon separator");
  }
  
  const [ivHex, encryptedData] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
};
