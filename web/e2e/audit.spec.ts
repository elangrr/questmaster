// Full size audit, on request: QM_AUDIT=<folder> node e2e/run-e2e.mjs e2e/audit.spec.ts
// Writes samples.json and layout.json; summarize with node e2e/audit-report.mjs <folder>.
import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collect, layout, PAGES, type Sample } from "./audit";

const OUT = process.env.QM_AUDIT ?? "";
const APP = process.env.QM_APP_URL!;
test.skip(!OUT, "set QM_AUDIT to run the size audit");

const WIDTHS = [360, 390, 768, 1024, 1280];

test("size audit: every page, every width, light and dark", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  const samples: Sample[] = [];
  const lay: Record<string, unknown>[] = [];
  for (const theme of ["light", "dark"] as const) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: "reduce" });
      await ctx.route("https://api.coingecko.com/**", (r) => r.fulfill({ contentType: "application/json", body: '{"gno-land":{"usd":0.05}}' }));
      const page = await ctx.newPage();
      for (const p of PAGES) {
        await page.goto(`${APP}#${p.route}`);
        await page.locator("main h1, main .state-box").first().waitFor();
        await page.waitForLoadState("networkidle");
        if (p.prep) await p.prep(page);
        await page.waitForTimeout(250);
        samples.push(...(await collect(page, p.name, width, theme)));
        lay.push({ page: p.name, width, theme, ...(await layout(page)) });
      }
      await ctx.close();
    }
  }
  writeFileSync(join(OUT, "samples.json"), JSON.stringify(samples));
  writeFileSync(join(OUT, "layout.json"), JSON.stringify(lay));
  console.log(`AUDIT ${samples.length} samples written`);
});
