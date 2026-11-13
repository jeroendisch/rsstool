"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Info, Loader2, LogOut, Rss, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Result = {
  feedPath: string;
  title: string;
  selector: string;
  manual: boolean;
  candidates: { selector: string; count: number; samples: string[] }[];
  existing: { url: string; title: string }[];
  items: { title: string; link: string; intro: string; image: string; hasBody: boolean }[];
};

const KEY = "rss-tool-password";

function CopyButton({ value, outline }: { value: string; outline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant={copied ? "secondary" : outline ? "outline" : "default"}
      className="shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          const t = document.createElement("textarea");
          t.value = value;
          document.body.appendChild(t);
          t.select();
          document.execCommand("copy");
          t.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Gekopieerd" : "Kopieer"}
    </Button>
  );
}

export default function Home() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [url, setUrl] = useState("");
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let saved = "";
    try {
      saved = localStorage.getItem(KEY) ?? "";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPassword(saved);
    setAuthed(Boolean(saved));
  }, []);

  async function call(body: object, pw = password) {
    const res = await fetch("/api/preview", {
      method: "POST",
      headers: { "content-type": "application/json", "x-password": pw },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: "De server gaf geen geldig antwoord." }));
    if (res.status === 401) {
      try {
        localStorage.removeItem(KEY);
      } catch {}
      setAuthed(false);
    }
    if (!res.ok) throw new Error(data.error ?? "Er ging iets mis.");
    return data;
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await call({ check: true });
      try {
        localStorage.setItem(KEY, password);
      } catch {}
      setAuthed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setLoading(false);
    }
  }

  async function generate(selector = "") {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    try {
      setResult(await call({ url, selector }));
      setCustom(selector);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setLoading(false);
    }
  }

  const feedUrl = result ? window.location.origin + result.feedPath : "";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12 sm:py-20">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
              <Rss className="size-4" />
            </span>
            <h1 className="text-xl font-semibold tracking-tight">RSS tool</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Plak een pagina. Krijg een feed die je in Reeder kunt laden.
          </p>
        </div>
        {authed && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Uitloggen"
            title="Uitloggen"
            onClick={() => {
              try {
                localStorage.removeItem(KEY);
              } catch {}
              setPassword("");
              setResult(null);
              setAuthed(false);
            }}
          >
            <LogOut />
          </Button>
        )}
      </header>

      {authed === false && (
        <Card>
          <CardHeader>
            <CardTitle>Inloggen</CardTitle>
            <CardDescription>Alleen jij kunt nieuwe feeds maken.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={login} className="flex flex-col gap-3">
              <Label htmlFor="pw">Wachtwoord</Label>
              <div className="flex gap-2">
                <Input
                  id="pw"
                  type="password"
                  autoFocus
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button type="submit" disabled={loading || !password}>
                  {loading && <Loader2 className="animate-spin" />}
                  Verder
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {authed && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            generate();
          }}
          className="flex flex-col gap-3"
        >
          <Label htmlFor="url">Pagina met artikelen</Label>
          <div className="flex gap-2">
            <Input
              id="url"
              type="text"
              inputMode="url"
              autoFocus
              placeholder="https://www.creativeboom.com/branding/"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button type="submit" disabled={loading || !url.trim()} className="shrink-0">
              {loading && <Loader2 className="animate-spin" />}
              Maak feed
            </Button>
          </div>
        </form>
      )}

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Dat lukte niet</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {authed && loading && !result && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      )}

      {authed && result && (
        <div className={cn("flex flex-col gap-6 transition-opacity", loading && "opacity-50")}>
          {result.items.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Je feed</CardTitle>
                <CardDescription className="truncate">{result.title}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={feedUrl}
                    aria-label="Feed-URL"
                    className="font-mono text-xs md:text-xs"
                    onFocus={(e) => e.target.select()}
                  />
                  <CopyButton value={feedUrl} />
                </div>
                <p className="text-muted-foreground text-xs">
                  Plak de link in Reeder. De feed ververst elk half uur.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Alert>
              <Info />
              <AlertTitle>Geen artikelen gevonden</AlertTitle>
              <AlertDescription>
                Mogelijk laadt deze site zijn inhoud via JavaScript, of blokkeert hij scrapers. Probeer
                hieronder een eigen CSS-selector.
              </AlertDescription>
            </Alert>
          )}

          {result.existing.length > 0 && (
            <Alert>
              <Info />
              <AlertTitle>Deze site heeft zelf al een feed</AlertTitle>
              <AlertDescription className="w-full">
                <p>Die is meestal betrouwbaarder. Check wel of hij dezelfde rubriek dekt.</p>
                <ul className="mt-2 flex w-full flex-col gap-2">
                  {result.existing.slice(0, 3).map((f) => (
                    <li key={f.url} className="flex w-full items-center gap-2">
                      <span className="text-foreground min-w-0 flex-1 truncate font-mono text-xs">{f.url}</span>
                      <CopyButton value={f.url} outline />
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {result.items.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Voorbeeld</CardTitle>
                  <Badge variant="secondary">{result.items.length} artikelen</Badge>
                </div>
                <CardDescription>Zo komen de berichten in je reader.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {result.items.map((item) => (
                    <li key={item.link} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="bg-muted size-14 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="bg-muted size-14 shrink-0 rounded-md" />
                      )}
                      <div className="flex min-w-0 flex-col gap-1">
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          className="line-clamp-2 text-sm leading-snug font-medium hover:underline"
                        >
                          {item.title}
                        </a>
                        {item.intro && (
                          <p className="text-muted-foreground line-clamp-2 text-xs">{item.intro}</p>
                        )}
                        {item.hasBody && (
                          <Badge variant="outline" className="mt-0.5">
                            <Check className="size-3" /> bodytext
                          </Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Bijsturen</CardTitle>
              <CardDescription>
                Verkeerde links gepakt? Kies een andere groep, of geef zelf een CSS-selector op.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {result.candidates.length > 0 && (
                <div className="flex flex-col gap-2">
                  {result.candidates.map((c, i) => {
                    const active = c.selector === result.selector;
                    return (
                      <button
                        key={c.selector}
                        type="button"
                        disabled={loading}
                        onClick={() => generate(i === 0 ? "" : c.selector)}
                        className={cn(
                          "hover:bg-accent flex cursor-pointer flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors",
                          active && "border-primary bg-accent",
                        )}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span className="truncate">{c.samples[0] ?? "Zonder titel"}</span>
                          <Badge variant="secondary" className="ml-auto">
                            {c.count} links
                          </Badge>
                        </span>
                        <span className="text-muted-foreground truncate font-mono text-xs">{c.selector}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  generate(custom.trim());
                }}
                className="flex flex-col gap-2"
              >
                <Label htmlFor="sel">Eigen CSS-selector</Label>
                <div className="flex gap-2">
                  <Input
                    id="sel"
                    placeholder="article h2 a"
                    className="font-mono text-xs md:text-xs"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                  />
                  <Button type="submit" variant="outline" disabled={loading} className="shrink-0">
                    Toepassen
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
