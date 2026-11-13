import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const MAX_BYTES = 3_000_000;

function isPrivate(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    if (l.startsWith("::ffff:")) return isPrivate(l.slice(7));
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/** Voorkomt dat de tool misbruikt wordt om interne adressen op te vragen. */
async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Alleen http(s)-adressen werken.");
  }
  if (process.env.ALLOW_PRIVATE_HOSTS === "1") return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(isPrivate)) throw new Error("Dit adres is niet toegestaan.");
}

export function normalizeUrl(input: string): URL {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  return new URL(s);
}

export async function fetchHtml(
  input: string | URL,
  timeoutMs = 10_000,
): Promise<{ html: string; url: URL }> {
  let url = typeof input === "string" ? new URL(input) : input;
  const signal = AbortSignal.timeout(timeoutMs);

  for (let hop = 0; hop < 6; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "nl,en;q=0.8",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Lege redirect.");
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) throw new Error(`De site antwoordt met status ${res.status}.`);

    const reader = res.body?.getReader();
    if (!reader) return { html: "", url };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      chunks.push(value);
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
    }
    const buf = Buffer.concat(chunks);
    const ct = res.headers.get("content-type") ?? "";
    const charset =
      /charset=["']?([\w-]+)/i.exec(ct)?.[1] ??
      /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 2048).toString("latin1"))?.[1] ??
      "utf-8";
    let html: string;
    try {
      html = new TextDecoder(charset).decode(buf);
    } catch {
      html = buf.toString("utf-8");
    }
    return { html, url };
  }
  throw new Error("Te veel redirects.");
}
