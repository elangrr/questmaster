// Client-side checks with the same limits as p/escrow, so a user sees a
// problem before paying a fee. The chain checks again; these only help.
// Lengths count Unicode characters (code points), like the escrow's
// utf8.RuneCountInString.

import { rules } from "../config";
import { parseGnot } from "./format";

const runes = (s: string) => Array.from(s).length;

// unicode.IsControl (C0, DEL, C1) plus the line and paragraph separators,
// exactly what escrow.ValidateTitle refuses.
const TITLE_FORBIDDEN = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]", "u");
const LONE_SURROGATE = new RegExp("[\\ud800-\\udbff](?![\\udc00-\\udfff])|(?<![\\ud800-\\udbff])[\\udc00-\\udfff]");

export type Check = string | null; // null = fine, else the message to show

export function checkTitle(s: string): Check {
  if (LONE_SURROGATE.test(s)) return "The title contains a broken character.";
  if (s.trim() === "") return "Give the quest a title.";
  if (runes(s) > rules.maxTitleLen) return `The title is too long: ${runes(s)} of ${rules.maxTitleLen} characters.`;
  if (TITLE_FORBIDDEN.test(s)) return "The title must be one line, without tabs or other control characters.";
  return null;
}

export function checkDetails(s: string): Check {
  if (LONE_SURROGATE.test(s)) return "The details contain a broken character.";
  if (runes(s) > rules.maxDetailsLen) return `The details are too long: ${runes(s)} of ${rules.maxDetailsLen} characters.`;
  return null;
}

export function checkLink(s: string): Check {
  if (s === "") return "Paste the link to your work.";
  if (LONE_SURROGATE.test(s)) return "The link contains a broken character.";
  if (runes(s) > rules.maxLinkLen) return `The link is too long: ${runes(s)} of ${rules.maxLinkLen} characters.`;
  if (!s.startsWith("https://") || s.length === "https://".length) return "The link must start with https://";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c <= 0x20 || c === 0x7f) return "The link must not contain spaces or control characters.";
  }
  return null;
}

export function checkReason(s: string): Check {
  if (LONE_SURROGATE.test(s)) return "The reason contains a broken character.";
  if (s.trim() === "") return "Say why you reject the work.";
  if (runes(s) > rules.maxReasonLen) return `The reason is too long: ${runes(s)} of ${rules.maxReasonLen} characters.`;
  return null;
}

export function checkWorkBlocks(blocks: number): Check {
  if (!Number.isInteger(blocks)) return "Choose a whole work window.";
  if (blocks < rules.minWorkBlocks) return `The work window is too short (at least ${rules.minWorkBlocks.toLocaleString("en")} blocks, about 1 hour).`;
  if (blocks > rules.maxWorkBlocks) return `The work window is too long (at most ${rules.maxWorkBlocks.toLocaleString("en")} blocks, about 89 days).`;
  return null;
}

/** Reward in GNOT as typed -> ugnot, or a message. */
export function checkReward(input: string): { ugnot: bigint | null; error: Check } {
  const ugnot = parseGnot(input);
  if (ugnot === null) return { ugnot: null, error: "Enter the reward in GNOT, for example 5 or 2.5 (up to 6 decimals)." };
  if (ugnot < rules.minRewardUgnot) return { ugnot, error: "The reward must be at least 1 GNOT." };
  return { ugnot, error: null };
}
