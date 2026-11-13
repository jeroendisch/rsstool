import { normalizeUrl } from "@/lib/fetch";
import { toRss } from "@/lib/rss";
import { buildFeed } from "@/lib/scrape";
import { verify } from "@/lib/sign";

export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const u = params.get("u") ?? "";
  const s = params.get("s") ?? "";

  try {
    if (!verify(u, s, params.get("k"))) {
      return new Response("Ongeldige feed-link.", { status: 403 });
    }
    const { feed } = await buildFeed(normalizeUrl(u), s);
    if (!feed.items.length) {
      return new Response("Geen artikelen gevonden op deze pagina.", { status: 502 });
    }
    return new Response(toRss(feed, request.url), {
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        // Vercel bewaart de feed 30 min; daarna ververst hij op de achtergrond.
        "cache-control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Onbekende fout";
    return new Response(`Feed maken mislukt: ${msg}`, { status: 502 });
  }
}
