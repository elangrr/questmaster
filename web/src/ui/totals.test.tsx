import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Totals } from "../lib/amino";
import { TotalsLine } from "./pages";

/** The sentence as a sighted reader sees it (drops screen-reader-only text). */
function visible(t: Partial<Totals>): string {
  const totals: Totals = { quests: 0n, openQuests: 0, posted: 0n, locked: 0n, paid: 0n, refunded: 0n, paidQuests: 0, ...t };
  const html = renderToStaticMarkup(<TotalsLine totals={totals} />);
  return html
    .replace(/<span class="sr-only">[^<]*<\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'");
}

describe("TotalsLine", () => {
  it("reads as one sentence with plural counts", () => {
    expect(visible({ openQuests: 25, locked: 38_234_567n, paid: 3_500_000n, paidQuests: 2 })).toBe(
      "25 open quests · 38.23 GNOT locked · 3.5 GNOT paid out on 2 quests",
    );
  });
  it("uses the singular for one", () => {
    expect(visible({ openQuests: 1, locked: 1_000_000n, paid: 2_000_000n, paidQuests: 1 })).toBe("1 open quest · 1 GNOT locked · 2 GNOT paid out on 1 quest");
  });
  it("reads naturally on an empty board", () => {
    expect(visible({})).toBe("No open quests · nothing paid out yet");
  });
  it("leaves out locked when nothing is locked", () => {
    expect(visible({ openQuests: 0, paid: 5_000_000n, paidQuests: 3 })).toBe("No open quests · 5 GNOT paid out on 3 quests");
  });
  it("rounds to 2 decimals for display and keeps the exact amount for screen readers", () => {
    const totals: Totals = { quests: 1n, openQuests: 1, posted: 0n, locked: 1_234_567n, paid: 0n, refunded: 0n, paidQuests: 0 };
    const html = renderToStaticMarkup(<TotalsLine totals={totals} />);
    expect(html).toContain('title="1.234567 GNOT"');
    expect(html).toContain('<span aria-hidden="true">1.23</span><span class="sr-only">1.234567</span>');
  });
});
