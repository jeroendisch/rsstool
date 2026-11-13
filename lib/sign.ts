import { createHmac, timingSafeEqual } from "node:crypto";

function password(): string {
  const p = process.env.APP_PASSWORD;
  if (!p) throw new Error("APP_PASSWORD is niet ingesteld op de server.");
  return p;
}

export function checkPassword(given: string | null): boolean {
  if (!given) return false;
  const a = Buffer.from(createHmac("sha256", "pw").update(given).digest());
  const b = Buffer.from(createHmac("sha256", "pw").update(password()).digest());
  return timingSafeEqual(a, b);
}

/** Handtekening zodat alleen feeds werken die via de tool zijn aangemaakt. */
export function sign(url: string, selector: string): string {
  return createHmac("sha256", "feed:" + password())
    .update(url + "\n" + selector)
    .digest("base64url")
    .slice(0, 22);
}

export function verify(url: string, selector: string, key: string | null): boolean {
  if (!key) return false;
  const expected = Buffer.from(sign(url, selector));
  const given = Buffer.from(key);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
