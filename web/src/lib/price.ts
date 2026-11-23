// An approximate US-dollar hint next to GNOT amounts.
//
// The dollar figure is display only: it never feeds any amount that goes into
// a transaction (those are always the exact ugnot the user typed). On a test
// network GNOT has no value; the figure is what the same number of mainnet
// GNOT would be worth at the current market price.
//
// One request, at most every few minutes: CoinGecko's keyless public API for
// the coin with id "gno-land" (symbol GNOT, the Gno.land chain's own coin).
// No credentials, no referrer, nothing about the user or their address.
// Any failure (timeout, HTTP error, odd body) hides the figures, silently.

export interface GnotPrice {
  /** US dollars per 1 GNOT. */
  usd: number;
  /** When the price was fetched (ms since epoch). */
  fetchedAt: number;
  /** Who said so, for the tooltip ("CoinGecko", or "set by hand"). */
  source: string;
}

export const PRICE_TTL_MS = 5 * 60 * 1000;
export const PRICE_TIMEOUT_MS = 3500;
export const PRICE_STORAGE_KEY = "questmaster.gnotUsd.v1";
export const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=gno-land&vs_currencies=usd";

/** Rejects anything that is not a plausible GNOT price (guards against the wrong coin or a broken reply). */
export function saneUsd(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v < 10_000;
}

/** Reads the CoinGecko body: {"gno-land":{"usd":0.0507}}. */
export function parseCoinGecko(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const coin = (body as Record<string, unknown>)["gno-land"];
  if (!coin || typeof coin !== "object") return null;
  const usd = (coin as Record<string, unknown>).usd;
  return saneUsd(usd) ? usd : null;
}

// ------------------------------------------------------------------ formatting

/** ugnot × USD/GNOT as a float; display only. */
export function usdValue(ugnot: bigint, usdPerGnot: number): number {
  // Split to keep precision for very large amounts.
  const whole = Number(ugnot / 1_000_000n);
  const frac = Number(ugnot % 1_000_000n) / 1_000_000;
  return (whole + frac) * usdPerGnot;
}

/**
 * "≈ $0.25", "≈ $1,234", "≈ $1.2M", "< $0.01" — or null when there is no price.
 * Two decimals under $100, whole dollars up to a million, compact above.
 */
export function formatUsd(ugnot: bigint, usdPerGnot: number | null | undefined): string | null {
  if (!saneUsd(usdPerGnot) || ugnot < 0n) return null;
  const v = usdValue(ugnot, usdPerGnot);
  if (v === 0) return "≈ $0";
  if (v < 0.01) return "< $0.01";
  if (v < 100) return "≈ $" + v.toFixed(2);
  if (v < 1_000_000) return "≈ $" + Math.round(v).toLocaleString("en-US");
  return "≈ $" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

/** The price itself, e.g. "$0.0508" (4 significant digits under $1). */
export function formatPrice(usdPerGnot: number): string {
  return usdPerGnot >= 1 ? "$" + usdPerGnot.toFixed(2) : "$" + Number(usdPerGnot.toPrecision(3)).toString();
}

// ------------------------------------------------------------------ fetching

export interface PriceDeps {
  fetch: typeof fetch;
  now: () => number;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  url: string;
  timeoutMs: number;
}

let memory: GnotPrice | null = null;
let inflight: Promise<GnotPrice | null> | null = null;

/** For tests. */
export function resetPriceCache(): void {
  memory = null;
  inflight = null;
}

function fromStorage(d: PriceDeps): GnotPrice | null {
  try {
    const raw = d.storage?.getItem(PRICE_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<GnotPrice>;
    if (!saneUsd(p.usd) || typeof p.fetchedAt !== "number" || typeof p.source !== "string") return null;
    return { usd: p.usd, fetchedAt: p.fetchedAt, source: p.source };
  } catch {
    return null;
  }
}

function fresh(p: GnotPrice | null, now: number): p is GnotPrice {
  return !!p && now - p.fetchedAt >= 0 && now - p.fetchedAt < PRICE_TTL_MS;
}

/**
 * The GNOT/USD price: memory cache, then localStorage, then one network
 * request with a short timeout. Never throws; null means "hide the figures".
 */
export async function loadPrice(d: PriceDeps): Promise<GnotPrice | null> {
  const now = d.now();
  if (fresh(memory, now)) return memory;
  const stored = fromStorage(d);
  if (fresh(stored, now)) return (memory = stored);
  if (inflight) return inflight;
  inflight = (async () => {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), d.timeoutMs);
    try {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), d.timeoutMs + 50));
      const res = await Promise.race([
        d.fetch(d.url, { signal: ctl?.signal, credentials: "omit", referrerPolicy: "no-referrer", headers: { accept: "application/json" } }),
        timeout,
      ]);
      if (!res || !res.ok) return null;
      const usd = parseCoinGecko(await res.json());
      if (usd === null) return null;
      const p: GnotPrice = { usd, fetchedAt: d.now(), source: "CoinGecko" };
      memory = p;
      try {
        d.storage?.setItem(PRICE_STORAGE_KEY, JSON.stringify(p));
      } catch {
        /* storage full or blocked: memory cache still works */
      }
      return p;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
  })();
  return inflight;
}

/** A price set by hand (VITE_GNOT_USD), or null if unset or not a sane number. */
export function manualPrice(raw: string | undefined, now: number): GnotPrice | null {
  if (!raw || raw.trim() === "") return null;
  const v = Number(raw.trim());
  return saneUsd(v) ? { usd: v, fetchedAt: now, source: "set by hand" } : null;
}
