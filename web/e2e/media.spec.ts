// Videos and Lighthouse numbers for reviews. Skipped unless QM_MEDIA names an
// output folder:  QM_MEDIA=/some/folder node e2e/run-e2e.mjs e2e/media.spec.ts
// The price request is answered locally (videos) or blocked (Lighthouse), so
// nothing leaves the machine except the npx download of Lighthouse itself.
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const OUT = process.env.QM_MEDIA ?? "";
const APP = process.env.QM_APP_URL!;
const BUILDER = "g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj";
test.skip(!OUT, "set QM_MEDIA to record videos and run Lighthouse");
test.describe.configure({ mode: "serial" });

async function record(browser: Browser, name: string, run: (page: Page) => Promise<void>, init?: (page: Page) => Promise<void>) {
  mkdirSync(join(OUT, "videos"), { recursive: true });
  const size = { width: 1280, height: 800 };
  const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: join(OUT, "videos", "tmp"), size } });
  await ctx.route("https://api.coingecko.com/**", (r) => r.fulfill({ contentType: "application/json", body: '{"gno-land":{"usd":0.05}}' }));
  const page = await ctx.newPage();
  if (init) await init(page);
  await run(page);
  const video = page.video()!;
  await ctx.close();
  renameSync(await video.path(), join(OUT, "videos", `${name}.webm`));
}

test("video: the board loading", async ({ browser }) => {
  await record(browser, "board-loading", async (page) => {
    await page.goto(`${APP}#/`);
    await expect(page.locator("table.quests tbody tr")).toHaveCount(20);
    await page.waitForTimeout(2500);
  });
});

test("video: the hero diagram (one full loop)", async ({ browser }) => {
  await record(browser, "hero-diagram", async (page) => {
    await page.goto(`${APP}#/`);
    await page.locator("[data-testid=quest-flow]").waitFor();
    await page.waitForTimeout(10500);
  });
});

test("video: opening a quest", async ({ browser }) => {
  await record(browser, "open-quest", async (page) => {
    await page.goto(`${APP}#/`);
    await expect(page.locator("table.quests tbody tr")).toHaveCount(20);
    await page.waitForTimeout(1200);
    await page.getByRole("link", { name: "Older →" }).click();
    await page.waitForTimeout(1000);
    await page.goto(`${APP}#/quest/4`);
    await page.locator(".stepper").waitFor();
    await page.waitForTimeout(2500);
  });
});

test("video: a mocked-wallet transaction from click to success", async ({ browser }) => {
  await record(
    browser,
    "wallet-transaction",
    async (page) => {
      await page.goto(`${APP}#/quest/31`);
      const claim = page.locator(".action", { hasText: "Take this quest" });
      await page.waitForTimeout(800);
      await claim.getByRole("button", { name: "Connect wallet" }).click();
      await page.getByRole("button", { name: "Switch to dev" }).click();
      await page.waitForTimeout(600);
      await claim.getByRole("button", { name: "Do this" }).click();
      await page.waitForTimeout(800);
      await claim.getByRole("button", { name: "Take this quest" }).click();
      await page.waitForTimeout(1800); // "waiting for your wallet"
      await page.evaluate(() => (window as any).__approve());
      await expect(page.locator(".ok")).toBeVisible();
      await page.waitForTimeout(2500);
    },
    (page) =>
      page.addInitScript(([builder]) => {
        let chainId = "test5";
        const ok = (type: string, data: any = {}) => ({ code: 0, status: "success", type, message: "", data });
        (window as any).adena = {
          AddEstablish: async () => ok("CONNECTION_SUCCESS"),
          GetAccount: async () => ok("GET_ACCOUNT", { address: builder, chainId }),
          SwitchNetwork: async (id: string) => ((chainId = id), ok("SWITCH_NETWORK_SUCCESS", { chainId: id })),
          AddNetwork: async () => ok("ADD_NETWORK_SUCCESS"),
          DoContract: () => new Promise((resolve) => ((window as any).__approve = () => resolve(ok("TRANSACTION_SENT", { hash: "ABC123hash=", height: "1" })))),
          On: () => true,
        };
      }, [BUILDER]),
  );
});

test("lighthouse: board and a quest page, phone profile", async () => {
  test.setTimeout(240_000);
  const run = promisify(execFile);
  mkdirSync(OUT, { recursive: true });
  const results: Record<string, Record<string, number>> = {};
  for (const [name, route] of [["board", "/"], ["quest-4", "/quest/4"]] as const) {
    const file = join(OUT, `lighthouse-${name}.json`);
    await run(
      "npx",
      [
        "-y",
        "lighthouse@12.8.2",
        `${APP}#${route}`,
        "--only-categories=performance,accessibility,best-practices",
        "--blocked-url-patterns=*api.coingecko.com*",
        "--chrome-flags=--headless=new --no-sandbox",
        "--output=json",
        `--output-path=${file}`,
        "--quiet",
      ],
      { env: { ...process.env, CHROME_PATH: chromium.executablePath() }, maxBuffer: 64 << 20 },
    );
    const lhr = JSON.parse(readFileSync(file, "utf8"));
    results[name] = Object.fromEntries(Object.entries(lhr.categories).map(([k, v]: [string, any]) => [k, Math.round(v.score * 100)]));
    results[name].lcp_ms = Math.round(lhr.audits["largest-contentful-paint"].numericValue);
    results[name].cls_x1000 = Math.round(lhr.audits["cumulative-layout-shift"].numericValue * 1000);
    results[name].tbt_ms = Math.round(lhr.audits["total-blocking-time"].numericValue);
  }
  console.log("LIGHTHOUSE " + JSON.stringify(results));
});
