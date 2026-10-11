import crypto from "crypto";

// Encrypts third-party credentials (e.g. a user's PayPal secret) before they're stored in
// Firestore, with AES-256-GCM and a key from PAYMENT_SECRETS_KEY (set by the deploy script).

export const secretsConfigured = () => Boolean(process.env.PAYMENT_SECRETS_KEY);
const key = () => crypto.createHash("sha256").update(String(process.env.PAYMENT_SECRETS_KEY)).digest();

export function encryptSecret(plain: string): string {
  if (!secretsConfigured()) throw new Error("PAYMENT_SECRETS_KEY is not set");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(sealed: string): string {
  const [v, iv, tag, data] = String(sealed).split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unreadable secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
