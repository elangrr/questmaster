import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { HOSTILE_DETAILS, HOSTILE_REASON, HOSTILE_TITLE } from "./hostile.mjs";
import { BOX_ROLES, collect, HEIGHT_ROLES, layout, PAGES, TEXT_ROLES, type Sample } from "./audit";

const APP = process.env.QM_APP_URL!;
const REALM = process.env.QM_REALM!;
const SHOTS = "e2e/out/screenshots";
const POSTER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const BUILDER = "g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj";
const OTHER = "g1u7y667z64x2h7vc6fmpcprgey4ck233jaww9zq";
const NEWCOMER = "g1" + "q".repeat(38); // the realm has no quests for it

const open = (page: Page, route: string) => page.goto(`${APP}#${route}`);

// The one third-party request (the GNOT price) never reaches the internet in
// tests: it is answered here with a fixed price unless a test says otherwise.
const PRICE_HOST = "https://api.coingecko.com/";
const mockPrice = (ctx: BrowserContext, usd = 0.05) =>
  ctx.route(`${PRICE_HOST}**`, (route) => route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ "gno-land": { usd } }) }));
test.beforeEach(async ({ context }) => {
  await mockPrice(context);
});

test("served from a sub-path; header, network label and footer", async ({ page }) => {
  await open(page, "/");
  await expect(page.locator(".net")).toHaveText("Local dev chain · test GNOT");
  const foot = page.locator("footer");
  await expect(foot).toContainText("Built on gno.land");
  await expect(foot).toContainText("Not an official Gno.land product. Testnet only");
  await expect(foot.getByRole("link", { name: REALM })).toHaveAttribute("href", `http://127.0.0.1:38888${REALM.replace("gno.land", "")}`);
  await expect(foot.getByRole("link", { name: "Source" })).toHaveAttribute("href", "https://github.com/elangrr/questmaster");
  await expect(page.locator('meta[name="gnoconnect:chainid"]')).toHaveAttribute("content", "dev");
  await expect(page.locator('meta[name="gnoconnect:rpc"]')).toHaveAttribute("content", "http://127.0.0.1:36657");
});

test("board: totals, 20 open quests newest first, paging", async ({ page }) => {
  await open(page, "/");
  const totals = page.locator("p.totals");
  await expect(totals).toContainText("25 open quests");
  await expect(totals).toContainText("38.2338.234567 GNOT locked"); // shown 38.23; exact 38.234567 for screen readers
  await expect(totals).toContainText("3.53.5 GNOT paid out on 2 quests");
  await expect(totals.locator(".total-num").nth(1)).toHaveAttribute("title", "38.234567 GNOT");
  const rows = page.locator("table.quests tbody tr");
  await expect(rows).toHaveCount(20);
  await expect(rows.first()).toContainText("Small task 24");
  await expect(page.locator(".pager")).toContainText("Page 1 of 2");
  await page.getByRole("link", { name: "Older" }).click();
  await expect(page).toHaveURL(/#\/\?page=2$/);
  await expect(rows).toHaveCount(5);
  await expect(rows.last()).toContainText(HOSTILE_TITLE);
  await open(page, "/?page=3");
  await expect(page.locator(".state-box")).toContainText("This page is empty.");
});

test("hostile text stays text everywhere", async ({ page }) => {
  await open(page, "/quest/7");
  const main = page.locator("main");
  await expect(page.locator("h1.quest-title")).toHaveText(HOSTILE_TITLE);
  // No element was created from user text.
  await expect(main.locator("script, img, b, iframe")).toHaveCount(0);
  await expect(main.locator('a[href*="e.vil"]')).toHaveCount(0);
  const plains = main.locator(".plain");
  await expect(plains.nth(0)).toHaveText(HOSTILE_DETAILS);
  await expect(plains.nth(1)).toHaveText(HOSTILE_REASON);
  await expect(main).toContainText("Times rejected1");
  // the title in the list is a plain link with the exact text
  await open(page, "/?page=2");
  await expect(page.getByRole("link", { name: HOSTILE_TITLE })).toHaveAttribute("href", "#/quest/7");
});

test("every state shows the right facts and next steps", async ({ page }) => {
  await open(page, "/quest/1");
  await expect(page.locator(".badge")).toHaveText("Paid");
  await expect(page.locator("main")).toContainText("Nothing: this quest is finished and the builder was paid 2.5 GNOT · ≈ $0.13");

  await open(page, "/quest/2");
  await expect(page.locator(".badge")).toHaveText("Cancelled");

  await open(page, "/quest/3");
  await expect(page.locator(".badge")).toHaveText("In progress");
  await expect(page.locator("dl.facts")).toContainText("Work deadline");
  for (const label of ["Submit work", "Give the quest back", "Close quest", "Release the quest"]) await expect(page.locator(".action strong", { hasText: label })).toBeVisible();

  await open(page, "/quest/4");
  await expect(page.locator(".badge")).toHaveText("Waiting for review");
  await expect(page.locator("dl.facts")).toContainText("Review deadline");
  const link = page.locator("dl.facts a.mono");
  await expect(link).toHaveText("https://github.com/example/questmaster/pull/9");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");

  await open(page, "/quest/5");
  await expect(page.locator(".badge")).toHaveText("In progress · closing");
  await expect(page.locator(".callout")).toContainText("Closing.");
  await expect(page.locator(".action strong", { hasText: "Close quest" })).toHaveCount(0);

  await open(page, "/quest/6");
  await expect(page.locator(".badge")).toHaveText("Cancelled");
});

test("without a wallet, actions explain and offer gnokey and gnoweb", async ({ page }) => {
  await open(page, "/quest/31");
  const claim = page.locator(".action", { hasText: "Take this quest" });
  // No wallet: one bar holds the wallet button; each action keeps one quiet "Other ways to sign".
  const bar = page.locator("[data-signin-bar]");
  await expect(bar.getByRole("link", { name: "Get Adena" })).toHaveAttribute("href", "https://adena.app");
  await expect(claim.getByRole("button", { name: "Do this" })).toHaveCount(0);
  await expect(claim.getByRole("link", { name: "Get Adena" })).toHaveCount(0);
  await claim.getByRole("button", { name: "Other ways" }).click();
  await expect(claim).toContainText("install the Adena wallet");
  await expect(claim.locator("pre.cmd")).toContainText(`-pkgpath '${REALM}'`);
  await expect(claim.locator("pre.cmd")).toContainText("-func 'ClaimQuest'");
  await expect(claim.locator("pre.cmd")).toContainText("-args '31'");
  await expect(claim.getByRole("link", { name: "gnoweb form" })).toHaveAttribute("href", /\$help&func=ClaimQuest&id=31$/);
});

test("paid page, address pages, bad routes", async ({ page }) => {
  await open(page, "/paid");
  await expect(page.locator("table.quests tbody tr")).toHaveCount(2);
  await open(page, `/address/${BUILDER}?as=builder`);
  await expect(page.locator("table.quests tbody tr")).toHaveCount(7);
  await open(page, `/address/${POSTER}`);
  await expect(page.locator("table.quests tbody tr")).toHaveCount(7);
  await open(page, "/address/g1nope");
  await expect(page.locator("main")).toContainText("That is not a valid g1 address.");
  await open(page, "/quest/999");
  await expect(page.locator(".state-box")).toContainText("There is no quest with that number.");
  await open(page, "/quest/abc");
  await expect(page.locator(".state-box")).toContainText("There is no quest with that number.");
  await open(page, "/nothing-here");
  await expect(page.locator(".state-box")).toContainText("This page does not exist.");
});

test("not live yet: a parked package gets a clear message", async ({ page }) => {
  await page.route("http://127.0.0.1:36657/", async (route) => {
    const req = route.request().postDataJSON();
    const path = req?.params?.path;
    const base =
      path === "vm/qpkgmeta_json"
        ? { Data: btoa(JSON.stringify({ path: REALM, status: "inert", reason: "waiting for a package approver to enable it", pending: true })), Error: null, Log: "" }
        : { Data: null, Error: { "@type": "/vm.InvalidPkgPathError" }, Log: "package not found" };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { response: { ResponseBase: base } } }) });
  });
  await open(page, "/");
  await expect(page.locator(".state-box.waiting")).toContainText("waiting for the network's package approver");
  await expect(page.getByRole("link", { name: "Official approval status" })).toHaveAttribute("href", `https://gpas.onyx.testnets.gno.land/?path=${encodeURIComponent(REALM)}`);
});

test("post form validates before any fee", async ({ page }) => {
  await open(page, "/post");
  await expect(page.locator(".callout.warn")).toContainText("the builder is paid automatically");
  const btn = page.getByRole("button", { name: "Post and lock the reward" });
  await expect(page.locator("main")).toContainText("install the Adena wallet"); // no wallet here
  await page.getByLabel("Title").fill("x".repeat(81));
  await expect(page.locator("main")).toContainText("The title is too long: 81 of 80 characters.");
  await page.getByLabel("Reward (GNOT)").fill("0.5");
  await expect(page.locator("main")).toContainText("The reward must be at least 1 GNOT.");
  await page.getByLabel("Work window amount").fill("100");
  await expect(page.locator("main")).toContainText("The work window is too long");
  await expect(btn).toHaveCount(0); // hidden behind the install hint without Adena
  await page.locator("summary", { hasText: "No Adena?" }).click();
  await expect(page.locator("pre.cmd")).toContainText("-send '500000ugnot'");
});

test("with a mocked Adena: connect, wrong network, claim sends the exact message", async ({ page }) => {
  await page.addInitScript(([builder]) => {
    const calls: any[] = [];
    let chainId = "test5";
    (window as any).__calls = calls;
    const ok = (type: string, data: any = {}) => ({ code: 0, status: "success", type, message: "", data });
    (window as any).adena = {
      AddEstablish: async (n: string) => (calls.push(["AddEstablish", n]), ok("CONNECTION_SUCCESS")),
      GetAccount: async () => ok("GET_ACCOUNT", { address: builder, chainId }),
      SwitchNetwork: async (id: string) => (calls.push(["SwitchNetwork", id]), (chainId = id), ok("SWITCH_NETWORK_SUCCESS", { chainId: id })),
      AddNetwork: async (n: any) => (calls.push(["AddNetwork", n]), ok("ADD_NETWORK_SUCCESS")),
      // Holds until the test calls __approve(), like a person reading the Adena popup.
      DoContract: (p: any) =>
        new Promise((resolve) => {
          calls.push(["DoContract", p]);
          (window as any).__approve = () => resolve(ok("TRANSACTION_SENT", { hash: "ABC123hash=", height: "1" }));
        }),
      On: () => true,
    };
  }, [BUILDER]);
  await open(page, "/quest/31");
  // Not connected yet: one sign-in bar holds "Connect wallet"; the actions have no "Do this".
  const claim = page.locator(".action", { hasText: "Take this quest" });
  await expect(claim.getByRole("button", { name: "Do this" })).toHaveCount(0);
  await page.locator("[data-signin-bar]").getByRole("button", { name: "Connect wallet" }).click();
  // Wrong network: the header and the sign-in bar both offer the switch; use the header's.
  await expect(page.locator("[data-signin-bar]").getByRole("button", { name: "Switch to dev" })).toBeVisible();
  await page.locator("header").getByRole("button", { name: "Switch to dev" }).click();
  await expect(page.locator(".wallet-addr")).toHaveText("g1us8428…njlj");
  await claim.getByRole("button", { name: "Do this" }).click();
  await claim.getByRole("button", { name: "Take this quest" }).click();
  await expect(claim.locator(".txstep")).toHaveText(["Waiting for your wallet", "2Sent", "3Confirmed"]);
  await expect(claim.locator(".txstep.active")).toHaveCount(1);
  await page.evaluate(() => (window as any).__approve());
  await expect(page.locator(".ok")).toContainText("Sent: Take this quest. Transaction");
  await expect(page.locator(".ok")).toContainText("confirmed in block 1.");
  await expect(page.locator(".ok a")).toHaveAttribute("href", "https://gnoscan.io/transactions/details?txhash=ABC123hash%3D&chainId=dev");
  const calls = await page.evaluate(() => (window as any).__calls);
  expect(calls.find((c: any) => c[0] === "DoContract")[1]).toEqual({
    messages: [{ type: "/vm.m_call", value: { caller: BUILDER, send: "", pkg_path: REALM, func: "ClaimQuest", args: ["31"] } }],
    memo: "",
  });
  expect(calls.map((c: any) => c[0])).toEqual(["AddEstablish", "SwitchNetwork", "DoContract"]);
});

test("a node that refuses queries (HTTP 403) gets a clear message", async ({ page }) => {
  await page.route("http://127.0.0.1:36657/", (route) => route.fulfill({ status: 403, body: "forbidden" }));
  await open(page, "/");
  await expect(page.locator(".state-box.error")).toContainText("does not allow these read queries (HTTP 403)");
});

test("dollar hint: shown next to GNOT, live in the post form, never in a transaction", async ({ page, context }) => {
  const seen: { url: string; referer?: string; cookie?: string }[] = [];
  const hosts = new Set<string>();
  page.on("request", (r) => {
    hosts.add(new URL(r.url()).origin);
    if (r.url().startsWith(PRICE_HOST)) seen.push({ url: r.url(), referer: r.headers()["referer"], cookie: r.headers()["cookie"] });
  });
  await context.unroute(`${PRICE_HOST}**`);
  await mockPrice(context, 0.124);
  await open(page, "/");
  await expect(page.locator("p.totals")).toContainText("GNOT locked (≈ $4.74)"); // 38.234567 × 0.124
  await expect(page.locator("table.quests tbody tr").first().locator("td.num [data-usd]")).toHaveText(/^≈ \$\d+\.\d\d/);
  await expect(page.locator("[data-usd]").first()).toHaveAttribute("title", /mainnet GNOT price \(\$0\.124 per GNOT, CoinGecko, fetched .+\)\. Test GNOT has no real value\./);
  await expect(page.locator("footer [data-price-note]")).toContainText("Dollar figures are approximate");

  await open(page, "/post");
  await page.getByLabel("Reward (GNOT)").fill("5");
  const cost = page.locator(".cost");
  await expect(cost).toContainText("The reward: 5 GNOT · ≈ $0.62");
  await page.getByLabel("Reward (GNOT)").fill("12.5");
  await expect(cost).toContainText("12.5 GNOT · ≈ $1.55");
  await page.locator("summary", { hasText: "No Adena?" }).click();
  await expect(page.locator("pre.cmd")).toContainText("-send '12500000ugnot'"); // exact ugnot, no dollar maths

  // One price request for the whole visit (cached), with no address, cookie or referrer.
  expect(seen).toHaveLength(1);
  expect(seen[0].url).toBe("https://api.coingecko.com/api/v3/simple/price?ids=gno-land&vs_currencies=usd");
  expect(seen[0].referer).toBeUndefined();
  expect(seen[0].cookie).toBeUndefined();
  // Nothing else leaves the page except chain queries.
  const appOrigin = new URL(APP).origin;
  expect([...hosts].filter((h) => h !== appOrigin && h !== "http://127.0.0.1:36657" && h !== "https://api.coingecko.com")).toEqual([]);
});

for (const [name, handler] of [
  ["fails", (route: any) => route.abort("failed")],
  ["times out", () => new Promise(() => {})],
  ["returns a server error", (route: any) => route.fulfill({ status: 429, body: "rate limited" })],
] as const) {
  test(`dollar hint: hidden, without errors, when the price request ${name}`, async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await context.unroute(`${PRICE_HOST}**`);
    await context.route(`${PRICE_HOST}**`, handler as any);
    await open(page, "/");
    await expect(page.locator("p.totals")).toContainText("GNOT locked");
    await expect(page.locator("table.quests tbody tr")).toHaveCount(20); // the board renders regardless
    await page.waitForTimeout(4200); // past the 3.5 s timeout
    await expect(page.locator("[data-usd]")).toHaveCount(0);
    await expect(page.locator("footer [data-price-note]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("reduced motion: no animation keeps running anywhere", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  await mockPrice(ctx);
  const page = await ctx.newPage();
  for (const route of ["/", "/quest/4", "/how", "/post", "/agents"]) {
    await page.goto(`${APP}#${route}`);
    await page.locator("main h1").first().waitFor();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.playState === "running").map((a) => (a as CSSAnimation).animationName ?? "?"),
    );
    expect(running, `running animations on ${route}`).toEqual([]);
  }
  // Without reduced motion the hero diagram does animate (so the check above means something).
  const ctx2 = await browser.newContext();
  await mockPrice(ctx2);
  const p2 = await ctx2.newPage();
  await p2.goto(`${APP}#/`);
  await p2.locator("[data-testid=quest-flow]").waitFor();
  expect(await p2.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBeGreaterThan(0);
  await ctx.close();
  await ctx2.close();
});

test("hero diagram causes no layout shift while the board loads", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as any[]) {
        if (e.hadRecentInput) continue;
        (window as any).__shifts.push({ value: e.value, sources: (e.sources ?? []).map((s: any) => s.node?.className?.baseVal ?? s.node?.className ?? s.node?.nodeName ?? "") });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await open(page, "/");
  const hero = page.locator(".hero-visual");
  await hero.waitFor();
  // Layout box (offset*), not the painted box: the one-time entrance transform is not a shift.
  const box = () => hero.evaluate((el: HTMLElement) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));
  const before = await box();
  await expect(page.locator("table.quests tbody tr")).toHaveCount(20);
  await page.waitForTimeout(1200); // count-ups and the price hint have settled
  expect(await box()).toEqual(before);
  const shifts = await page.evaluate(() => (window as any).__shifts as { value: number; sources: string[] }[]);
  const heroShifts = shifts.filter((s) => s.sources.some((c) => /hero|flow/.test(String(c))));
  expect(heroShifts).toEqual([]);
  const cls = shifts.reduce((a, s) => a + s.value, 0);
  expect(cls).toBeLessThan(0.1); // "good" CLS for the whole page
  console.log(`board CLS ${cls.toFixed(4)} from ${shifts.length} shifts`);
});

test("AI agents page: config and prompts with copy buttons", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "/agents");
  await expect(page.locator("main h1")).toHaveText("For AI agents");
  await expect(page.locator("pre.cmd").first()).toHaveText("claude mcp add gnomcp --scope user -- ~/.local/bin/gnomcp");
  await expect(page.locator("pre.cmd").nth(1)).toContainText('"gnomcp": { "command": "gnomcp", "args": [] }');
  await expect(page.locator(".prompt")).toHaveCount(3);
  await expect(page.locator(".prompt").first()).toContainText(REALM);
  await page.getByRole("button", { name: "Copy: prompt 1" }).click();
  await expect(page.getByRole("button", { name: "Copied: prompt 1" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`render ${REALM}`);
  await expect(page.getByRole("link", { name: "AI agents" })).toHaveAttribute("aria-current", "page");
});

test("share card, canonical URL and favicon", async ({ page, request }) => {
  await open(page, "/");
  const meta = (sel: string) => page.locator(sel).getAttribute("content");
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe("https://elangrr.github.io/questmaster/");
  expect(await meta('meta[property="og:url"]')).toBe("https://elangrr.github.io/questmaster/");
  expect(await meta('meta[property="og:image"]')).toBe("https://elangrr.github.io/questmaster/og.png");
  expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
  const icon = await page.locator('link[rel="icon"]').getAttribute("href");
  expect((await request.get(new URL(icon!, APP).href)).headers()["content-type"]).toContain("svg");
  const og = await request.get(new URL("og.png", APP).href);
  expect(og.status()).toBe(200);
});

test("quest page: stepper, deadline bar, reject count", async ({ page }) => {
  await open(page, "/quest/4");
  await expect(page.locator(".stepper .step")).toHaveCount(4);
  await expect(page.locator('.stepper [aria-current="step"]')).toContainText("Submitted");
  const bar = page.locator(".deadline [role=progressbar]");
  await expect(bar).toHaveAttribute("aria-label", /^Review deadline: about .+ left$/);
  await open(page, "/quest/7");
  await expect(page.locator(".reject-count")).toHaveText("Rejected 1 time");
  await open(page, "/quest/2");
  await expect(page.locator(".stepper .step.exit")).toContainText("Refunded");
});

test("track record: summaries on the quest page, caution before claiming", async ({ page }) => {
  // Quest 31 is posted by OTHER, who rejected work 3 times and took two rewards back.
  await open(page, "/quest/31");
  const posterLine = page.locator('[data-record="poster"]');
  await expect(posterLine).toContainText("Paid 0 of 2 finished quests · rejected work 3 times");
  await expect(posterLine.getByRole("link", { name: "Record" })).toHaveAttribute("href", `#/address/${OTHER}`);
  const claim = page.locator(".action", { hasText: "Take this quest" });
  await claim.getByRole("button", { name: "Other ways" }).click();
  await expect(claim.locator('[data-poster-note="caution"]')).toHaveText(
    /^This poster has rejected work 3 times on 2 quests, and 2 quests were refunded to them after a rejection\. A poster can turn down work/,
  );

  // Quest 34: a clean poster (paid, never rejected) and a builder with history.
  await open(page, "/quest/34");
  const clean = page.locator('[data-record="poster"]');
  await expect(clean).toContainText("Paid 1 of 1 finished quest · never rejected work");
  await expect(clean.locator(".rec-mark.good svg.icon")).toHaveCount(1);
  await expect(page.locator('[data-record="builder"]')).toContainText("Paid for 1 of 2 quests taken · 1 in progress");
});

test("track record: the address page shows both roles and what cannot be known", async ({ page }) => {
  await open(page, `/address/${OTHER}`);
  const poster = page.locator('[data-record-card="poster"]');
  await expect(poster.locator(".rec-headline")).toHaveText("Paid 0 of 2 finished quests · rejected work 3 times");
  await expect(poster.locator(".rec-stat")).toHaveText(["Posted26", "Paid0", "Open or in progress24", "Cancelled or refunded2", "Rejections3", "Refunded after a rejection2"]);
  const builder = page.locator('[data-record-card="builder"]');
  await expect(builder.locator(".rec-headline")).toHaveText("Paid for 1 of 2 quests taken · 1 in progress");

  await open(page, `/address/${BUILDER}`);
  const b = page.locator('[data-record-card="builder"]');
  await expect(b.locator(".rec-headline")).toHaveText("Paid for 1 of 7 quests taken · 2 in progress · 4 ended without pay");
  await expect(b).toContainText("1 on quests never rejected (so this builder gave them back or missed the deadline) and 3 on quests with rejections");
  await expect(b).toContainText("not who was rejected");

  await open(page, `/address/${NEWCOMER}`);
  await expect(page.locator('[data-record-card="poster"]')).toContainText("No history yet.");
  await expect(page.locator('[data-record-card="builder"]')).toContainText("No history yet.");
});

test("track record: fails quietly and never blocks the quest", async ({ page }) => {
  // Every by-address read fails; the quest itself still loads.
  await page.route("http://127.0.0.1:36657/", async (route) => {
    const data = route.request().postDataJSON()?.params?.data ?? "";
    if (Buffer.from(data, "base64").toString().includes("CountBy")) return route.fulfill({ status: 500, body: "nope" });
    return route.continue();
  });
  await open(page, "/quest/4");
  await expect(page.locator("h1.quest-title")).toHaveText("Add a dark theme to the demo page");
  await page.waitForTimeout(800);
  await expect(page.locator('[data-record="poster"]')).toHaveText("");
  await expect(page.locator(".state-box.error")).toHaveCount(0);
});

test("positioning: for people and AI agents, with example quests", async ({ page }) => {
  await open(page, "/");
  await expect(page.locator(".hero-for")).toHaveText("For people and AI agents: whoever does the work gets paid when the poster approves.");
  await expect(page.locator("h1#hero-title")).toHaveText("Small tasks, paid in GNOT");
  expect(await page.locator('meta[property="og:description"]').getAttribute("content")).toContain("people and AI agents");
  const examples = ["Find a bug in my realm", "Test this on your phone and report", "Review this translation", "Check my node setup guide by following it", "Give feedback on my demo video"];
  await open(page, "/how");
  await expect(page.locator(".examples li")).toHaveText(examples.map((e) => `“${e}”`));
  await expect(page.locator("main")).toContainText("A poster can turn down finished work and take the reward back");
  await expect(page.locator("main")).toContainText("check the poster's record before you take a quest");
  await open(page, "/post");
  expect(examples).toContain(await page.getByLabel("Title").getAttribute("placeholder"));
  await open(page, "/agents");
  await expect(page.locator(".lead")).toContainText("an AI agent can take part like anyone else");
  await expect(page.locator("main")).toContainText("No write was run.");
});

// Sizing guard: the same kind of thing has the same size on every page, per
// breakpoint (see the tokens in src/styles.css). A new one-off size fails here.
for (const width of [390, 1280]) {
  test(`sizing: one value per role on every page at ${width} px`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await mockPrice(ctx);
    const page = await ctx.newPage();
    const samples: Sample[] = [];
    const problems: string[] = [];
    for (const p of PAGES) {
      await page.goto(`${APP}#${p.route}`);
      await page.locator("main h1, main .state-box").first().waitFor();
      await page.waitForLoadState("networkidle");
      if (p.prep) await p.prep(page);
      await page.waitForTimeout(150);
      samples.push(...(await collect(page, p.name, width, "light")));
      const l = await layout(page);
      if (l.overflowX > 0) problems.push(`${p.name}: page is ${l.overflowX}px wider than the screen`);
      if (width < 700) for (const t of l.smallTargets) problems.push(`${p.name}: tap target under 44px: ${t}`);
    }
    await ctx.close();
    const byRole = new Map<string, Sample[]>();
    for (const s of samples) byRole.set(s.role, [...(byRole.get(s.role) ?? []), s]);
    const check = (role: string, what: string, key: (s: Sample) => string) => {
      const values = new Map<string, string>();
      for (const s of byRole.get(role) ?? []) if (!values.has(key(s))) values.set(key(s), `${s.cls}@${s.page}`);
      if (values.size > 1) problems.push(`${role} ${what}: ${[...values].map(([v, w]) => `${v} (${w})`).join(" | ")}`);
    };
    for (const role of byRole.keys()) {
      // Selects ignore line-height, so inputs compare size and weight only.
      if (TEXT_ROLES(role)) check(role, "text", (s) => (role === "input/select" ? `${s.fontSize}/${s.fontWeight}` : `${s.fontSize}/${s.lineHeight}/${s.fontWeight}`));
      if (HEIGHT_ROLES.has(role)) check(role, "height", (s) => String(Math.round(s.height)));
      if (BOX_ROLES.has(role)) check(role, "box", (s) => `${s.padding} r${s.radius} b${s.border}`);
    }
    expect(problems).toEqual([]);
  });
}

// Forms: every label sits the same distance above its control, controls side
// by side share one top and height, and their first hint lines start level.
async function formGeometry(page: Page) {
  return page.evaluate(() => {
    const box = (e: Element | null) => (e ? e.getBoundingClientRect() : null);
    const fields = Array.from(document.querySelectorAll<HTMLElement>("main .field")).map((f) => {
      const label = box(f.querySelector(".field-label"));
      const control = box(f.querySelector("input, select, textarea"));
      const hint = box(f.querySelector(".usd-block, .field-hint"));
      return {
        name: f.querySelector(".field-label")?.textContent ?? "?",
        gap: label && control ? Math.round((control.top - label.bottom) * 10) / 10 : null,
        controlTop: control?.top ?? null,
        hintGap: control && hint ? Math.round((hint.top - control.bottom) * 10) / 10 : null,
      };
    });
    const rows = Array.from(document.querySelectorAll<HTMLElement>("main .form-row, main .inline-form")).map((r) => {
      const controls = Array.from(r.querySelectorAll<HTMLElement>("input, select, button")).map((c) => {
        const b = c.getBoundingClientRect();
        return { tag: c.tagName.toLowerCase(), top: b.top, height: b.height, left: b.left };
      });
      const hints = Array.from(r.querySelectorAll<HTMLElement>(":scope > .field")).map((f) => box(f.querySelector(".usd-block, .field-hint"))?.top ?? null);
      return { cls: r.className, controls, hints };
    });
    return { fields, rows };
  });
}

for (const width of [1280, 768, 390]) {
  test(`forms line up at ${width} px: label gaps, control tops and heights, first hints`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await mockPrice(ctx);
    const page = await ctx.newPage();
    const problems: string[] = [];
    const gaps = new Map<number, string>();
    const visits: [string, string, ((p: Page) => Promise<void>)?][] = [
      ["post", "/post"],
      ["address", `/address/${BUILDER}`],
      ["submit link", "/quest/3", async (p) => void (await p.locator(".action").filter({ has: p.locator("strong", { hasText: /^Submit work$/ }) }).getByRole("button", { name: "Other ways" }).click())],
      ["reject reason", "/quest/4", async (p) => void (await p.locator(".action").filter({ has: p.locator("strong", { hasText: /^Reject the work$/ }) }).getByRole("button", { name: "Other ways" }).click())],
    ];
    for (const [name, route, prep] of visits) {
      await page.goto(`${APP}#${route}`);
      await page.locator("main h1").first().waitFor();
      await page.waitForLoadState("networkidle");
      if (prep) await prep(page);
      await page.waitForTimeout(200);
      const g = await formGeometry(page);
      for (const f of g.fields) if (f.gap !== null && !gaps.has(f.gap)) gaps.set(f.gap, `${name}: ${f.name}`);
      for (const r of g.rows) {
        // Controls on the same line (same left-to-right band) must share top and height.
        const sideBySide = r.controls.filter((c) => Math.abs(c.top - r.controls[0].top) < 20);
        if (sideBySide.length > 1) {
          const tops = sideBySide.map((c) => c.top);
          const heights = sideBySide.map((c) => c.height);
          if (Math.max(...tops) - Math.min(...tops) > 0.5) problems.push(`${name} ${r.cls}: control tops differ ${tops.map((t) => t.toFixed(1)).join(" / ")}`);
          if (Math.max(...heights) - Math.min(...heights) > 0.5) problems.push(`${name} ${r.cls}: control heights differ ${heights.map((h) => h.toFixed(1)).join(" / ")}`);
        }
        const hints = r.hints.filter((h): h is number => h !== null);
        const fieldsSideBySide = r.cls.includes("form-row") && width >= 700;
        if (fieldsSideBySide && hints.length > 1 && Math.max(...hints) - Math.min(...hints) > 0.5)
          problems.push(`${name} ${r.cls}: first hint lines start at ${hints.map((h) => h.toFixed(1)).join(" / ")}`);
      }
      for (const c of g.rows.flatMap((r) => r.controls)) if (c.tag !== "button" && Math.abs(c.height - 44) > 0.5) problems.push(`${name}: ${c.tag} is ${c.height}px tall`);
    }
    console.log(`FORMS ${width}px: label-to-control gaps ${[...gaps].map(([g, w]) => `${g}px (first seen: ${w})`).join(", ")}`);
    if (gaps.size > 1) problems.push(`label-to-control gaps differ: ${[...gaps].map(([g, w]) => `${g}px (${w})`).join(" | ")}`);
    await ctx.close();
    expect(problems).toEqual([]);
  });
}

// Design pass guards (task 14).
const DESIGN_PAGES = ["/", "/quest/4", "/quest/31", `/address/${OTHER}`, "/how", "/post", "/agents"];

test("design: no one-sided borders or side bars on boxes", async ({ page }) => {
  const found: string[] = [];
  for (const route of DESIGN_PAGES) {
    await open(page, route);
    await page.locator("main h1").first().waitFor();
    await page.waitForLoadState("networkidle");
    found.push(
      ...(await page.evaluate((route) => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("main *"))) {
          const cs = getComputedStyle(el);
          const widths = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map((w) => parseFloat(w));
          const styles = [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle];
          const sides = widths.filter((w, i) => w > 0 && styles[i] !== "none").length;
          const rounded = parseFloat(cs.borderTopLeftRadius) > 0 || parseFloat(cs.borderBottomLeftRadius) > 0;
          // A single vertical side (left or right) on a rounded box is the "side bar" habit.
          const vertical = (widths[1] > 0 && styles[1] !== "none") || (widths[3] > 0 && styles[3] !== "none");
          if (rounded && sides === 1 && vertical) out.push(`${route}: ${el.className} has a one-sided border`);
          for (const pseudo of ["::before", "::after"]) {
            const p = getComputedStyle(el, pseudo);
            if (p.content === "none" || p.position !== "absolute") continue;
            const w = parseFloat(p.width);
            const h = parseFloat(p.height);
            if (w > 0 && w <= 6 && h >= el.getBoundingClientRect().height * 0.5) out.push(`${route}: ${el.className}${pseudo} is a side bar`);
          }
        }
        return out;
      }, route)),
    );
  }
  expect(found).toEqual([]);
});

test("design: icons are drawn SVG in the text colour; no glyphs as icons", async ({ page }) => {
  const problems: string[] = [];
  for (const route of DESIGN_PAGES) {
    await open(page, route);
    await page.locator("main h1").first().waitFor();
    await page.waitForLoadState("networkidle");
    problems.push(
      ...(await page.evaluate((route) => {
        const out: string[] = [];
        for (const icon of Array.from(document.querySelectorAll(".icon"))) {
          if (icon.tagName.toLowerCase() !== "svg") out.push(`${route}: .icon is not an svg`);
          const cs = getComputedStyle(icon);
          if (cs.stroke !== cs.color) out.push(`${route}: icon stroke ${cs.stroke} is not currentColor ${cs.color}`);
        }
        const glyphs = /[◐◑☀☾☽→←↩✓✔✗!]/;
        for (const el of Array.from(document.querySelectorAll("button, a.btn, .rec-mark, .txstep-dot, .step-dot, .nav-link"))) {
          const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent ?? "").join("");
          if (glyphs.test(own)) out.push(`${route}: glyph used as an icon in "${own.trim()}"`);
        }
        return out;
      }, route)),
    );
  }
  expect(problems).toEqual([]);
});

test("board on phones: no diagram, nothing animating, quests come sooner", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockPrice(ctx);
  const page = await ctx.newPage();
  await page.goto(`${APP}#/`);
  await expect(page.locator("table.quests tbody tr")).toHaveCount(20);
  await expect(page.locator("[data-testid=quest-flow]")).toHaveCount(0);
  await expect(page.locator(".hero-visual")).toHaveCount(0);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && /flow/.test((a as CSSAnimation).animationName ?? "")).length)).toBe(0);
  const top = await page.getByRole("heading", { name: "Open quests" }).evaluate((h) => h.getBoundingClientRect().top + scrollY);
  console.log(`BOARD 390px: "Open quests" starts at ${Math.round(top)}px`);
  expect(top).toBeLessThan(900); // was 1185 px with the diagram and the four tiles
  await ctx.close();
});

for (const width of [768, 1024, 1280]) {
  test(`design: hero diagram text is at least 12 px at ${width} px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await mockPrice(ctx);
    const page = await ctx.newPage();
    await page.goto(`${APP}#/`);
    await page.locator("[data-testid=quest-flow]").waitFor();
    const sizes = await page.evaluate(() => {
      const flow = document.querySelector("[data-testid=quest-flow]")!;
      const out: number[] = [];
      const svg = flow.querySelector<SVGSVGElement>("svg.flow-svg");
      if (svg && svg.getBoundingClientRect().width > 0) {
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        for (const t of Array.from(svg.querySelectorAll("text"))) out.push(parseFloat(getComputedStyle(t).fontSize) * scale);
      }
      for (const el of Array.from(flow.querySelectorAll<HTMLElement>(".flow-list li, .flow-exits"))) {
        if (el.getBoundingClientRect().width > 0) out.push(parseFloat(getComputedStyle(el).fontSize));
      }
      return out;
    });
    await ctx.close();
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });
}

test("design: the quest page is not a stack of bordered cards", async ({ page }) => {
  await open(page, "/quest/4");
  await page.locator("main h1").waitFor();
  await page.waitForLoadState("networkidle");
  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll("main *")).filter((e) => {
      const cs = getComputedStyle(e);
      return parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none" && parseFloat(cs.borderTopLeftRadius) >= 8 && e.getBoundingClientRect().width > 200;
    }).length,
  );
  expect(boxes).toBeLessThanOrEqual(4);
});

test("keyboard: skip link focuses the main region without changing the route", async ({ page }) => {
  await open(page, "/quest/4");
  await page.locator("main h1").waitFor();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
  await expect(page).toHaveURL(/#\/quest\/4$/);
  await expect(page.locator("main h1")).toHaveText("Add a dark theme to the demo page");
});

test("navigation sets the page title and moves focus to the new page", async ({ page }) => {
  await open(page, "/");
  await expect(page).toHaveTitle("QuestMaster · small tasks, paid in GNOT");
  await page.getByRole("link", { name: "Small task 24" }).click();
  await expect(page).toHaveTitle("Quest 31 · QuestMaster");
  await expect(page.locator("main#main")).toBeFocused();
  await page.getByRole("link", { name: "How it works" }).first().click();
  await expect(page).toHaveTitle("How it works · QuestMaster");
});

for (const width of [1280, 768, 390]) {
  test(`quest facts: a regular grid in every state at ${width} px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await mockPrice(ctx);
    const page = await ctx.newPage();
    const problems: string[] = [];
    for (const [name, id] of [["open", 31], ["taken", 3], ["submitted", 4], ["closing", 5], ["paid", 1], ["cancelled", 2], ["hostile", 7]] as const) {
      await page.goto(`${APP}#/quest/${id}`);
      await page.locator("dl.facts").waitFor();
      await page.waitForLoadState("networkidle");
      problems.push(
        ...(await page.evaluate(
          ({ name, width }) => {
            const out: string[] = [];
            const dl = document.querySelector<HTMLElement>("dl.facts")!;
            const box = dl.getBoundingClientRect();
            const inner = box.width - 2; // minus the 1 px border on each side
            const cells = Array.from(dl.children).map((c) => ({ c, r: c.getBoundingClientRect(), cs: getComputedStyle(c) }));
            // Dividers span the whole block.
            for (const { c, r, cs } of cells)
              if (parseFloat(cs.borderBottomWidth) > 0 && Math.abs(r.width - inner) > 1) out.push(`${name}: divider under "${c.querySelector("dt")?.textContent}" is ${Math.round(r.width)} of ${Math.round(inner)} px`);
            // Cells that share a row share a top.
            for (const a of cells)
              for (const b of cells)
                if (a !== b && a.r.top < b.r.bottom - 1 && b.r.top < a.r.bottom - 1 && Math.abs(a.r.top - b.r.top) > 0.5)
                  out.push(`${name}: "${a.c.querySelector("dt")?.textContent}" and "${b.c.querySelector("dt")?.textContent}" overlap but start at different heights`);
            // From 700 px up, every row fills the width (no orphan cells).
            if (width >= 700) {
              const rows = new Map<number, number>();
              for (const { r } of cells) rows.set(Math.round(r.top), (rows.get(Math.round(r.top)) ?? 0) + r.width);
              for (const [top, w] of rows) if (Math.abs(w - inner) > 2) out.push(`${name}: the row at ${top} is ${Math.round(w)} of ${Math.round(inner)} px wide`);
            }
            return out;
          },
          { name, width },
        )),
      );
    }
    await ctx.close();
    expect(problems).toEqual([]);
  });
}

for (const [width, cols] of [[1280, 2], [1024, 1]] as const) {
  test(`quest page: ${cols === 2 ? "two columns" : "one column"} at ${width} px in every state`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await mockPrice(ctx);
    const page = await ctx.newPage();
    for (const id of [31, 3, 4, 5, 1, 2, 7]) {
      await page.goto(`${APP}#/quest/${id}`);
      await page.locator("dl.facts").waitFor();
      const g = await page.evaluate(() => {
        const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        const top = r(".quest-top"), side = r(".quest-side"), rest = r(".quest-rest");
        const overflow = Array.from(document.querySelectorAll(".quest-side *")).some((e) => e.getBoundingClientRect().right > side.right + 0.5);
        return { sideRight: side.left >= top.right - 0.5 && side.left >= rest.right - 0.5, sideBelowTop: side.top >= top.bottom - 0.5, overflow };
      });
      if (cols === 2) {
        expect(g.sideRight, `quest ${id}: facts to the right`).toBe(true);
      } else {
        expect(g.sideBelowTop, `quest ${id}: facts below the header`).toBe(true);
      }
      expect(g.overflow, `quest ${id}: something sticks out of the facts column`).toBe(false);
    }
    await ctx.close();
  });
}

test("one wallet button per action list without a wallet", async ({ page }) => {
  for (const id of [31, 3, 4, 5]) {
    await open(page, `/quest/${id}`);
    await page.locator("dl.facts").waitFor();
    const section = page.locator("main section", { has: page.getByRole("heading", { name: "What can happen next" }) });
    await expect(section.getByRole("link", { name: "Get Adena" }).or(section.getByRole("button", { name: /Connect wallet|Switch to/ }))).toHaveCount(1);
    await expect(section.locator(".actions .btn-primary")).toHaveCount(0);
  }
  // The bar's "Other ways to sign" opens the first available action and moves focus into it.
  await open(page, "/quest/31");
  await page.locator("[data-signin-bar]").getByRole("button", { name: "Other ways to sign" }).click();
  await expect(page.locator(".action-body").first()).toBeFocused();
  await expect(page.locator(".action-body pre.cmd").first()).toContainText("-func 'ClaimQuest'");
});

test("no horizontal overflow at 360 px", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: "reduce" });
  await mockPrice(ctx);
  const page = await ctx.newPage();
  const over: string[] = [];
  for (const p of PAGES) {
    await page.goto(`${APP}#${p.route}`);
    await page.locator("main h1, main .state-box").first().waitFor();
    await page.waitForLoadState("networkidle");
    if (p.prep) await p.prep(page);
    const l = await layout(page);
    if (l.overflowX > 0) over.push(`${p.name}:${l.overflowX}`);
  }
  await ctx.close();
  expect(over).toEqual([]);
});

test("keyboard: skip link and focusable controls", async ({ page }) => {
  await open(page, "/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

// Screenshots of the main screens: desktop and phone, light and dark.
for (const scheme of ["light", "dark"] as const) {
  for (const [name, size] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    test(`screenshots ${name} ${scheme}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: size, colorScheme: scheme, deviceScaleFactor: name === "phone" ? 2 : 1 });
      await mockPrice(ctx);
      const page = await ctx.newPage();
      for (const [route, file] of [
        ["/", "board"],
        ["/quest/31", "quest-open"],
        ["/quest/3", "quest-claimed"],
        ["/quest/4", "quest-submitted"],
        ["/quest/5", "quest-closing"],
        ["/quest/1", "quest-paid"],
        ["/quest/2", "quest-cancelled"],
        ["/paid", "paid"],
        ["/quest/7", "quest-hostile"],
        ["/post", "post"],
        ["/how", "how"],
        ["/agents", "agents"],
        ["/quest/34", "quest-record-clean"],
        [`/address/${OTHER}`, "address-record"],
      ] as const) {
        await page.goto(`${APP}#${route}`);
        await page.locator("main h1").first().waitFor();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1000); // entrance and count-up finished
        await page.screenshot({ path: `${SHOTS}/${file}-${name}-${scheme}.png`, fullPage: true });
      }
      // The caution a builder sees before claiming (quest 31's poster rejected work).
      await page.goto(`${APP}#/quest/31`);
      await page.locator('[data-record="poster"] a').waitFor();
      const claim = page.locator(".action", { hasText: "Take this quest" });
      await claim.getByRole("button", { name: "Other ways" }).click();
      await claim.locator("[data-poster-note]").waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOTS}/quest-caution-${name}-${scheme}.png`, fullPage: true });
      await ctx.close();
    });
  }
}
