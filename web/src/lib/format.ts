// Amounts and block/time conversions. Integer maths only (bigint for ugnot).

import { rules } from "../config";

/** ugnot -> "1.25" GNOT (up to 6 decimals, no trailing zeros). */
export function gnot(ugnot: bigint): string {
  const neg = ugnot < 0n;
  const v = neg ? -ugnot : ugnot;
  const whole = v / 1_000_000n;
  const frac = v % 1_000_000n;
  let s = whole.toString();
  if (frac !== 0n) s += "." + frac.toString().padStart(6, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + s;
}

/**
 * "1.25" GNOT -> ugnot. Accepts digits with at most 6 decimals; returns null
 * for anything else (no floats, no exponents, no signs).
 */
export function parseGnot(input: string): bigint | null {
  const s = input.trim();
  const m = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) return null;
  return BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? "").padEnd(6, "0") || "0");
}

/** 1234567 -> "1,234,567". */
export function thousands(n: bigint | number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Blocks -> "about 3 days" (same wording and rounding as the realm's pages). */
export function approx(blocks: bigint | number): string {
  const b = BigInt(blocks);
  if (b <= 0n) return "now";
  const secs = (b * BigInt(rules.blockMillis)) / 1000n;
  if (secs >= 2n * 86400n) return `about ${(secs + 43200n) / 86400n} days`;
  if (secs >= 2n * 3600n) return `about ${(secs + 1800n) / 3600n} hours`;
  if (secs >= 120n) return `about ${(secs + 30n) / 60n} minutes`;
  return "about a minute";
}

/** Time left until a deadline block, seen from height h. */
export function timeLeft(deadline: bigint, h: bigint): string {
  if (h > deadline) return "passed";
  return approx(deadline - h + 1n) + " left";
}

export type WindowUnit = "hours" | "days";

/** A work window in hours or days -> blocks, at the approximate block time. */
export function windowToBlocks(amount: number, unit: WindowUnit): number {
  const secs = amount * (unit === "days" ? 86400 : 3600);
  return Math.round((secs * 1000) / rules.blockMillis);
}

/** Short form of an address for tables: g1jg8mtu…sqf5. */
export function shortAddr(a: string): string {
  return a.length > 14 ? a.slice(0, 8) + "…" + a.slice(-4) : a;
}
