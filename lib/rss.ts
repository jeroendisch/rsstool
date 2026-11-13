import type { Feed } from "./scrape";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // tekens die niet in XML mogen
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const cdata = (s: string) =>
  "<![CDATA[" +
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/]]>/g, "]]]]><![CDATA[>") +
  "]]>";

export function toRss(feed: Feed, selfUrl: string): string {
  const items = feed.items
    .map((i) => {
      const hasImage = i.image && i.content.includes(i.image);
      const lead = i.image && !hasImage ? `<p><img src="${esc(i.image)}" alt=""></p>` : "";
      const intro = i.intro && !i.content ? `<p>${esc(i.intro)}</p>` : "";
      const body = lead + intro + i.content;
      return [
        "<item>",
        `<title>${esc(i.title)}</title>`,
        `<link>${esc(i.link)}</link>`,
        `<guid isPermaLink="true">${esc(i.link)}</guid>`,
        i.date ? `<pubDate>${new Date(i.date).toUTCString()}</pubDate>` : "",
        i.intro ? `<description>${cdata(i.intro)}</description>` : "",
        body ? `<content:encoded>${cdata(body)}</content:encoded>` : "",
        i.image ? `<media:content url="${esc(i.image)}" medium="image"/>` : "",
        "</item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(feed.title)}</title>
<link>${esc(feed.link)}</link>
<description>${esc(feed.description)}</description>
<atom:link href="${esc(selfUrl)}" rel="self" type="application/rss+xml"/>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>
`;
}
