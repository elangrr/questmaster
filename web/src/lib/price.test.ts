import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COINGECKO_URL,
  formatPrice,
  formatUsd,
  loadPrice,
  manualPrice,
  parseCoinGecko,
  PRICE_STORAGE_KEY,
  PRICE_TTL_MS,
  resetPriceCache,
  type PriceDeps,
} from "./price";

const PRICE = 0.0508;

describe("formatUsd", () => {
  it("formats small values", () => {
    expect(formatUsd(0n, PRICE)).toBe("≈ $0");
    expect(formatUsd(1n, PRICE)).toBe("< $0.01"); // 0.000001 GNOT
    expect(formatUsd(100_000n, PRICE)).toBe("< $0.01"); // 0.1 GNOT = $0.00508
    expect(formatUsd(1_000_000n, PRICE)).toBe("≈ $0.05");
    expect(formatUsd(5_000_000n, PRICE)).toBe("≈ $0.25");
    expect(formatUsd(5_000_000n, 0.124)).toBe("≈ $0.62");
  });
  it("formats large values", () => {
    expect(formatUsd(1_000_000_000n, PRICE)).toBe("≈ $50.80"); // 1,000 GNOT
    expect(formatUsd(100_000_000_000n, PRICE)).toBe("≈ $5,080"); // 100,000 GNOT
    expect(formatUsd(100_000_000_000_000n, PRICE)).toBe("≈ $5.1M"); // 100M GNOT
    // Beyond float-safe ugnot: still sane, no precision blow-up.
    expect(formatUsd(9_007_199_254_740_993_000n, 1)).toBe("≈ $9T");
  });
  it("returns null without a usable price", () => {
    expect(formatUsd(5_000_000n, null)).toBeNull();
    expect(formatUsd(5_000_000n, undefined)).toBeNull();
    expect(formatUsd(5_000_000n, 0)).toBeNull();
    expect(formatUsd(5_000_000n, -1)).toBeNull();
    expect(formatUsd(5_000_000n, Number.NaN)).toBeNull();
    expect(formatUsd(5_000_000n, Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatUsd(-1n, PRICE)).toBeNull();
  });
  it("formats the price itself", () => {
    expect(formatPrice(0.050782)).toBe("$0.0508");
    expect(formatPrice(1.234)).toBe("$1.23");
  });
});

describe("parseCoinGecko / manualPrice", () => {
  it("reads only the gno-land coin and rejects odd bodies", () => {
    expect(parseCoinGecko({ "gno-land": { usd: 0.0507 } })).toBe(0.0507);
    expect(parseCoinGecko({ gnosis: { usd: 120 } })).toBeNull(); // a different coin
    expect(parseCoinGecko({ "gno-land": { usd: "0.05" } })).toBeNull();
    expect(parseCoinGecko({ "gno-land": { usd: 0 } })).toBeNull();
    expect(parseCoinGecko({ "gno-land": { usd: 1e9 } })).toBeNull();
    expect(parseCoinGecko({ "gno-land": {} })).toBeNull();
    expect(parseCoinGecko(null)).toBeNull();
    expect(parseCoinGecko("<html>")).toBeNull();
  });
  it("accepts a hand-set price only when it is a sane number", () => {
    expect(manualPrice("0.12", 1)).toEqual({ usd: 0.12, fetchedAt: 1, source: "set by hand" });
    expect(manualPrice("", 1)).toBeNull();
    expect(manualPrice(undefined, 1)).toBeNull();
    expect(manualPrice("abc", 1)).toBeNull();
    expect(manualPrice("-3", 1)).toBeNull();
  });
});

function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("loadPrice", () => {
  let now = 1_000_000;
  let storage: ReturnType<typeof memStorage>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  const deps = (fetchImpl: PriceDeps["fetch"], extra: Partial<PriceDeps> = {}): PriceDeps => ({
    fetch: fetchImpl,
    now: () => now,
    storage,
    url: COINGECKO_URL,
    timeoutMs: 50,
    ...extra,
  });

  beforeEach(() => {
    resetPriceCache();
    now = 1_000_000;
    storage = memStorage();
    errSpy = vi.spyOn(console, "error");
  });
  afterEach(() => {
    expect(errSpy).not.toHaveBeenCalled(); // failures are silent
    errSpy.mockRestore();
  });

  it("fetches once, with no credentials, no referrer and nothing about the user", async () => {
    const f = vi.fn(async () => ok({ "gno-land": { usd: PRICE } }));
    const p = await loadPrice(deps(f as unknown as typeof fetch));
    expect(p).toEqual({ usd: PRICE, fetchedAt: now, source: "CoinGecko" });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.coingecko.com/api/v3/simple/price?ids=gno-land&vs_currencies=usd");
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(url).not.toMatch(/g1[0-9a-z]{38}/);
  });

  it("serves from memory, then from localStorage, within the TTL; refetches after", async () => {
    const f = vi.fn(async () => ok({ "gno-land": { usd: PRICE } }));
    await loadPrice(deps(f as unknown as typeof fetch));
    now += PRICE_TTL_MS - 1;
    await loadPrice(deps(f as unknown as typeof fetch));
    expect(f).toHaveBeenCalledTimes(1);

    // A new page load: memory is gone, localStorage still has it.
    resetPriceCache();
    const p = await loadPrice(deps(f as unknown as typeof fetch));
    expect(p?.usd).toBe(PRICE);
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.m.get(PRICE_STORAGE_KEY)!).usd).toBe(PRICE);

    now += 2;
    await loadPrice(deps(f as unknown as typeof fetch));
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("shares one request between callers", async () => {
    const f = vi.fn(async () => ok({ "gno-land": { usd: PRICE } }));
    const [a, b] = await Promise.all([loadPrice(deps(f as unknown as typeof fetch)), loadPrice(deps(f as unknown as typeof fetch))]);
    expect(a).toEqual(b);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("ignores a broken localStorage entry", async () => {
    storage.setItem(PRICE_STORAGE_KEY, "{not json");
    const f = vi.fn(async () => ok({ "gno-land": { usd: PRICE } }));
    expect((await loadPrice(deps(f as unknown as typeof fetch)))?.usd).toBe(PRICE);
  });

  it("returns null quietly on a network error, an HTTP error or a bad body", async () => {
    expect(await loadPrice(deps((async () => Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch))).toBeNull();
    expect(await loadPrice(deps((async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch))).toBeNull();
    expect(await loadPrice(deps((async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch))).toBeNull();
    expect(await loadPrice(deps((async () => ok({ gnosis: { usd: 120 } })) as unknown as typeof fetch))).toBeNull();
    expect(storage.m.size).toBe(0); // nothing cached from failures
  });

  it("gives up after the timeout, even if the request never settles", async () => {
    let aborted = false;
    const hang = ((_u: string, init: RequestInit) =>
      new Promise<Response>(() => {
        init.signal?.addEventListener("abort", () => (aborted = true));
      })) as unknown as typeof fetch;
    const t0 = Date.now();
    expect(await loadPrice(deps(hang, { timeoutMs: 40 }))).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(aborted).toBe(true);
  });

  it("works with no storage at all", async () => {
    const f = vi.fn(async () => ok({ "gno-land": { usd: PRICE } }));
    expect((await loadPrice(deps(f as unknown as typeof fetch, { storage: null })))?.usd).toBe(PRICE);
  });
});
