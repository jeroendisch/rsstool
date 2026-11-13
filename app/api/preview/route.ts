import { normalizeUrl } from "@/lib/fetch";
import { buildFeed } from "@/lib/scrape";
import { checkPassword, sign } from "@/lib/sign";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!checkPassword(request.headers.get("x-password"))) {
      return Response.json({ error: "Wachtwoord klopt niet." }, { status: 401 });
    }
    const body = (await request.json()) as { url?: string; selector?: string; check?: boolean };
    if (body.check) return Response.json({ ok: true });

    const selector = (body.selector ?? "").trim();
    let page: URL;
    try {
      page = normalizeUrl(body.url ?? "");
    } catch {
      return Response.json({ error: "Dat is geen geldige URL." }, { status: 400 });
    }

    const { feed, candidates, existing } = await buildFeed(page, selector, 4);

    const u = page.href;
    const qs = new URLSearchParams({ u });
    if (selector) qs.set("s", selector);
    qs.set("k", sign(u, selector));
    const feedPath = `/feed?${qs}`;

    return Response.json({
      feedPath,
      title: feed.title,
      selector: feed.selector,
      manual: Boolean(selector),
      candidates,
      existing,
      items: feed.items.map(({ title, link, intro, image, content }) => ({
        title,
        link,
        intro,
        image,
        hasBody: Boolean(content),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Onbekende fout";
    return Response.json({ error: msg }, { status: 502 });
  }
}
