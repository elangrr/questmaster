import { describe, expect, it } from "vitest";
import { approx, gnot, parseGnot, shortAddr, thousands, timeLeft, windowToBlocks } from "./format";

describe("gnot / parseGnot", () => {
  it("formats ugnot without floats", () => {
    expect(gnot(0n)).toBe("0");
    expect(gnot(1n)).toBe("0.000001");
    expect(gnot(1_000_000n)).toBe("1");
    expect(gnot(1_250_000n)).toBe("1.25");
    expect(gnot(1_234_567n)).toBe("1.234567");
    expect(gnot(9_007_199_254_740_993_000n)).toBe("9007199254740.993");
    expect(gnot(-2_500_000n)).toBe("-2.5");
  });
  it("parses GNOT strictly", () => {
    expect(parseGnot("5")).toBe(5_000_000n);
    expect(parseGnot(" 2.5 ")).toBe(2_500_000n);
    expect(parseGnot("0.000001")).toBe(1n);
    expect(parseGnot("1.1234567")).toBeNull();
    for (const bad of ["", "1e6", "-1", "+1", "1,5", ".5", "5.", "abc", "0x10", "1 000"]) expect(parseGnot(bad)).toBeNull();
  });
});

describe("blocks and time", () => {
  it("matches the realm's wording", () => {
    expect(approx(0)).toBe("now");
    expect(approx(10)).toBe("about a minute");
    expect(approx(1_000)).toBe("about 58 minutes");
    expect(approx(20_000)).toBe("about 19 hours");
    expect(approx(172_800)).toBe("about 7 days");
    expect(approx(2_200_000)).toBe("about 89 days");
  });
  it("time left at, before and after a deadline", () => {
    expect(timeLeft(100n, 100n)).toBe("about a minute left");
    expect(timeLeft(100n, 101n)).toBe("passed");
    expect(timeLeft(1_100n, 100n)).toBe("about 58 minutes left");
  });
  it("hours and days to blocks at 3.5 s", () => {
    expect(windowToBlocks(1, "hours")).toBe(1029);
    expect(windowToBlocks(1, "days")).toBe(24686);
    expect(windowToBlocks(7, "days")).toBe(172800);
    expect(windowToBlocks(0.5, "hours")).toBe(514);
  });
  it("thousands and short addresses", () => {
    expect(thousands(1234567n)).toBe("1,234,567");
    expect(thousands(999)).toBe("999");
    expect(shortAddr("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5")).toBe("g1jg8mtu…sqf5");
  });
});
