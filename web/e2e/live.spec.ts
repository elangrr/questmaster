// Pages that follow the chain by themselves, the wallet that stays connected
// across a reload, and action buttons that sign in one click. These tests send
// real transactions to the local chain (see chain.ts), so they run after
// app.spec.ts and only touch quests they post themselves (plus new blocks).
import { expect, test, type Page } from "@playwright/test";
import { callAsPoster, POSTER_KEY_ADDRESS, postAsPoster } from "./chain";

const APP = process.env.QM_APP_URL!;
const REALM = process.env.QM_REALM!;
const POSTER = POSTER_KEY_ADDRESS;
const BUILDER = "g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj";

test.beforeEach(async ({ context }) => {
  await context.route("https://api.coingecko.com/**", (route) =>
    route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ "gno-land": { usd: 0.05 } }) }),
  );
});

type DoContractMode = "fake" | "hold";

/**
 * A fake Adena that behaves like the real one for these calls:
 *  - GetAccount fails with NOT_CONNECTED until AddEstablish (kept in sessionStorage,
 *    like Adena keeps the site's connection across reloads), WALLET_LOCKED after __lock();
 *  - DoContract records the call and answers with a made-up hash at once ("fake"),
 *    or waits for __approve() ("hold"). Nothing is broadcast: the test sends the
 *    real transaction itself when it wants the chain to change.
 */
async function fakeAdena(page: Page, address: string, mode: DoContractMode = "fake") {
  await page.addInitScript(
    ([address, mode]) => {
      const calls: string[] = JSON.parse(sessionStorage.getItem("fake-calls") ?? "[]");
      const log = (c: string) => {
        calls.push(c);
        sessionStorage.setItem("fake-calls", JSON.stringify(calls));
      };
      const ok = (type: string, data: any = {}) => ({ code: 0, status: "success", type, message: "", data });
      const fail = (type: string) => ({ code: 1000, status: "failure", type, message: "", data: {} });
      (window as any).__calls = calls;
      (window as any).__messages = [];
      (window as any).__lock = () => sessionStorage.setItem("fake-locked", "1");
      (window as any).__forgetSite = () => sessionStorage.removeItem("fake-conn");
      (window as any).adena = {
        AddEstablish: async () => (log("AddEstablish"), sessionStorage.setItem("fake-conn", "1"), ok("CONNECTION_SUCCESS")),
        GetAccount: async () => {
          log("GetAccount");
          if (sessionStorage.getItem("fake-conn") !== "1") return fail("NOT_CONNECTED");
          if (sessionStorage.getItem("fake-locked") === "1") return fail("WALLET_LOCKED");
          return ok("GET_ACCOUNT_SUCCESS", { address, chainId: "dev" });
        },
        SwitchNetwork: async () => (log("SwitchNetwork"), ok("SWITCH_NETWORK_SUCCESS")),
        AddNetwork: async () => (log("AddNetwork"), ok("ADD_NETWORK_SUCCESS")),
        DoContract: (p: any) => {
          log("DoContract");
          (window as any).__messages.push(p);
          const answer = ok("TRANSACTION_SUCCESS", { hash: "LOCALFAKEhash0000000000000000000000000000000=", height: "1" });
          if (mode === "fake") return Promise.resolve(answer);
          return new Promise((resolve) => ((window as any).__approve = () => resolve(answer)));
        },
        On: () => true,
      };
    },
    [address, mode] as const,
  );
}

const calls = (page: Page) => page.evaluate(() => (window as any).__calls as string[]);
const markPage = (page: Page) => page.evaluate(() => ((window as any).__noReload = true));
const notReloaded = (page: Page) => page.evaluate(() => (window as any).__noReload === true);

test("a quest page follows the chain by itself, without a reload", async ({ page }) => {
  const id = postAsPoster(REALM, "Live page test");
  await fakeAdena(page, BUILDER);
  await page.goto(`${APP}#/quest/${id}`);
  await page.locator("[data-signin-bar]").getByRole("button", { name: "Connect wallet" }).click();
  const take = page.locator(".action", { hasText: "Take this quest" }).getByRole("button", { name: "Take this quest" });
  await expect(take).toBeEnabled();
  await expect(page.locator(".badge")).toHaveText("Open");
  await markPage(page);

  // The poster cancels from somewhere else (gnokey). The builder's page changes by itself.
  callAsPoster(REALM, "CancelQuest", [id]);
  await expect(page.locator(".badge")).toHaveText("Cancelled", { timeout: 15_000 });
  await expect(take).toHaveCount(0);
  await expect(page.locator(".settled-note")).toContainText("this quest was cancelled");
  expect(await notReloaded(page)).toBe(true);
  // Nothing more can happen to a cancelled quest, so the page stops asking.
  let reads = 0;
  page.on("request", (r) => void (r.url().startsWith("http://127.0.0.1:36657") && reads++));
  await page.waitForTimeout(9_000);
  expect(reads).toBe(0);
});

test("a background refresh keeps what the user typed and opened", async ({ page }) => {
  // Quest 4 is Submitted and posted by test1: the poster sees Approve and Reject.
  await fakeAdena(page, POSTER);
  await page.goto(`${APP}#/quest/4`);
  await page.locator("[data-signin-bar]").getByRole("button", { name: "Connect wallet" }).click();
  const reject = page.locator(".action", { hasText: "Reject the work" });
  const blockFact = page.locator(".facts div", { hasText: "Current block" }).locator("dd");
  const blockBefore = await blockFact.textContent();
  await page.locator(".action", { hasText: "Approve and pay" }).locator(".fallback summary").click();
  // "Reject the work" reveals the reason field; the same button then signs, disabled until there is a reason.
  await reject.getByRole("button", { name: "Reject the work" }).click();
  const reason = reject.getByLabel("Reason for rejecting");
  await expect(reason).toBeFocused();
  await expect(reject.getByRole("button", { name: "Reject the work" })).toBeDisabled();
  await reason.fill("Half done, see the notes");
  await expect(reject.getByRole("button", { name: "Reject the work" })).toBeEnabled();
  await markPage(page);
  const scrollY = await page.evaluate(() => window.scrollY);

  // A transaction elsewhere makes a new block; the page picks it up quietly.
  postAsPoster(REALM, "Another block");
  await expect(blockFact).not.toHaveText(blockBefore ?? "", { timeout: 15_000 });
  await expect(reason).toHaveValue("Half done, see the notes");
  await expect(reason).toBeFocused();
  await expect(page.locator(".fallback").first()).toHaveAttribute("open", "");
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  expect(await notReloaded(page)).toBe(true);
});

test("one click on an action without input signs it, then the page shows the new state", async ({ page }) => {
  const id = postAsPoster(REALM, "One click test");
  await fakeAdena(page, POSTER);
  await page.goto(`${APP}#/quest/${id}`);
  await page.locator("[data-signin-bar]").getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("button", { name: "Do this" })).toHaveCount(0);
  const row = page.locator(".action", { hasText: "Cancel quest" });
  // Exactly one button with the action's name in the row, and one click sends it.
  await expect(row.getByRole("button", { name: "Cancel quest" })).toHaveCount(1);
  await row.getByRole("button", { name: "Cancel quest" }).click();
  expect((await calls(page)).filter((c) => c === "DoContract")).toHaveLength(1);
  expect(await page.evaluate(() => (window as any).__messages[0])).toEqual({
    messages: [{ type: "/vm.m_call", value: { caller: POSTER, send: "", pkg_path: REALM, func: "CancelQuest", args: [id] } }],
    memo: "",
  });

  // Adena answered, but the node does not have the change yet: a spinner says so.
  await expect(row.locator(".txstep.active")).toHaveText("Updating status…");
  await expect(row.locator(".txstep.active .spinner")).toBeVisible();
  await expect(page.locator(".ok")).toHaveCount(0);
  await expect(page.locator(".badge")).toHaveText("Open");

  // Now the change lands on chain: the page shows it and the "Sent" notice, by itself.
  callAsPoster(REALM, "CancelQuest", [id]);
  await expect(page.locator(".badge")).toHaveText("Cancelled", { timeout: 10_000 });
  await expect(page.locator(".ok")).toContainText("Sent: Cancel quest. Transaction");
  await expect(page.locator(".spinner")).toHaveCount(0);
});

test("the wallet stays connected across a reload, and not after disconnecting", async ({ page }) => {
  await fakeAdena(page, BUILDER);
  await page.goto(`${APP}#/quest/31`);
  await page.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.locator(".wallet-addr")).toHaveText("g1us8428…njlj");
  expect(await page.evaluate(() => localStorage.getItem("qm-wallet-connected"))).toBe("1");

  // Reload: restored silently (GetAccount only, no AddEstablish), never showing "Connect wallet" on the way.
  await page.evaluate(() => sessionStorage.setItem("fake-calls", "[]"));
  await page.addInitScript(() => {
    (window as any).__sawConnect = false;
    new MutationObserver(() => {
      if ([...document.querySelectorAll("header button")].some((b) => b.textContent === "Connect wallet")) (window as any).__sawConnect = true;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.reload();
  await expect(page.locator(".wallet-addr")).toHaveText("g1us8428…njlj");
  await expect(page.locator(".action", { hasText: "Take this quest" }).getByRole("button", { name: "Take this quest" })).toBeEnabled();
  expect(await calls(page)).not.toContain("AddEstablish");
  expect(await page.evaluate(() => (window as any).__sawConnect)).toBe(false);

  // Locked wallet: stays disconnected quietly, and tries again next time.
  await page.evaluate(() => (window as any).__lock());
  await page.reload();
  await expect(page.locator("header").getByRole("button", { name: "Connect wallet" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("qm-wallet-connected"))).toBe("1");
  expect(await calls(page)).not.toContain("AddEstablish");
  await page.evaluate(() => sessionStorage.removeItem("fake-locked"));
  await page.reload();
  await expect(page.locator(".wallet-addr")).toBeVisible();

  // Disconnect: the flag is gone and a reload does not even ask Adena.
  await page.getByRole("button", { name: "Disconnect wallet" }).click();
  await expect(page.locator("header").getByRole("button", { name: "Connect wallet" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("qm-wallet-connected"))).toBeNull();
  await page.evaluate(() => sessionStorage.setItem("fake-calls", "[]"));
  await page.reload();
  await expect(page.locator("header").getByRole("button", { name: "Connect wallet" })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await calls(page)).toEqual([]);
});

test("a site Adena no longer knows is forgotten quietly", async ({ page }) => {
  await fakeAdena(page, BUILDER);
  await page.goto(`${APP}#/`);
  await page.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.locator(".wallet-addr")).toBeVisible();
  await page.evaluate(() => {
    (window as any).__forgetSite();
    sessionStorage.setItem("fake-calls", "[]");
  });
  await page.reload();
  await expect(page.locator("header").getByRole("button", { name: "Connect wallet" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("qm-wallet-connected"))).toBeNull();
  expect(await calls(page)).not.toContain("AddEstablish");
});

test("the board picks up a new quest by itself", async ({ page }) => {
  await page.clock.install();
  await page.goto(`${APP}#/`);
  const count = page.locator(".totals .total-num").first();
  await expect(count).toHaveText(/\d+/);
  const before = Number(await count.textContent());
  await markPage(page);
  const id = postAsPoster(REALM, "Board live test");
  await page.clock.fastForward(16_000);
  await expect(count).toHaveText(String(before + 1), { timeout: 10_000 });
  await expect(page.locator("table.quests")).toContainText("Board live test");
  expect(await notReloaded(page)).toBe(true);
  callAsPoster(REALM, "CancelQuest", [id]); // leave the open count as it was
});

test("after posting, the result links to the new quest", async ({ page }) => {
  await fakeAdena(page, POSTER, "hold");
  await page.goto(`${APP}#/post`);
  await page.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  await page.getByLabel("Title").fill("Posted from the form");
  await page.getByLabel("Details").fill("Checks the link to the new quest.");
  await page.getByLabel("Reward (GNOT)").fill("2");
  await page.getByRole("button", { name: "Post and lock the reward" }).click();
  await expect(page.locator(".txstep.active")).toHaveText("Waiting for your wallet");
  // Adena would broadcast now; here the test sends the same call itself, then lets Adena answer.
  const msg = await page.evaluate(() => (window as any).__messages[0].messages[0].value);
  expect(msg).toMatchObject({ caller: POSTER, func: "PostQuest", send: "2000000ugnot", args: ["Posted from the form", "Checks the link to the new quest.", "24686"] });
  const sent = callAsPoster(REALM, "PostQuest", msg.args, msg.send);
  await page.evaluate(() => (window as any).__approve());
  const link = page.getByRole("link", { name: `Open quest ${sent.id}` });
  await expect(link).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-posted] .ok")).toContainText("Sent: your quest.");
  await link.click();
  await expect(page.locator("h1.quest-title")).toHaveText("Posted from the form");
  callAsPoster(REALM, "CancelQuest", [sent.id!]); // leave the board as it was
});
