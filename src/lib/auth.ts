/**
 * Sesión simple para el equipo: contraseña compartida (APP_PASSWORD) y cookie
 * firmada con HMAC-SHA256 (Web Crypto, funciona en middleware/edge y en node).
 */
export const SESSION_COOKIE = "pd_session";
const MAX_AGE_S = 60 * 60 * 24 * 14; // 14 días

const enc = new TextEncoder();
const secret = () => process.env.AUTH_SECRET || process.env.APP_PASSWORD || "";

async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSessionValue(): Promise<{ value: string; maxAge: number }> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  return { value: `${exp}.${await hmac(String(exp))}`, maxAge: MAX_AGE_S };
}

export async function verifySessionValue(value: string | undefined): Promise<boolean> {
  if (!value || !secret()) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = await hmac(exp);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/**
 * - AUTH_DISABLED=true → sin login (acceso abierto; la protección queda a cargo de Vercel).
 * - Con APP_PASSWORD → contraseña compartida del equipo.
 * - Sin contraseña solo se permite el modo demo (sin base real).
 */
export function authMode(): "open" | "password" | "open-demo" | "misconfigured" {
  if (process.env.AUTH_DISABLED === "true") return "open";
  if (process.env.APP_PASSWORD) return "password";
  return process.env.DATABASE_URL ? "misconfigured" : "open-demo";
}
