import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config";
import { actionsFor, argsFor, buildMsg, gnokeyCommand, gnowebActionLink, type ActionName } from "./actions";
import { decodeQuest } from "./amino";
import fx from "../__fixtures__/gnodev-qeval-json.json";
import { chainErrorText, connect, REMEMBER_KEY, rememberConnection, restoreAccount, send, switchNetwork, wasConnected, WalletError } from "./wallet";

const POSTER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const BUILDER = "g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj";
const REALM = config.realmPath;

type Call = { method: string; arg: any };

/** A fake Adena that records calls and answers like the real one. */
function mockAdena(opts: { address?: string; chainId?: string; doContract?: (p: any) => any; switchType?: string } = {}) {
  const calls: Call[] = [];
  const ok = (type: string, data: any = {}) => ({ code: 0, status: "success", type, message: "", data });
  let chainId = opts.chainId ?? config.chainId;
  const adena = {
    AddEstablish: async (name: string) => (calls.push({ method: "AddEstablish", arg: name }), ok("CONNECTION_SUCCESS")),
    GetAccount: async () => (calls.push({ method: "GetAccount", arg: null }), ok("GET_ACCOUNT", { address: opts.address ?? POSTER, chainId, coins: "1ugnot" })),
    SwitchNetwork: async (id: string) => {
      calls.push({ method: "SwitchNetwork", arg: id });
      if (opts.switchType) return { code: 4001, status: "failure", type: opts.switchType, message: "", data: {} };
      chainId = id;
      return ok("SWITCH_NETWORK_SUCCESS", { chainId: id });
    },
    AddNetwork: async (n: any) => (calls.push({ method: "AddNetwork", arg: n }), ok("ADD_NETWORK_SUCCESS", n)),
    DoContract: async (p: any) => {
      calls.push({ method: "DoContract", arg: p });
      return opts.doContract ? opts.doContract(p) : ok("TRANSACTION_SENT", { hash: "SWHSwked0XUWk7R7UmW+iD4PgVugok/Pb7fW0Yf86qE=", height: "10" });
    },
  };
  (globalThis as any).adena = adena;
  return calls;
}

afterEach(() => {
  delete (globalThis as any).adena;
});

describe("the exact message for each of the 9 actions", () => {
  const cases: [ActionName, string[], bigint | undefined, string][] = [
    ["PostQuest", ["Fix a typo", "Line 1\nLine 2", "24686"], 5_000_000n, "5000000ugnot"],
    ["ClaimQuest", ["7"], undefined, ""],
    ["UnclaimQuest", ["7"], undefined, ""],
    ["ReleaseQuest", ["7"], undefined, ""],
    ["SubmitWork", ["7", "https://github.com/x/y/pull/1"], undefined, ""],
    ["ApproveWork", ["7"], undefined, ""],
    ["RejectWork", ["7", 'Missing "tests"'], undefined, ""],
    ["CancelQuest", ["7"], undefined, ""],
    ["ClaimPayout", ["7"], undefined, ""],
  ];
  beforeEach(() => void mockAdena());
  for (const [func, args, sendUgnot, sendStr] of cases) {
    it(func, async () => {
      const calls = mockAdena();
      const hash = await send(buildMsg(POSTER, func, args, sendUgnot));
      expect(hash).toBe("SWHSwked0XUWk7R7UmW+iD4PgVugok/Pb7fW0Yf86qE=");
      const dc = calls.find((c) => c.method === "DoContract")!;
      expect(dc.arg).toEqual({
        messages: [{ type: "/vm.m_call", value: { caller: POSTER, send: sendStr, pkg_path: REALM, func, args } }],
        memo: "",
      });
      // Adena estimates gas itself: no gas fields are sent.
      expect(JSON.stringify(dc.arg)).not.toMatch(/gas/i);
    });
  }
  it("refuses coins on non-paying calls and a post without a reward", () => {
    expect(() => buildMsg(POSTER, "ClaimQuest", ["1"], 1n)).toThrow(/no coins/);
    expect(() => buildMsg(POSTER, "PostQuest", ["t", "", "1000"])).toThrow(/reward/);
  });
});

describe("network and account checks before signing", () => {
  it("refuses to send on the wrong network", async () => {
    const calls = mockAdena({ chainId: "gnoland-1" });
    await expect(send(buildMsg(POSTER, "ClaimQuest", ["1"]))).rejects.toMatchObject({ kind: "wrong-network" });
    expect(calls.some((c) => c.method === "DoContract")).toBe(false);
  });
  it("refuses when the Adena account is not the caller", async () => {
    mockAdena({ address: BUILDER });
    await expect(send(buildMsg(POSTER, "ClaimQuest", ["1"]))).rejects.toThrow(/changed/);
  });
  it("switches network, adding it first when Adena does not know it", async () => {
    const calls = mockAdena({ chainId: "test5", switchType: "UNADDED_NETWORK" });
    await expect(switchNetwork()).rejects.toBeInstanceOf(WalletError); // second switch also fails in this mock
    expect(calls.map((c) => c.method)).toEqual(["SwitchNetwork", "AddNetwork", "SwitchNetwork"]);
    expect(calls[1].arg).toEqual({ chainId: config.chainId, chainName: config.networkName, rpcUrl: config.rpcUrl });
  });
  it("connects", async () => {
    const calls = mockAdena();
    expect(await connect()).toEqual({ address: POSTER, chainId: config.chainId });
    expect(calls[0]).toEqual({ method: "AddEstablish", arg: "QuestMaster" });
  });
  it("says when Adena is missing", async () => {
    await expect(connect()).rejects.toMatchObject({ kind: "not-installed" });
  });
});

describe("errors in plain words", () => {
  const fail = (type: string, message = "", data: any = {}) => async () => ({ code: 4000, status: "failure", type, message, data });
  it("user rejected", async () => {
    mockAdena({ doContract: fail("TRANSACTION_REJECTED") });
    await expect(send(buildMsg(POSTER, "ClaimQuest", ["1"]))).rejects.toThrow(/cancelled this in Adena/);
  });
  it("wallet locked", async () => {
    mockAdena({ doContract: fail("WALLET_LOCKED") });
    await expect(send(buildMsg(POSTER, "ClaimQuest", ["1"]))).rejects.toThrow(/locked/);
  });
  it("the realm's own error text from a failed transaction", async () => {
    mockAdena({ doContract: fail("TRANSACTION_FAILED", "Adena could not execute the transaction.", { log: 'VM panic: escrow: the poster cannot claim their own quest\nStacktrace...' }) });
    await expect(send(buildMsg(POSTER, "ClaimQuest", ["1"]))).rejects.toThrow("The chain refused it: escrow: the poster cannot claim their own quest");
  });
  it("a broadcast that fails in DeliverTx", async () => {
    mockAdena({
      doContract: async () => ({
        code: 0, status: "success", type: "TRANSACTION_SENT", message: "",
        data: { hash: "x", deliverTx: { ResponseBase: { Error: { "@type": "/abci.StringError" }, Log: "questmaster: this function does not take coins; send none" } } },
      }),
    });
    await expect(send(buildMsg(POSTER, "ClaimQuest", ["1"]))).rejects.toThrow("The chain refused it: questmaster: this function does not take coins; send none");
  });
  it("extracts only the escrow/questmaster sentence", () => {
    expect(chainErrorText('{"log":"panic: questmaster: unknown quest id\\nat x"}')).toBe("questmaster: unknown quest id");
    expect(chainErrorText("nothing here")).toBeNull();
  });
});

describe("fallbacks for people without Adena", () => {
  it("gnokey command quotes user text safely", () => {
    const cmd = gnokeyCommand("RejectWork", ["7", "it's $(rm -rf ~) `x`"]);
    expect(cmd).toContain(`-args '7'`);
    expect(cmd).toContain(`-args 'it'\\''s $(rm -rf ~) \`x\`'`);
    expect(cmd).toContain(`-chainid ${config.chainId}`);
    expect(cmd).toContain("-gas-fee 100000ugnot");
    expect(cmd).toContain("-gas-wanted 10000000");
    expect(gnokeyCommand("PostQuest", ["t", "d", "1000"], 5_000_000n)).toContain("-send '5000000ugnot'");
  });
  it("gnoweb form link", () => {
    expect(gnowebActionLink("ClaimQuest", 7n)).toBe(`${config.gnowebUrl}${REALM.replace("gno.land", "")}$help&func=ClaimQuest&id=7`);
    expect(gnowebActionLink("PostQuest", undefined, 5_000_000n)).toMatch(/\$help&func=PostQuest&\.send=5000000ugnot$/);
  });
});

describe("which actions show, for whom", () => {
  const q = (k: string) => decodeQuest((fx.responses as any)[k].data);
  const names = (o: { func: string }[]) => o.map((x) => x.func);
  it("open quest", () => {
    const o = actionsFor(q("GetQuest(7)"), 100n, POSTER);
    expect(names(o)).toEqual(["ClaimQuest", "CancelQuest"]);
    expect(o[0].blocked).toMatch(/You posted/);
    expect(o[1].blocked).toBeNull();
    expect(actionsFor(q("GetQuest(7)"), 100n, BUILDER)[0].blocked).toBeNull();
    expect(actionsFor(q("GetQuest(7)"), 100n, null)[0].blocked).toMatch(/Connect/);
  });
  it("claimed quest: builder can submit and unclaim; poster can close; release only after the deadline", () => {
    const c = q("GetQuest(3)");
    const asBuilder = actionsFor(c, c.workDeadline, BUILDER);
    expect(names(asBuilder)).toEqual(["SubmitWork", "UnclaimQuest", "CancelQuest", "ReleaseQuest"]);
    expect(asBuilder[0].blocked).toBeNull();
    expect(asBuilder[3].blocked).toMatch(/Possible from block/);
    const late = actionsFor(c, c.workDeadline + 1n, POSTER);
    expect(late.find((x) => x.func === "SubmitWork")!.blocked).toMatch(/deadline has passed/);
    expect(late.find((x) => x.func === "ReleaseQuest")!.blocked).toBeNull();
  });
  it("closing quest: no second close, and the texts say the reward goes back", () => {
    const c = q("GetQuest(5)");
    const o = actionsFor(c, 0n, POSTER);
    expect(names(o)).toEqual(["SubmitWork", "UnclaimQuest", "ReleaseQuest"]);
    expect(o[1].explain).toMatch(/goes back to the poster/);
  });
  it("submitted quest: reject until the review deadline, payout only after", () => {
    const s = q("GetQuest(4)");
    const now = actionsFor(s, s.reviewDeadline, POSTER);
    expect(names(now)).toEqual(["ApproveWork", "RejectWork", "CancelQuest", "ClaimPayout"]);
    expect(now[1].blocked).toBeNull();
    expect(now[3].blocked).toMatch(/Possible from block/);
    const late = actionsFor(s, s.reviewDeadline + 1n, BUILDER);
    expect(late.find((x) => x.func === "RejectWork")!.blocked).toMatch(/passed/);
    expect(late.find((x) => x.func === "ClaimPayout")!.blocked).toBeNull();
  });
  it("final quests have no actions", () => {
    expect(actionsFor(q("GetQuest(1)"), 0n, POSTER)).toEqual([]);
    expect(actionsFor(q("GetQuest(2)"), 0n, POSTER)).toEqual([]);
  });
  it("arguments", () => {
    expect(argsFor("SubmitWork", 7n, "https://x.io")).toEqual(["7", "https://x.io"]);
    expect(argsFor("ApproveWork", 7n)).toEqual(["7"]);
  });
});

describe("restoring a connection after a reload (no popup)", () => {
  const fail = (type: string) => ({ code: 1000, status: "failure", type, message: "", data: {} });
  function adenaWith(getAccount: () => Promise<any>) {
    const calls: string[] = [];
    (globalThis as any).adena = {
      AddEstablish: async () => (calls.push("AddEstablish"), { status: "success" }),
      GetAccount: async () => (calls.push("GetAccount"), getAccount()),
      DoContract: async () => (calls.push("DoContract"), { status: "success" }),
      SwitchNetwork: async () => (calls.push("SwitchNetwork"), { status: "success" }),
      AddNetwork: async () => (calls.push("AddNetwork"), { status: "success" }),
    };
    return calls;
  }

  it("a connected site: the account, from GetAccount alone", async () => {
    const calls = adenaWith(async () => ({ status: "success", type: "GET_ACCOUNT_SUCCESS", data: { address: BUILDER, chainId: "dev" } }));
    expect(await restoreAccount()).toEqual({ status: "connected", account: { address: BUILDER, chainId: "dev" } });
    expect(calls).toEqual(["GetAccount"]);
  });

  it("a site Adena does not know: not-connected (forget it)", async () => {
    adenaWith(async () => fail("NOT_CONNECTED"));
    expect(await restoreAccount()).toEqual({ status: "not-connected" });
    adenaWith(async () => fail("NO_ACCOUNT"));
    expect(await restoreAccount()).toEqual({ status: "not-connected" });
  });

  it("a locked wallet: locked (stay disconnected, try again next time)", async () => {
    const calls = adenaWith(async () => fail("WALLET_LOCKED"));
    expect(await restoreAccount()).toEqual({ status: "locked" });
    expect(calls).toEqual(["GetAccount"]);
  });

  it("no Adena, an odd answer, a throw or no answer in time: unavailable", async () => {
    expect(await restoreAccount()).toEqual({ status: "unavailable" });
    adenaWith(async () => ({ status: "success", data: { address: "nope" } }));
    expect(await restoreAccount()).toEqual({ status: "unavailable" });
    adenaWith(async () => fail("UNRESOLVED_TRANSACTION_EXISTS"));
    expect(await restoreAccount()).toEqual({ status: "unavailable" });
    adenaWith(async () => {
      throw new Error("extension reloaded");
    });
    expect(await restoreAccount()).toEqual({ status: "unavailable" });
    vi.useFakeTimers();
    try {
      adenaWith(() => new Promise(() => {}));
      const r = restoreAccount(4_000);
      await vi.advanceTimersByTimeAsync(4_000);
      expect(await r).toEqual({ status: "unavailable" });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("remembering the connection", () => {
  function memory() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  }
  it("stores only a flag, and forgets it on disconnect", () => {
    const s = memory();
    expect(wasConnected(s)).toBe(false);
    rememberConnection(true, s);
    expect(wasConnected(s)).toBe(true);
    expect([...s.m]).toEqual([[REMEMBER_KEY, "1"]]);
    rememberConnection(false, s);
    expect(wasConnected(s)).toBe(false);
    expect(s.m.size).toBe(0);
  });
  it("is silent when storage is missing or throws (private mode)", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(() => rememberConnection(true, broken)).not.toThrow();
    expect(wasConnected(broken)).toBe(false);
    expect(() => rememberConnection(false, null)).not.toThrow();
    expect(wasConnected(null)).toBe(false);
  });
});
