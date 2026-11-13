# RSS tool

Maakt van elke pagina met artikelen een RSS-feed voor Reeder (of een andere reader).

## Hoe het werkt

- Je plakt een URL. De tool zoekt de groep links die het meest op artikelen lijkt.
- Per artikel haalt hij kop, intro, beeld, datum en bodytext op.
- Je krijgt een feed-URL. Alle instellingen zitten in die URL, er is geen database.
- De URL is ondertekend met je wachtwoord. Alleen feeds die jij aanmaakt werken.
- Vercel bewaart elke feed 30 minuten. Daarna ververst hij op de achtergrond.

## Deployen op Vercel

1. Zet deze map in een nieuwe GitHub-repository.
2. Importeer die repository als nieuw project in Vercel.
3. Voeg de environment variable `APP_PASSWORD` toe, met een lang wachtwoord.
4. Deploy. Open de site en log in met dat wachtwoord.

Of zonder GitHub: draai `npx vercel` in deze map en zet daarna `APP_PASSWORD` in de projectinstellingen.

Let op: verander je `APP_PASSWORD` en al je bestaande feed-URL's vervallen.

## Lokaal draaien

```
npm install
APP_PASSWORD=test npm run dev
```

## Beperkingen

- Sites die hun inhoud via JavaScript laden werken niet.
- Sommige sites blokkeren verzoeken vanaf servers. Dan blijft de feed leeg.
- Maximaal 15 artikelen per feed.

## Belangrijkste bestanden

- `lib/scrape.ts` herkent artikelen en haalt de inhoud op.
- `lib/rss.ts` bouwt de RSS-XML.
- `lib/sign.ts` regelt wachtwoord en ondertekening.
- `app/feed/route.ts` is de feed zelf.
- `app/page.tsx` is de interface.
