import { describe, expect, it } from "vitest";
import { checkDetails, checkLink, checkReason, checkReward, checkTitle, checkWorkBlocks } from "./validate";

describe("same limits as p/escrow", () => {
  it("title: one line, 1 to 80 characters (not bytes)", () => {
    expect(checkTitle("Fix a typo")).toBeNull();
    expect(checkTitle("é".repeat(80))).toBeNull(); // 80 characters, 160 bytes
    expect(checkTitle("a".repeat(81))).toMatch(/too long/);
    expect(checkTitle("   ")).toMatch(/title/);
    for (const c of ["\n", "\t", "\r", "\u0000", "\u007f", "\u0085", " ", " "]) expect(checkTitle(`a${c}b`)).toMatch(/one line/);
    expect(checkTitle('Fix | table [x](y) "q" ünï 日本')).toBeNull();
  });
  it("details: up to 1000 characters, newlines allowed", () => {
    expect(checkDetails("")).toBeNull();
    expect(checkDetails("a\nb\tc")).toBeNull();
    expect(checkDetails("a".repeat(1000))).toBeNull();
    expect(checkDetails("a".repeat(1001))).toMatch(/too long/);
  });
  it("link: https only, no spaces or control characters, up to 300", () => {
    expect(checkLink("https://example.com/pr/1")).toBeNull();
    expect(checkLink("https://" + "a".repeat(292))).toBeNull();
    expect(checkLink("https://" + "a".repeat(293))).toMatch(/too long/);
    for (const bad of ["http://x.io", "HTTPS://x.io", "ftp://x", "x.io", "https://", " https://x.io", "javascript:alert(1)"]) expect(checkLink(bad)).not.toBeNull();
    for (const bad of ["https://a b", "https://a\nb", "https://a\u007f"]) expect(checkLink(bad)).toMatch(/spaces or control/);
    expect(checkLink("")).toMatch(/Paste/);
  });
  it("reason: not blank, up to 300", () => {
    expect(checkReason("Missing tests\nsee line 2")).toBeNull();
    expect(checkReason(" \t")).toMatch(/why/);
    expect(checkReason("r".repeat(301))).toMatch(/too long/);
  });
  it("work window: 1,000 to 2,200,000 blocks", () => {
    expect(checkWorkBlocks(1000)).toBeNull();
    expect(checkWorkBlocks(2_200_000)).toBeNull();
    expect(checkWorkBlocks(999)).toMatch(/short/);
    expect(checkWorkBlocks(2_200_001)).toMatch(/long/);
    expect(checkWorkBlocks(1.5)).not.toBeNull();
  });
  it("reward: at least 1 GNOT, up to 6 decimals", () => {
    expect(checkReward("1")).toEqual({ ugnot: 1_000_000n, error: null });
    expect(checkReward("0.999999").error).toMatch(/at least 1/);
    expect(checkReward("1.0000001").error).toMatch(/6 decimals/);
    expect(checkReward("abc").ugnot).toBeNull();
  });
});
