import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config";
import fx from "../__fixtures__/gnodev-qeval-json.json";
import { DecodeError, decodeIds, decodeInt, decodeQuest, decodeTotals } from "./amino";
import { abciQuery, invalidate, notLiveMessage, packageStatus, read, READ_TIMEOUT_MS, ReadError } from "./rpc";

// Real gnodev qeval_json answers (decoded text + error), keyed by expression.
const R = fx.responses as Record<string, { data: string; error: { "@type": string; value?: string } | null }>;

const POSTER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const BUILDER = "g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj";
const OTHER = "g1rzuwh5frve732k4futyw45y78rzuty4626zy6h";
const REALM = config.realmPath;
const STATUS_URL = config.rpcUrl.replace(/\/$/, "") + "/status";

/** Base64 of UTF-8 text (and back), for building and reading node messages. */
const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

/** A minimal fetch Response: only what rpc.ts reads (ok, status, json()). */
function httpReply(status: number, body: unknown, opts: { notJson?: boolean } = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (opts.notJson) throw new SyntaxError("Unexpected token < in JSON");
      return body;
    },
  } as unknown as Response;
}

/** The JSON-RPC envelope a Gno.land node sends for abci_query. */
function abciReply(base: { Data?: string | null; Error?: unknown; Log?: unknown }) {
  return httpReply(200, { jsonrpc: "2.0", id: 1, result: { response: { ResponseBase: base } } });
}

/** A node answer for a fixture entry (data encoded as base64, error as the node sends it). */
function fixtureReply(key: string) {
  const r = R[key];
  if (!r) throw new Error("missing fixture " + key);
  return abciReply({ Data: r.data ? b64(r.data) : null, Error: r.error, Log: "" });
}

type Sent = { url: string; init?: RequestInit; body?: any };

/** A fake fetch that answers each call with the next reply (or the last one, repeatedly). */
function fakeFetch(...replies: (Response | Error | DOMException | (() => Response | Promise<Response>))[]) {
  const sent: Sent[] = [];
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(url), init, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const r = replies[Math.min(sent.length - 1, replies.length - 1)];
    // (jsdom's DOMException is not an Error subclass, so check it too)
    if (r instanceof Error || r instanceof DOMException) throw r;
    return typeof r === "function" ? r() : r;
  });
  return { fn: fn as unknown as typeof fetch, sent, calls: () => sent.length };
}

/** Installs a fake as the global fetch (packageStatus and read.* use the global). */
function useFetch(...replies: Parameters<typeof fakeFetch>) {
  const f = fakeFetch(...replies);
  vi.stubGlobal("fetch", f.fn);
  return f;
}

beforeEach(() => {
  invalidate();
  // Any test that forgets to fake fetch fails instead of reaching the network.
  vi.stubGlobal("fetch", () => Promise.reject(new Error("real network call in a test")));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function readError(p: Promise<unknown>): Promise<ReadError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ReadError);
    return e as ReadError;
  }
  throw new Error("expected a ReadError, got success");
}

describe("abciQuery", () => {
  it("POSTs a JSON-RPC abci_query with the path and UTF-8 data as base64, and decodes the answer", async () => {
    const f = fakeFetch(abciReply({ Data: b64('{"x":"ünï 日本"}'), Error: null, Log: "gas used: 7" }));
    const r = await abciQuery("vm/qeval_json", `${REALM}.GetQuest(1) "ünï"`, f.fn);

    expect(r).toEqual({ data: '{"x":"ünï 日本"}', error: null, log: "gas used: 7" });
    expect(f.calls()).toBe(1);
    const s = f.sent[0];
    expect(s.url).toBe(config.rpcUrl);
    expect(s.init?.method).toBe("POST");
    expect((s.init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(s.body.jsonrpc).toBe("2.0");
    expect(s.body.method).toBe("abci_query");
    expect(s.body.params.path).toBe("vm/qeval_json");
    expect(unb64(s.body.params.data)).toBe(`${REALM}.GetQuest(1) "ünï"`);
  });

  it("gives every request a new, increasing id", async () => {
    const f = fakeFetch(abciReply({ Data: null }));
    await abciQuery("a", "", f.fn);
    await abciQuery("a", "", f.fn);
    expect(typeof f.sent[0].body.id).toBe("number");
    expect(f.sent[1].body.id).toBe(f.sent[0].body.id + 1);
  });

  it("returns empty data and log when the node leaves them out or sends a non-string log", async () => {
    const r = await abciQuery("p", "d", fakeFetch(abciReply({ Log: 42 })).fn);
    expect(r).toEqual({ data: "", error: null, log: "" });
  });

  describe("an error answer from the node (abci Error)", () => {
    it("uses the error's value", async () => {
      const r = await abciQuery("p", "d", fakeFetch(fixtureReply("GetQuest(999)")).fn);
      expect(r.error).toBe("questmaster: unknown quest id");
      expect(r.data).toBe("");
    });
    it("falls back to the error's @type, then to 'error', and keeps the log", async () => {
      const t = await abciQuery("p", "d", fakeFetch(abciReply({ Error: { "@type": "/vm.InvalidPkgPathError" }, Log: "no such pkg" })).fn);
      expect(t).toEqual({ data: "", error: "/vm.InvalidPkgPathError", log: "no such pkg" });
      const e = await abciQuery("p", "d", fakeFetch(abciReply({ Error: {} })).fn);
      expect(e.error).toBe("error");
    });
  });

  describe("a JSON-RPC error object", () => {
    it("throws ReadError('network') with the error message", async () => {
      const f = fakeFetch(httpReply(200, { jsonrpc: "2.0", id: 1, error: { code: -32603, message: "Internal error", data: "detail" } }));
      const e = await readError(abciQuery("p", "d", f.fn));
      expect(e.kind).toBe("network");
      expect(e.name).toBe("ReadError");
      expect(e.message).toBe("The node returned an error: Internal error");
    });
    it("uses data when there is no message, and 'unknown' when there is neither", async () => {
      const d = await readError(abciQuery("p", "d", fakeFetch(httpReply(200, { error: { data: "only data" } })).fn));
      expect(d.message).toBe("The node returned an error: only data");
      const u = await readError(abciQuery("p", "d", fakeFetch(httpReply(200, { error: { code: 1 } })).fn));
      expect(u.message).toBe("The node returned an error: unknown");
    });
  });

  describe("transport and HTTP failures", () => {
    it("fetch rejecting (node unreachable) becomes ReadError('network') naming the node", async () => {
      const e = await readError(abciQuery("p", "d", fakeFetch(new TypeError("Failed to fetch")).fn));
      expect(e.kind).toBe("network");
      expect(e.message).toBe(`Could not reach the ${config.networkName} node at ${config.rpcUrl}.`);
    });
    it("an aborted fetch is reported the same way", async () => {
      const e = await readError(abciQuery("p", "d", fakeFetch(new DOMException("The operation was aborted.", "AbortError")).fn));
      expect(e.kind).toBe("network");
      expect(e.message).toContain("Could not reach");
    });
    it("HTTP 403 says the node does not allow these queries", async () => {
      const e = await readError(abciQuery("p", "d", fakeFetch(httpReply(403, { error: "forbidden" })).fn));
      expect(e.kind).toBe("network");
      expect(e.message).toContain("HTTP 403");
      expect(e.message).toContain("VITE_RPC_URL");
    });
    it("any other non-OK status names the status and does not read the body", async () => {
      const json = vi.fn();
      const res = { ok: false, status: 502, json } as unknown as Response;
      const e = await readError(abciQuery("p", "d", fakeFetch(res).fn));
      expect(e.kind).toBe("network");
      expect(e.message).toBe("The node had a problem (HTTP 502). Try again in a moment.");
      expect(json).not.toHaveBeenCalled();
    });
  });

  describe("malformed or unexpected bodies", () => {
    it("a body that is not JSON", async () => {
      const e = await readError(abciQuery("p", "d", fakeFetch(httpReply(200, null, { notJson: true })).fn));
      expect(e.kind).toBe("network");
      expect(e.message).toBe("The node sent a response that is not JSON. Try again in a moment.");
    });
    it.each([
      ["no result", { jsonrpc: "2.0", id: 1 }],
      ["result null", { result: null }],
      ["no response", { result: {} }],
      ["no ResponseBase", { result: { response: {} } }],
      ["JSON null", null],
      ["a JSON number", 42],
      ["a JSON boolean", true],
      ["a JSON array", []],
      ["a JSON string", "hello"],
      ["ResponseBase a number", { result: { response: { ResponseBase: 5 } } }],
      ["ResponseBase a string", { result: { response: { ResponseBase: "x" } } }],
    ])("%s", async (_name, body) => {
      const e = await readError(abciQuery("p", "d", fakeFetch(httpReply(200, body)).fn));
      expect(e.kind).toBe("network");
      expect(e.message).toBe("The node sent an unexpected response. Try again in a moment.");
    });

    it("invalid base64 in ResponseBase.Data becomes ReadError('network')", async () => {
      const e = await readError(abciQuery("p", "d", fakeFetch(abciReply({ Data: "%%%" })).fn));
      expect(e.kind).toBe("network");
      expect(e.message).toBe("The node sent an unexpected response. Try again in a moment.");
    });

    it("ResponseBase.Data that is not a string becomes ReadError('network')", async () => {
      // 123 would pass atob() and come back as garbage text, so it must be refused before decoding.
      const e = await readError(abciQuery("p", "d", fakeFetch(abciReply({ Data: 123 as unknown as string })).fn));
      expect(e.kind).toBe("network");
      expect(e.message).toBe("The node sent an unexpected response. Try again in a moment.");
    });

    it("valid base64 of invalid UTF-8 does not throw and replaces bad bytes", async () => {
      const r = await abciQuery("p", "d", fakeFetch(abciReply({ Data: btoa("\xff\xfe") })).fn);
      expect(r).toEqual({ data: "\ufffd\ufffd", error: null, log: "" });
    });
  });

  describe("timeout", () => {
    const TIMEOUT_MSG = `The ${config.networkName} node at ${config.rpcUrl} did not answer in time. Try again in a moment.`;
    const UNREACHABLE_MSG = `Could not reach the ${config.networkName} node at ${config.rpcUrl}.`;

    it("exports READ_TIMEOUT_MS as 12000 and passes an AbortSignal to fetch", async () => {
      expect(READ_TIMEOUT_MS).toBe(12_000);
      vi.useFakeTimers();
      const f = fakeFetch(abciReply({ Data: b64("ok") }));
      const r = await abciQuery("vm/qeval_json", "ping", f.fn);
      expect(r.data).toBe("ok");
      expect(f.sent[0].init?.signal).toBeInstanceOf(AbortSignal);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("aborts and rejects with ReadError('network') at 12000 ms, not at 11999 ms, when fetch never resolves", async () => {
      vi.useFakeTimers();
      const f = fakeFetch(() => new Promise<Response>(() => {}));
      let settled = false;
      const p = readError(abciQuery("vm/qeval_json", "hang", f.fn)).finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      expect(f.sent[0].init?.signal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      const e = await p;
      expect(e.kind).toBe("network");
      expect(e.message).toBe(TIMEOUT_MSG);
      expect(f.sent[0].init?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("also times out when headers arrive but res.json() never resolves", async () => {
      vi.useFakeTimers();
      const hangingBody = { ok: true, status: 200, json: () => new Promise(() => {}) } as unknown as Response;
      const f = fakeFetch(hangingBody);
      let settled = false;
      const p = readError(abciQuery("vm/qeval_json", "slow-body", f.fn)).finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      const e = await p;
      expect(e.kind).toBe("network");
      expect(e.message).toBe(TIMEOUT_MSG);
      expect(f.sent[0].init?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("clears the timer and keeps the unreachable message on a non-timeout failure", async () => {
      vi.useFakeTimers();
      const e = await readError(abciQuery("vm/qeval_json", "fail", fakeFetch(new TypeError("Failed to fetch")).fn));
      expect(e.kind).toBe("network");
      expect(e.message).toBe(UNREACHABLE_MSG);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe("packageStatus", () => {
  const meta = (m: unknown) => abciReply({ Data: b64(JSON.stringify(m)) });

  it("asks vm/qpkgmeta_json about the realm path", async () => {
    const f = useFetch(meta({ status: "live", reason: "" }));
    await packageStatus();
    expect(f.sent[0].body.params.path).toBe("vm/qpkgmeta_json");
    expect(unb64(f.sent[0].body.params.data)).toBe(REALM);
  });

  it.each(["live", "inert", "absent"] as const)("returns status %s with its reason", async (status) => {
    useFetch(meta({ status, reason: `why ${status}` }));
    expect(await packageStatus()).toEqual({ status, reason: `why ${status}` });
  });

  it("maps an unexpected status to 'unknown' and a non-string reason to ''", async () => {
    useFetch(meta({ status: "LIVE", reason: 7 }));
    expect(await packageStatus()).toEqual({ status: "unknown", reason: "" });
  });

  it("an error answer from the node gives 'unknown' with the error as reason", async () => {
    useFetch(abciReply({ Error: { "@type": "/abci.StringError", value: "qpkgmeta not supported" } }));
    expect(await packageStatus()).toEqual({ status: "unknown", reason: "qpkgmeta not supported" });
  });

  it("data that is not JSON gives 'unknown' with no reason", async () => {
    useFetch(abciReply({ Data: b64("not json {") }));
    expect(await packageStatus()).toEqual({ status: "unknown", reason: "" });
  });

  it("empty data gives 'unknown' with no reason", async () => {
    useFetch(abciReply({ Data: null }));
    expect(await packageStatus()).toEqual({ status: "unknown", reason: "" });
  });

  it("HTTP failures and unreachable nodes reject with ReadError('network')", async () => {
    useFetch(httpReply(500, {}));
    expect((await readError(packageStatus())).message).toContain("HTTP 500");
    useFetch(new TypeError("Failed to fetch"));
    expect((await readError(packageStatus())).kind).toBe("network");
  });

  it("a malformed body rejects with ReadError('network')", async () => {
    useFetch(httpReply(200, { result: { response: null } }));
    expect((await readError(packageStatus())).message).toContain("unexpected response");
  });
});

describe("notLiveMessage", () => {
  it("explains a parked (inert) package", () => {
    expect(notLiveMessage({ status: "inert", reason: "" })).toBe(
      `QuestMaster has been submitted to the ${config.networkName} but is waiting for the network's package approver to enable it. The board will appear here as soon as it is live.`,
    );
  });
  it("explains an absent package", () => {
    expect(notLiveMessage({ status: "absent", reason: "" })).toBe(`QuestMaster is not deployed on the ${config.networkName} yet.`);
  });
  it("is generic for unknown, live or no status", () => {
    const generic = `QuestMaster is not available on the ${config.networkName} right now.`;
    expect(notLiveMessage(null)).toBe(generic);
    expect(notLiveMessage({ status: "unknown", reason: "x" })).toBe(generic);
    expect(notLiveMessage({ status: "live", reason: "" })).toBe(generic);
  });
});

describe("read (realm reads through vm/qeval_json)", () => {
  const expr = (s: Sent) => unb64(s.body.params.data);

  describe("successful answers", () => {
    it("totals", async () => {
      const f = useFetch(fixtureReply("GetTotals()"));
      const t = await read.totals();
      expect(t).toEqual(decodeTotals(R["GetTotals()"].data));
      expect(typeof t.quests).toBe("bigint");
      expect(f.sent[0].body.params.path).toBe("vm/qeval_json");
      expect(expr(f.sent[0])).toBe(`${REALM}.GetTotals()`);
    });

    it("quest", async () => {
      const f = useFetch(fixtureReply("GetQuest(1)"));
      const q = await read.quest(1n);
      expect(q.id).toBe(1n);
      expect(q.title).toBe("Translate the README to Indonesian");
      expect(q).toEqual(decodeQuest(R["GetQuest(1)"].data));
      expect(expr(f.sent[0])).toBe(`${REALM}.GetQuest(1)`);
    });

    it("quests keeps the order of the ids", async () => {
      const f = useFetch(() => {
        const e = expr(f.sent[f.sent.length - 1]);
        return fixtureReply(e.slice(REALM.length + 1));
      });
      const qs = await read.quests([3n, 1n, 2n]);
      expect(qs.map((q) => q.id)).toEqual([3n, 1n, 2n]);
    });

    it.each([
      ["openIds", () => read.openIds(0, 20), "OpenQuestIDs(0, 20)"],
      ["paidIds", () => read.paidIds(0, 20), "PaidQuestIDs(0, 20)"],
      ["posterIds", () => read.posterIds(POSTER, 0, 20), `QuestIDsByPoster(address("${POSTER}"), 0, 20)`],
      ["builderIds", () => read.builderIds(BUILDER, 0, 20), `QuestIDsByBuilder(address("${BUILDER}"), 0, 20)`],
    ] as const)("%s", async (_name, call, key) => {
      const f = useFetch(fixtureReply(key));
      const ids = await call();
      expect(ids).toEqual(decodeIds(R[key].data));
      expect(ids.length).toBeGreaterThan(0);
      expect(expr(f.sent[0])).toBe(`${REALM}.${key}`);
    });

    it("posterCount and builderCount", async () => {
      const pk = `CountByPoster(address("${POSTER}"))`;
      const bk = `CountByBuilder(address("${OTHER}"))`;
      const f = useFetch(fixtureReply(pk), fixtureReply(bk));
      expect(await read.posterCount(POSTER)).toBe(7);
      expect(await read.builderCount(OTHER)).toBe(decodeInt(R[bk].data));
      expect(expr(f.sent[0])).toBe(`${REALM}.${pk}`);
      expect(expr(f.sent[1])).toBe(`${REALM}.${bk}`);
    });
  });

  describe("error answers from the node", () => {
    it("an unknown quest id is ReadError('not-found')", async () => {
      useFetch(fixtureReply("GetQuest(999)"));
      const e = await readError(read.quest(999n));
      expect(e.kind).toBe("not-found");
      expect(e.message).toBe("There is no quest with that number.");
    });

    it("a missing realm is ReadError('not-live'), worded from the package status", async () => {
      const f = useFetch(fixtureReply("missing-realm"), abciReply({ Data: b64('{"status":"inert"}') }));
      const e = await readError(read.totals());
      expect(e.kind).toBe("not-live");
      expect(e.message).toBe(notLiveMessage({ status: "inert", reason: "" }));
      expect(f.sent[1].body.params.path).toBe("vm/qpkgmeta_json");
    });

    it("'package not found' in the log also means not live", async () => {
      useFetch(abciReply({ Error: { "@type": "/abci.StringError", value: "boom" }, Log: "Package Not Found: x" }), abciReply({ Data: b64('{"status":"absent"}') }));
      const e = await readError(read.totals());
      expect(e.kind).toBe("not-live");
      expect(e.message).toBe(notLiveMessage({ status: "absent", reason: "" }));
    });

    it("if the package status check itself fails, the not-live message is the generic one", async () => {
      useFetch(fixtureReply("missing-realm"), httpReply(500, {}));
      const e = await readError(read.totals());
      expect(e.kind).toBe("not-live");
      expect(e.message).toBe(notLiveMessage(null));
    });

    it("any other node error is ReadError('chain') with the node's text", async () => {
      useFetch(abciReply({ Error: { "@type": "/abci.StringError", value: "out of gas" } }));
      const e = await readError(read.totals());
      expect(e.kind).toBe("chain");
      expect(e.message).toBe("out of gas");
    });
  });

  describe("failed or non-OK HTTP responses", () => {
    const ALL_READS: readonly [string, () => Promise<unknown>][] = [
      ["totals", () => read.totals()],
      ["quest", () => read.quest(17n)],
      ["openIds", () => read.openIds(3, 11)],
      ["paidIds", () => read.paidIds(5, 13)],
      ["posterIds", () => read.posterIds(POSTER, 7, 19)],
      ["builderIds", () => read.builderIds(BUILDER, 9, 23)],
      ["posterCount", () => read.posterCount(OTHER)],
      ["builderCount", () => read.builderCount(POSTER)],
      ["height", () => read.height()],
    ];

    it("HTTP 500 is ReadError('network')", async () => {
      useFetch(httpReply(500, {}));
      const e = await readError(read.quest(1n));
      expect(e.kind).toBe("network");
      expect(e.message).toContain("HTTP 500");
    });
    it("an unreachable node is ReadError('network')", async () => {
      useFetch(new TypeError("Failed to fetch"));
      expect((await readError(read.openIds(0, 20))).kind).toBe("network");
    });

    it.each(ALL_READS)("%s rejects with the HTTP 403 ReadError on status 403", async (_name, call) => {
      useFetch(httpReply(403, { result: { sync_info: { latest_block_height: "42" } } }));
      const e = await readError(call());
      expect(e.kind).toBe("network");
      expect(e.message).toBe(
        `The node at ${config.rpcUrl} does not allow these read queries (HTTP 403). Set VITE_RPC_URL to a node that does.`,
      );
    });

    it.each(ALL_READS)("%s rejects with the HTTP status ReadError on status 502", async (_name, call) => {
      useFetch(httpReply(502, { result: { sync_info: { latest_block_height: "99" } } }));
      const e = await readError(call());
      expect(e.kind).toBe("network");
      expect(e.message).toBe("The node had a problem (HTTP 502). Try again in a moment.");
    });
  });

  describe("malformed or unexpected bodies", () => {
    const ABCI_READS: readonly [string, () => Promise<unknown>][] = [
      ["totals", () => read.totals()],
      ["quest", () => read.quest(29n)],
      ["openIds", () => read.openIds(2, 15)],
      ["paidIds", () => read.paidIds(4, 16)],
      ["posterIds", () => read.posterIds(POSTER, 6, 18)],
      ["builderIds", () => read.builderIds(BUILDER, 8, 21)],
      ["posterCount", () => read.posterCount(OTHER)],
      ["builderCount", () => read.builderCount(POSTER)],
    ];

    it("an answer the decoder cannot read rejects with DecodeError", async () => {
      useFetch(abciReply({ Data: b64('{"results":[]}') }));
      await expect(read.totals()).rejects.toBeInstanceOf(DecodeError);
    });
    it("the wrong type of answer rejects with DecodeError", async () => {
      useFetch(fixtureReply("GetTotals()"));
      await expect(read.openIds(0, 20)).rejects.toBeInstanceOf(DecodeError);
    });
    it("a JSON-RPC envelope without a response is ReadError('network')", async () => {
      useFetch(httpReply(200, { result: {} }));
      expect((await readError(read.quest(2n))).message).toContain("unexpected response");
    });

    it.each(ABCI_READS)("%s rejects a JSON null body with ReadError('network')", async (_name, call) => {
      useFetch(httpReply(200, null));
      const e = await readError(call());
      expect(e.kind).toBe("network");
      expect(e.message).toBe("The node sent an unexpected response. Try again in a moment.");
    });

    it.each(ABCI_READS)("%s rejects invalid base64 in ResponseBase.Data with ReadError('network')", async (_name, call) => {
      useFetch(abciReply({ Data: "%%%" }));
      const e = await readError(call());
      expect(e.kind).toBe("network");
      expect(e.message).toBe("The node sent an unexpected response. Try again in a moment.");
    });
  });

  describe("address checks", () => {
    it.each([
      ["posterIds", (a: string) => read.posterIds(a, 0, 20)],
      ["builderIds", (a: string) => read.builderIds(a, 0, 20)],
      ["posterCount", (a: string) => read.posterCount(a)],
      ["builderCount", (a: string) => read.builderCount(a)],
    ] as const)("%s rejects a bad address without any request", async (_name, call) => {
      const f = useFetch(fixtureReply("GetTotals()"));
      for (const bad of ["", "g1short", POSTER.toUpperCase(), POSTER.slice(0, -1) + "b", `${POSTER}") + x("`]) {
        const e = await readError(call(bad));
        expect(e.kind).toBe("not-found");
        expect(e.message).toBe("That is not a valid address.");
      }
      expect(f.calls()).toBe(0);
    });
  });

  describe("cache", () => {
    it("identical reads within the TTL share one request", async () => {
      const f = useFetch(fixtureReply("GetTotals()"));
      const [a, b] = await Promise.all([read.totals(), read.totals()]);
      await read.totals();
      expect(a).toEqual(b);
      expect(f.calls()).toBe(1);
    });

    it("different arguments are cached separately", async () => {
      const f = useFetch(fixtureReply("OpenQuestIDs(0, 20)"), fixtureReply("OpenQuestIDs(20, 20)"));
      await read.openIds(0, 20);
      await read.openIds(20, 20);
      expect(f.calls()).toBe(2);
    });

    it("invalidate() forgets cached reads", async () => {
      const f = useFetch(fixtureReply("GetTotals()"));
      await read.totals();
      invalidate();
      await read.totals();
      expect(f.calls()).toBe(2);
    });

    it("entries expire after 4 seconds", async () => {
      const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      const f = useFetch(fixtureReply("GetTotals()"));
      await read.totals();
      now.mockReturnValue(1_003_999);
      await read.totals();
      expect(f.calls()).toBe(1);
      now.mockReturnValue(1_004_000);
      await read.totals();
      expect(f.calls()).toBe(2);
    });

    it("failures are not cached", async () => {
      const f = useFetch(httpReply(503, {}), fixtureReply("GetTotals()"));
      await readError(read.totals());
      await expect(read.totals()).resolves.toEqual(decodeTotals(R["GetTotals()"].data));
      expect(f.calls()).toBe(2);
    });

    it("timed-out reads are not cached", async () => {
      vi.useFakeTimers();
      const f = useFetch(() => new Promise<Response>(() => {}), fixtureReply("GetTotals()"));
      const first = readError(read.totals());
      await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
      const e = await first;
      expect(e.kind).toBe("network");
      expect(e.message).toBe(`The ${config.networkName} node at ${config.rpcUrl} did not answer in time. Try again in a moment.`);
      await expect(read.totals()).resolves.toEqual(decodeTotals(R["GetTotals()"].data));
      expect(f.calls()).toBe(2);
      expect(vi.getTimerCount()).toBe(0);
    });
    it("a slow failure does not evict a newer cached read", async () => {
      vi.useFakeTimers();
      const f = useFetch(() => new Promise<Response>(() => {}), fixtureReply("GetTotals()"));
      const slow = readError(read.totals()); // hangs; times out at 12 s
      await vi.advanceTimersByTimeAsync(9_000); // its cache entry (4 s) has expired
      await read.totals(); // a newer read succeeds and is cached
      expect(f.calls()).toBe(2);
      await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 9_000);
      expect((await slow).message).toBe(`The ${config.networkName} node at ${config.rpcUrl} did not answer in time. Try again in a moment.`);
      await read.totals(); // 3 s after the newer read: still served from the cache
      expect(f.calls()).toBe(2);
    });
  });

  describe("fresh reads for polling (maxAgeMs)", () => {
    it("a finished read older than maxAgeMs goes to the network again", async () => {
      const now = vi.spyOn(Date, "now").mockReturnValue(2_000_000);
      const f = useFetch(fixtureReply("GetTotals()"));
      await read.totals();
      now.mockReturnValue(2_001_500);
      await read.totals(); // default: within 4 s, cached
      expect(f.calls()).toBe(1);
      await read.totals({ maxAgeMs: 1_000 }); // 1.5 s old: too old for a poll
      expect(f.calls()).toBe(2);
      now.mockReturnValue(2_002_000);
      await read.totals({ maxAgeMs: 1_000 }); // 0.5 s old: shared
      expect(f.calls()).toBe(2);
    });

    it("maxAgeMs 0 always reaches the network once the earlier read has finished", async () => {
      const f = useFetch(fixtureReply("GetQuest(1)"));
      await read.quest(1n);
      await read.quest(1n, { maxAgeMs: 0 });
      await read.quest(1n, { maxAgeMs: 0 });
      expect(f.calls()).toBe(3);
    });

    it("identical reads in flight share one request, whatever their maxAgeMs", async () => {
      let answer!: (r: Response) => void;
      const f = useFetch(() => new Promise<Response>((r) => (answer = r)));
      const a = read.quest(1n);
      const b = read.quest(1n, { maxAgeMs: 0 });
      const c = read.quest(1n, { maxAgeMs: 1_000 });
      expect(f.calls()).toBe(1);
      answer(fixtureReply("GetQuest(1)"));
      const [qa, qb, qc] = await Promise.all([a, b, c]);
      expect(qb).toBe(qa);
      expect(qc).toBe(qa);
    });

    it("a read stuck in flight for 4 s or more is not shared", async () => {
      vi.useFakeTimers();
      const f = useFetch(() => new Promise<Response>(() => {}), fixtureReply("GetTotals()"));
      const stuck = readError(read.totals());
      await vi.advanceTimersByTimeAsync(4_000);
      await read.totals({ maxAgeMs: 1_000 });
      expect(f.calls()).toBe(2);
      await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
      await stuck;
    });

    it("every read takes the option, and quests() passes it on", async () => {
      const f = useFetch(fixtureReply("GetQuest(1)"));
      await read.quests([1n]);
      await read.quests([1n], { maxAgeMs: 0 });
      expect(f.calls()).toBe(2);
    });
  });

  describe("height (GET /status)", () => {
    const status = (h: unknown) => httpReply(200, { jsonrpc: "2.0", id: -1, result: { sync_info: { latest_block_height: h } } });
    const TIMEOUT_MSG = `The ${config.networkName} node at ${config.rpcUrl} did not answer in time. Try again in a moment.`;

    it("returns the latest block height as a bigint from <rpcUrl>/status", async () => {
      const f = useFetch(status("9007199254740993"));
      expect(await read.height()).toBe(9007199254740993n);
      expect(f.sent[0].url).toBe(STATUS_URL);
      expect(f.sent[0].init?.method ?? "GET").toBe("GET");
    });

    it("is cached like the other reads", async () => {
      const f = useFetch(status("12"));
      await read.height();
      await read.height();
      expect(f.calls()).toBe(1);
    });

    it("an unreachable or aborted request is ReadError('network')", async () => {
      useFetch(new TypeError("Failed to fetch"));
      const e = await readError(read.height());
      expect(e.kind).toBe("network");
      expect(e.message).toBe(`Could not reach the ${config.networkName} node at ${config.rpcUrl}.`);
      invalidate();
      useFetch(new DOMException("aborted", "AbortError"));
      expect((await readError(read.height())).kind).toBe("network");
    });

    it("HTTP 403 is ReadError('network') with the 403 message, even if the body has a height", async () => {
      const json = vi.fn(async () => ({ result: { sync_info: { latest_block_height: "54321" } } }));
      useFetch({ ok: false, status: 403, json } as unknown as Response);
      const e = await readError(read.height());
      expect(e.kind).toBe("network");
      expect(e.message).toBe(
        `The node at ${config.rpcUrl} does not allow these read queries (HTTP 403). Set VITE_RPC_URL to a node that does.`,
      );
      expect(json).not.toHaveBeenCalled();
    });

    it("a non-OK HTTP status is ReadError('network') naming the status, even when the body has a height", async () => {
      const json = vi.fn(async () => ({ result: { sync_info: { latest_block_height: "98765" } } }));
      useFetch({ ok: false, status: 503, json } as unknown as Response);
      const e = await readError(read.height());
      expect(e.kind).toBe("network");
      expect(e.message).toBe("The node had a problem (HTTP 503). Try again in a moment.");
      expect(json).not.toHaveBeenCalled();
    });

    it("an error answer from the node is ReadError('network')", async () => {
      useFetch(httpReply(200, { jsonrpc: "2.0", id: -1, error: { code: -32603, message: "Internal error" } }));
      expect((await readError(read.height())).message).toBe("The node did not report its block height.");
    });

    it.each([
      ["not JSON", httpReply(200, null, { notJson: true })],
      ["JSON null", httpReply(200, null)],
      ["a number instead of a string", status(12)],
      ["a negative height", status("-1")],
      ["an empty height", status("")],
      ["a non-numeric height", status("12a")],
      ["no sync_info", httpReply(200, { result: {} })],
    ])("a malformed body (%s) is ReadError('network')", async (_name, res) => {
      useFetch(res);
      const e = await readError(read.height());
      expect(e.kind).toBe("network");
      expect(e.message).toBe("The node did not report its block height.");
    });

    it("passes an AbortSignal and leaves no timer pending when /status answers in time", async () => {
      vi.useFakeTimers();
      const f = useFetch(status("4242"));
      expect(await read.height()).toBe(4242n);
      expect(f.sent[0].init?.signal).toBeInstanceOf(AbortSignal);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("times out at 12000 ms (not 11999 ms) when /status fetch never resolves and does not cache the timeout", async () => {
      vi.useFakeTimers();
      const f = useFetch(() => new Promise<Response>(() => {}), status("7777"));
      let settled = false;
      const first = readError(read.height()).finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      expect(f.sent[0].init?.signal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      const e = await first;
      expect(e.kind).toBe("network");
      expect(e.message).toBe(TIMEOUT_MSG);
      expect(f.sent[0].init?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);

      expect(await read.height()).toBe(7777n);
      expect(f.calls()).toBe(2);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("also times out when /status headers arrive but res.json() never resolves", async () => {
      vi.useFakeTimers();
      const hangingBody = { ok: true, status: 200, json: () => new Promise(() => {}) } as unknown as Response;
      const f = useFetch(hangingBody);
      let settled = false;
      const p = readError(read.height()).finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      const e = await p;
      expect(e.kind).toBe("network");
      expect(e.message).toBe(TIMEOUT_MSG);
      expect(f.sent[0].init?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
