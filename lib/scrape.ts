import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { fetchHtml } from "./fetch";

export type Item = {
  title: string;
  link: string;
  intro: string;
  image: string;
  content: string;
  date: string;
  /** Titel kwam niet uit zichtbare tekst maar uit bijv. een alt-tekst. */
  weakTitle?: boolean;
};

export type Candidate = { selector: string; count: number; samples: string[] };

export type Feed = {
  title: string;
  description: string;
  link: string;
  selector: string;
  items: Item[];
};

export type ExistingFeed = { url: string; title: string };

const MAX_ITEMS = 15;
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function abs(href: string | null | undefined, base: URL): string {
  if (!href) return "";
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

function imgSrc(img: Element | null, base: URL): string {
  if (!img) return "";
  const lazy =
    img.getAttribute("data-src") ||
    img.getAttribute("data-lazy-src") ||
    img.getAttribute("data-original");
  const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
  const fromSet = srcset?.split(",").pop()?.trim().split(/\s+/)[0];
  const src = img.getAttribute("src");
  const pick = lazy || (src && !src.startsWith("data:") ? src : "") || fromSet || "";
  return abs(pick, base);
}

/* ---------- Bestaande feeds ---------- */

export function findFeeds(document: Document, base: URL): ExistingFeed[] {
  const out: ExistingFeed[] = [];
  document.querySelectorAll('link[rel~="alternate"]').forEach((l) => {
    const type = l.getAttribute("type") ?? "";
    if (!/rss|atom|feed\+json/i.test(type)) return;
    const url = abs(l.getAttribute("href"), base);
    if (url && !out.some((f) => f.url === url)) {
      out.push({ url, title: clean(l.getAttribute("title")) || "Feed" });
    }
  });
  return out;
}

/* ---------- Artikelen herkennen ---------- */

function part(el: Element): string {
  const classes = (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((c) => /^[a-zA-Z_-][a-zA-Z_-]*$/.test(c))
    .slice(0, 2);
  return el.localName + classes.map((c) => "." + c).join("");
}

function selectorFor(a: Element): string {
  const parts: string[] = [];
  let el: Element | null = a;
  for (let i = 0; i < 4 && el && el.localName !== "body" && el.localName !== "html"; i++) {
    parts.unshift(part(el));
    el = el.parentElement;
  }
  return parts.join(" > ");
}

/** Zichtbare kop of linktekst. Leeg bij een link met alleen een afbeelding. */
function strongTitle(a: Element): string {
  const h = a.querySelector("h1,h2,h3,h4,h5,h6");
  return clean(h?.textContent) || clean(a.textContent);
}

/** Noodtitel uit attributen; een alt-tekst beschrijft vaak de foto, niet het artikel. */
function weakTitle(a: Element): string {
  return (
    clean(a.getAttribute("aria-label")) ||
    clean(a.getAttribute("title")) ||
    clean(a.querySelector("img")?.getAttribute("alt"))
  );
}

function titleOf(a: Element): string {
  return strongTitle(a) || weakTitle(a);
}

/** Link die alleen voor de vorm is: verborgen voor schermlezers of zonder zichtbare tekst. */
const isDecorative = (a: Element) =>
  a.getAttribute("aria-hidden") === "true" || a.getAttribute("tabindex") === "-1" || !strongTitle(a);

const sameSite = (a: URL, b: URL) =>
  a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");

function linkOf(a: Element, base: URL): URL | null {
  const href = abs(a.getAttribute("href"), base);
  if (!href) return null;
  const u = new URL(href);
  u.hash = "";
  if (!sameSite(u, base)) return null;
  if (u.pathname.replace(/\/$/, "") === base.pathname.replace(/\/$/, "") && u.search === base.search) return null;
  if (/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp[34])$/i.test(u.pathname)) return null;
  return u;
}

export function detectCandidates(document: Document, base: URL): Candidate[] {
  const groups = new Map<
    string,
    { links: Map<string, string>; chrome: number; decorative: number; total: number }
  >();

  document.querySelectorAll("a[href]").forEach((a) => {
    const u = linkOf(a, base);
    if (!u) return;
    const sel = selectorFor(a);
    let g = groups.get(sel);
    if (!g) groups.set(sel, (g = { links: new Map(), chrome: 0, decorative: 0, total: 0 }));
    g.total++;
    if (a.closest("nav,footer,header,aside,[role=navigation]")) g.chrome++;
    if (isDecorative(a)) g.decorative++;
    const title = titleOf(a);
    if (!g.links.has(u.href) || title.length > (g.links.get(u.href) ?? "").length) {
      g.links.set(u.href, title);
    }
  });

  const scored: (Candidate & { score: number })[] = [];
  for (const [selector, g] of groups) {
    const entries = [...g.links.entries()];
    const n = entries.length;
    if (n < 3) continue;
    const titles = entries.map(([, t]) => t).filter(Boolean);
    if (titles.length < n * 0.6) continue;
    const avgLen = titles.reduce((s, t) => s + t.length, 0) / titles.length;
    const lenScore = avgLen < 12 ? 0.05 : avgLen < 25 ? 0.5 : avgLen <= 160 ? 1 : 0.5;
    const slugShare =
      entries.filter(([href]) => {
        const segs = new URL(href).pathname.split("/").filter(Boolean);
        const last = segs[segs.length - 1] ?? "";
        return segs.length >= 2 || last.includes("-") || last.length > 20;
      }).length / n;
    const chromePenalty = g.chrome / g.total > 0.5 ? 0.15 : 1;
    // Fotolinks verliezen van de koplinks naar dezelfde artikelen.
    const decorPenalty = g.decorative / g.total > 0.5 ? 0.25 : 1;
    const score = Math.min(n, 25) * lenScore * (0.4 + slugShare) * chromePenalty * decorPenalty;
    scored.push({ selector, count: n, samples: titles.slice(0, 2), score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map(({ selector, count, samples }) => ({ selector, count, samples }));
}

function extractList(document: Document, base: URL, selector: string): Item[] {
  let nodes: Element[];
  try {
    nodes = [...document.querySelectorAll(selector)];
  } catch {
    throw new Error("Die CSS-selector is ongeldig.");
  }

  const pairs: { el: Element; a: Element; link: string }[] = [];
  for (const el of nodes) {
    const a = el.matches("a[href]")
      ? el
      : (el.querySelector("h1 a[href],h2 a[href],h3 a[href],h4 a[href]") ?? el.querySelector("a[href]"));
    if (!a) continue;
    const u = linkOf(a, base);
    if (u) pairs.push({ el, a, link: u.href });
  }
  const hrefs = new Set(pairs.map((p) => p.link));

  const items = new Map<string, Item>();
  for (const { el, a, link } of pairs) {
    // Zoek de "kaart" rond de link: de grootste ouder met maar één artikel erin.
    let card = el;
    for (let i = 0; i < 5 && card.parentElement; i++) {
      const p = card.parentElement;
      const inside = new Set<string>();
      p.querySelectorAll("a[href]").forEach((x) => {
        const h = linkOf(x, base)?.href;
        if (h && hrefs.has(h)) inside.add(h);
      });
      if (inside.size > 1 || p.localName === "body") break;
      card = p;
    }
    // Zichtbare kop gaat voor; daarna de kop in de kaart; alt-tekst pas als laatste.
    const visible = strongTitle(a) || clean(card.querySelector("h1,h2,h3,h4,h5,h6")?.textContent);
    const title = visible || weakTitle(a);
    const weak = !visible;
    const prev = items.get(link);
    // Een zichtbare kop wint altijd van een alt-tekst, ook als die langer is.
    if (prev && (weak && !prev.weakTitle || (weak === Boolean(prev.weakTitle) && prev.title.length >= title.length))) {
      continue;
    }
    const intro = [...card.querySelectorAll("p")]
      .map((p) => clean(p.textContent))
      .find((t) => t.length > 30 && t !== title);
    items.set(link, {
      title,
      link,
      intro: intro ?? "",
      image: imgSrc(card.querySelector("img"), base),
      content: "",
      date: "",
      weakTitle: weak,
    });
  }
  return [...items.values()].filter((i) => i.title).slice(0, MAX_ITEMS);
}

/* ---------- Artikel ophalen ---------- */

function fixContent(html: string, base: URL): string {
  const { document } = parseHTML(`<!doctype html><html><body><div id="r">${html}</div></body></html>`);
  const root = document.getElementById("r");
  if (!root) return html;
  root.querySelectorAll("script,style,noscript,iframe[src^='about:'],form,button").forEach((n) => n.remove());
  root.querySelectorAll("img").forEach((img) => {
    const src = imgSrc(img, base);
    if (!src) return img.remove();
    img.setAttribute("src", src);
    for (const a of ["srcset", "sizes", "data-src", "data-srcset", "loading", "class", "style"]) {
      img.removeAttribute(a);
    }
  });
  root.querySelectorAll("source").forEach((s) => s.remove());
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = abs(a.getAttribute("href"), base);
    if (href) a.setAttribute("href", href);
  });
  root.querySelectorAll("[class],[style],[id]").forEach((n) => {
    n.removeAttribute("class");
    n.removeAttribute("style");
    n.removeAttribute("id");
  });
  return root.innerHTML.trim();
}

function toIso(s: string | null | undefined): string {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Haalt " | Sitenaam" van het eind van een paginatitel. */
const stripSite = (s: string) => s.replace(/\s+[|·–—-]\s+[^|·–—-]{2,40}$/, "").trim();

/**
 * Zichtbare kop van de artikelpagina. Volgorde:
 * 1. een h1 die (grotendeels) gelijk is aan og:title of <title> zonder sitenaam;
 * 2. de enige inhouds-h1, of die in <article>/<main>;
 * 3. og:title zonder sitenaam (soms een SEO-titel, daarom pas als laatste).
 * Logo-koppen in de header, het menu of een link tellen niet mee.
 */
function headlineOf(document: Document, ogTitle: string): string {
  const refs = [stripSite(ogTitle), stripSite(clean(document.querySelector("title")?.textContent))]
    .map(norm)
    .filter((r) => r.length >= 10);

  const content: { text: string; inArticle: boolean }[] = [];
  for (const h of document.querySelectorAll("h1")) {
    const header = h.closest("header");
    if ((header && !header.closest("article,main")) || h.closest("nav,a")) continue;
    if (/logo|brand|site-title/i.test(h.getAttribute("class") ?? "")) continue;
    const text = clean(h.textContent);
    if (norm(text).length < 10 || text.length > 250) continue;
    content.push({ text, inArticle: Boolean(h.closest("article,main")) });
  }

  const matching = content.filter(({ text }) => {
    const n = norm(text);
    return refs.some(
      (r) => (r.includes(n) && n.length >= r.length * 0.6) || (n.includes(r) && r.length >= n.length * 0.6),
    );
  });
  if (matching.length) return matching.sort((a, b) => b.text.length - a.text.length)[0].text;
  if (content.length === 1) return content[0].text;
  const inArticle = content.filter((c) => c.inArticle);
  if (inArticle.length === 1) return inArticle[0].text;

  const og = stripSite(ogTitle);
  return og.length >= 10 ? og : "";
}

async function enrich(item: Item): Promise<Item> {
  try {
    const { html, url } = await fetchHtml(item.link, 8000);
    const { document } = parseHTML(html);
    const meta = (...names: string[]) => {
      for (const n of names) {
        const v = clean(
          document.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.getAttribute("content"),
        );
        if (v) return v;
      }
      return "";
    };

    const date =
      toIso(meta("article:published_time", "date", "pubdate", "parsely-pub-date")) ||
      toIso(/"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1]) ||
      toIso(document.querySelector("time[datetime]")?.getAttribute("datetime"));
    const image = abs(meta("og:image", "twitter:image"), url) || item.image;
    const description = meta("og:description", "description", "twitter:description");
    const headline = headlineOf(document, meta("og:title"));

    let content = "";
    let excerpt = "";
    try {
      const parsed = new Readability(document as unknown as Document).parse();
      if (parsed?.content && clean(parsed.textContent).length > 200) {
        content = fixContent(parsed.content, url);
        excerpt = clean(parsed.excerpt);
      }
    } catch {
      /* geen leesbare bodytext gevonden */
    }

    return {
      ...item,
      // De zichtbare kop van het overzicht is leidend; de artikelpagina vult alleen aan.
      title: item.weakTitle ? headline || item.title : item.title,
      weakTitle: item.weakTitle && !headline,
      intro: description || item.intro || excerpt,
      image,
      content,
      date,
    };
  } catch {
    return item;
  }
}

async function mapLimit<T, R>(list: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (i < list.length) {
        const idx = i++;
        out[idx] = await fn(list[idx]);
      }
    }),
  );
  return out;
}

/* ---------- Alles samen ---------- */

export async function buildFeed(
  pageUrl: URL,
  selector: string,
  enrichLimit = MAX_ITEMS,
): Promise<{ feed: Feed; candidates: Candidate[]; existing: ExistingFeed[] }> {
  const { html, url } = await fetchHtml(pageUrl);
  const { document } = parseHTML(html);

  const existing = findFeeds(document, url);
  const candidates = detectCandidates(document, url);
  const used = selector || candidates[0]?.selector || "";
  const list = used ? extractList(document, url, used) : [];

  const head = await mapLimit(list.slice(0, enrichLimit), 5, enrich);
  const items = [...head, ...list.slice(enrichLimit)];

  const meta = (n: string) =>
    clean(document.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.getAttribute("content"));
  const title = clean(document.querySelector("title")?.textContent) || meta("og:title") || url.hostname;

  return {
    feed: {
      title,
      description: meta("description") || meta("og:description") || `Feed van ${url.hostname}`,
      link: url.href,
      selector: used,
      items,
    },
    candidates,
    existing,
  };
}
