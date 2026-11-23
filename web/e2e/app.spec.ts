import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { HOSTILE_DETAILS, HOSTILE_REASON, HOSTILE_TITLE } from "./hostile.mjs";

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
  const stats = page.locator(".stats");
  await expect(stats).toContainText("25open quests");
  await expect(stats).toContainText("38.234567GNOT locked");
  await expect(stats).toContainText("3.5GNOT paid out");
  await expect(stats).toContainText("2quests paid");
  const rows = page.locator("table.quests tbody tr");
  await expect(rows).toHaveCount(20);
  await expect(rows.first()).toContainText("Small task 24");
  await expect(page.locator(".pager")).toContainText("Page 1 of 2");
  await page.getByRole("link", { name: "Older →" }).click();
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
  await expect(claim).toContainText("Connect a wallet to do this.");
  // No "Do this" without a wallet: the main button gets Adena; the fallback is one click away, already open.
  await expect(claim.getByRole("button", { name: "Do this" })).toHaveCount(0);
  await expect(claim.getByRole("link", { name: "Get Adena" })).toHaveAttribute("href", "https://adena.app");
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
  // Not connected yet: each action offers "Connect wallet" instead of "Do this".
  const claim = page.locator(".action", { hasText: "Take this quest" });
  await expect(claim.getByRole("button", { name: "Do this" })).toHaveCount(0);
  await claim.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("button", { name: "Switch to dev" })).toBeVisible();
  await page.getByRole("button", { name: "Switch to dev" }).click();
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
  const stats = page.locator(".stats");
  await expect(stats).toContainText("38.234567GNOT locked≈ $4.74"); // 38.234567 × 0.124
  await expect(page.locator("table.quests tbody tr").first().locator("[data-usd]")).toHaveText(/^≈ \$\d+\.\d\d/);
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
    await expect(page.locator(".stats")).toContainText("38.234567GNOT locked");
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
    /^!This poster has rejected work 3 times on 2 quests, and 2 quests were refunded to them after a rejection\. A poster can turn down work/,
  );

  // Quest 34: a clean poster (paid, never rejected) and a builder with history.
  await open(page, "/quest/34");
  const clean = page.locator('[data-record="poster"]');
  await expect(clean).toContainText("Paid 1 of 1 finished quest · never rejected work");
  await expect(clean.locator(".rec-mark.good")).toHaveText("✓");
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
  await expect(page.locator("main")).toContainText("check the poster's record before you claim");
  await open(page, "/post");
  expect(examples).toContain(await page.getByLabel("Title").getAttribute("placeholder"));
  await open(page, "/agents");
  await expect(page.locator(".lead")).toContainText("an AI agent can take part like anyone else");
  await expect(page.locator("main")).toContainText("No write was run.");
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
