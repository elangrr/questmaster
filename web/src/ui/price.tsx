// The dollar hint in the UI. The price loads after first paint and never
// blocks anything; while it loads, block-style figures keep their space, and
// if it fails they disappear quietly.

import { useEffect, useSyncExternalStore } from "react";
import { config } from "../config";
import { COINGECKO_URL, formatPrice, formatUsd, loadPrice, manualPrice, PRICE_TIMEOUT_MS, type GnotPrice } from "../lib/price";

type PriceState = { status: "loading" } | { status: "ok"; price: GnotPrice } | { status: "off" };

let state: PriceState = { status: "loading" };
let started = false;
const listeners = new Set<() => void>();

function set(s: PriceState) {
  state = s;
  listeners.forEach((l) => l());
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function start() {
  if (started) return;
  started = true;
  const manual = manualPrice(config.gnotUsdManual, Date.now());
  if (manual) return set({ status: "ok", price: manual });
  if (config.gnotUsdSource !== "coingecko" || typeof fetch === "undefined") return set({ status: "off" });
  void loadPrice({ fetch: fetch.bind(globalThis), now: Date.now, storage: safeStorage(), url: COINGECKO_URL, timeoutMs: PRICE_TIMEOUT_MS }).then((p) =>
    set(p ? { status: "ok", price: p } : { status: "off" }),
  );
}

export function usePrice(): PriceState {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
  useEffect(() => {
    // After paint, so the request never delays the first render.
    const t = setTimeout(start, 0);
    return () => clearTimeout(t);
  }, []);
  return s;
}

function when(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function priceNote(p: GnotPrice): string {
  const from = p.source === "set by hand" ? "set by hand" : `${p.source}, fetched ${when(p.fetchedAt)}`;
  return `At the current mainnet GNOT price (${formatPrice(p.usd)} per GNOT, ${from}). Test GNOT has no real value.`;
}

/**
 * "≈ $0.25" after a GNOT amount. `block` puts it on its own line and keeps
 * that line's height while the price loads (no layout shift).
 */
export function Usd({ ugnot, block = false, paren = false }: { ugnot: bigint | null; block?: boolean; paren?: boolean }) {
  const s = usePrice();
  if (s.status === "off" || ugnot === null) return null;
  if (s.status === "loading") return block ? <span className="usd usd-block usd-pending" aria-hidden="true">&nbsp;</span> : null;
  const text = formatUsd(ugnot, s.price.usd);
  if (!text) return null;
  const note = priceNote(s.price);
  return (
    <span className={block ? "usd usd-block" : "usd"} title={note} data-usd>
      {!block && !paren && <span aria-hidden="true"> · </span>}
      {paren ? ` (${text})` : text}
      <span className="sr-only"> (approximate, at the mainnet GNOT price)</span>
    </span>
  );
}

/** One unobtrusive line for the footer, with the price used and when. */
export function PriceFootnote() {
  const s = usePrice();
  if (s.status !== "ok") return null;
  return <p className="muted small price-note" data-price-note>Dollar figures are approximate. {priceNote(s.price)}</p>;
}
