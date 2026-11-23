import { expect, test, type Page } from "@playwright/test";
import { HOSTILE_DETAILS, HOSTILE_REASON, HOSTILE_TITLE } from "./hostile.mjs";

const APP = process.env.QM_APP_URL!;
const REALM = process.env.QM_REALM!;
const SHOTS = "e2e/out/screenshots";
const POSTER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const BUILDER = "g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj";

const open = (page: Page, route: string) => page.goto(`${APP}#${route}`);

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
  await expect(stats).toContainText("2.5GNOT paid out");
  await expect(stats).toContainText("1quests paid");
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
  await expect(page.locator("main")).toContainText("Nothing: this quest is finished and the builder was paid 2.5 GNOT.");

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
  await expect(page.locator("table.quests tbody tr")).toHaveCount(1);
  await open(page, `/address/${BUILDER}?as=builder`);
  await expect(page.locator("table.quests tbody tr")).toHaveCount(5);
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
      DoContract: async (p: any) => (calls.push(["DoContract", p]), ok("TRANSACTION_SENT", { hash: "ABC123hash=", height: "5" })),
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
  await expect(page.locator(".ok")).toContainText("Sent: Take this quest. Transaction");
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
      const page = await ctx.newPage();
      for (const [route, file] of [["/", "board"], ["/quest/4", "quest-submitted"], ["/quest/7", "quest-hostile"], ["/post", "post"]] as const) {
        await page.goto(`${APP}#${route}`);
        await page.locator("main h1").first().waitFor();
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `${SHOTS}/${file}-${name}-${scheme}.png`, fullPage: true });
      }
      await ctx.close();
    });
  }
}
