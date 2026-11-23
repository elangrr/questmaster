import { describe, expect, it } from "vitest";
import fx from "../__fixtures__/gnodev-qeval-json.json";
import printed from "../__fixtures__/gnodev-qeval.json";
import { decodeIds, decodeInt, decodeQuest, decodeTotals, DecodeError, QuestState } from "./amino";

const R = fx.responses as Record<string, { data: string; error: unknown }>;
const body = (k: string) => {
  const r = R[k];
  if (!r) throw new Error("missing fixture " + k);
  return r.data;
};

// The exact strings the seed script (web/e2e/seed-txs.mjs) posted.
const HOSTILE_TITLE = 'He said "hi" \\o/ (a, b) {x} ünï 日本 <b>$x$</b> @alice';
const HOSTILE_DETAILS =
  'Line one with "quotes" and \\backslash\\\n(struct{("fake" string)} x) , } { ]\n<script>alert(1)</script> [link](https://e.vil) ![i](https://e.vil/i.png)\ng1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 tabs\there';
const HOSTILE_REASON = 'Missing "tests"\nand a \\ backslash, (paren) {brace}';

describe("decodeQuest (real gnodev responses)", () => {
  it("paid quest", () => {
    const q = decodeQuest(body("GetQuest(1)"));
    expect(q.id).toBe(1n);
    expect(q.title).toBe("Translate the README to Indonesian");
    expect(q.details).toBe("Keep the headings.\nUse plain words.");
    expect(q.reward).toBe(2_500_000n);
    expect(q.state).toBe(QuestState.Paid);
    expect(q.poster).toBe("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
    expect(q.builder).toBe("g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj");
    expect(q.workLink).toBe("https://github.com/example/questmaster/pull/7");
    expect(q.workBlocks).toBe(20_000n);
    expect(q.closing).toBe(false);
  });

  it("cancelled quest with empty details", () => {
    const q = decodeQuest(body("GetQuest(2)"));
    expect(q.state).toBe(QuestState.Cancelled);
    expect(q.details).toBe("");
    expect(q.builder).toBe("");
  });

  it("claimed and submitted quests carry deadlines", () => {
    const c = decodeQuest(body("GetQuest(3)"));
    expect(c.state).toBe(QuestState.Claimed);
    expect(c.workDeadline).toBe(c.claimedAt + c.workBlocks);
    expect(c.reviewDeadline).toBe(0n);
    const s = decodeQuest(body("GetQuest(4)"));
    expect(s.state).toBe(QuestState.Submitted);
    expect(s.reviewDeadline).toBe(s.submittedAt + 172_800n);
    expect(s.workLink).toBe("https://github.com/example/questmaster/pull/9");
  });

  it("closing quest", () => {
    const q = decodeQuest(body("GetQuest(5)"));
    expect(q.state).toBe(QuestState.Claimed);
    expect(q.closing).toBe(true);
    expect(q.builder).toBe("g1u7y667z64x2h7vc6fmpcprgey4ck233jaww9zq");
    expect(q.workLink).toBe(""); // printed form shows this as "( string)"
  });

  it("closed and refunded quest", () => {
    const q = decodeQuest(body("GetQuest(6)"));
    expect(q.state).toBe(QuestState.Cancelled);
    expect(q.closing).toBe(true);
    expect(q.builder).toBe("");
  });

  it("hostile text survives exactly: quotes, backslashes, unicode, newlines, tabs, parentheses, commas, braces", () => {
    const q = decodeQuest(body("GetQuest(7)"));
    expect(q.title).toBe(HOSTILE_TITLE);
    expect(q.details).toBe(HOSTILE_DETAILS);
    expect(q.lastRejectReason).toBe(HOSTILE_REASON);
    expect(q.rejectCount).toBe(1);
    expect(q.state).toBe(QuestState.Open);
    expect(q.reward).toBe(1_234_567n);
    expect(q.workLink).toBe("");
  });

  it("open quest from the second poster", () => {
    const q = decodeQuest(body("GetQuest(31)"));
    expect(q.title).toBe("Small task 24");
    expect(q.reward).toBe(1_240_000n);
    expect(q.workBlocks).toBe(1_000n);
  });
});

describe("decodeTotals, decodeIds, decodeInt", () => {
  it("totals", () => {
    const t = decodeTotals(body("GetTotals()"));
    expect(t).toEqual({
      quests: 31n,
      openQuests: 25,
      posted: 2_500_000n + 1_000_000n + 3_000_000n + 5_000_000n + 2_000_000n + 1_500_000n + 1_234_567n + 24n * 1_000_000n + 10_000n * 300n,
      locked: 3_000_000n + 5_000_000n + 2_000_000n + 1_234_567n + 24n * 1_000_000n + 10_000n * 300n,
      paid: 2_500_000n,
      refunded: 2_500_000n,
      paidQuests: 1,
    });
    expect(t.posted).toBe(t.locked + t.paid + t.refunded);
  });

  it("id lists, newest first, with paging and an empty page", () => {
    const p1 = decodeIds(body("OpenQuestIDs(0, 20)"));
    expect(p1.length).toBe(20);
    expect(p1[0]).toBe(31n);
    const p2 = decodeIds(body("OpenQuestIDs(20, 20)"));
    expect(p2).toEqual([11n, 10n, 9n, 8n, 7n]);
    expect(decodeIds(body("OpenQuestIDs(40, 20)"))).toEqual([]);
    expect(decodeIds(body("PaidQuestIDs(0, 20)"))).toEqual([1n]);
    expect(decodeIds(body('QuestIDsByBuilder(address("g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj"), 0, 20)'))).toEqual([7n, 6n, 4n, 3n, 1n]);
  });

  it("ints, including an omitted zero", () => {
    expect(decodeInt(body('CountByPoster(address("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5"))'))).toBe(7);
    expect(decodeInt(body('CountByBuilder(address("g1rzuwh5frve732k4futyw45y78rzuty4626zy6h"))'))).toBe(0);
  });
});

describe("strictness", () => {
  const quest = body("GetQuest(4)");
  const mutate = (f: (o: any) => void) => {
    const o = JSON.parse(quest);
    f(o);
    return JSON.stringify(o);
  };
  it("rejects a different type", () => {
    expect(() => decodeQuest(body("GetTotals()"))).toThrow(DecodeError);
    expect(() => decodeTotals(quest)).toThrow(DecodeError);
    expect(() => decodeIds(quest)).toThrow(DecodeError);
  });
  it("rejects a missing or extra field", () => {
    expect(() => decodeQuest(mutate((o) => o.results[0].V.Fields.pop()))).toThrow(/19/);
    expect(() => decodeQuest(mutate((o) => o.results[0].V.Fields.push(o.results[0].V.Fields[0])))).toThrow(/19/);
  });
  it("rejects a field of the wrong kind", () => {
    expect(() => decodeQuest(mutate((o) => (o.results[0].V.Fields[2].T.value = "1024")))).toThrow(/Title/);
  });
  it("rejects a malformed address and a bad number", () => {
    expect(() => decodeQuest(mutate((o) => (o.results[0].V.Fields[1].V.value = "g1evil")))).toThrow(/Poster/);
    expect(() => decodeQuest(mutate((o) => (o.results[0].V.Fields[4].N = "AAAA")))).toThrow(/Reward/);
    expect(() => decodeQuest(mutate((o) => (o.results[0].V.Fields[5].N = "CQAAAAAAAAA=")))).toThrow(/State/);
  });
  it("rejects non-JSON and several results", () => {
    expect(() => decodeTotals("(struct{} x)")).toThrow(DecodeError);
    expect(() => decodeInt(JSON.stringify({ results: [{}, {}] }))).toThrow(/1 result/);
  });
  it("decodes signed values", () => {
    const neg = mutate((o) => (o.results[0].V.Fields[4].N = btoa(String.fromCharCode(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff))));
    expect(decodeQuest(neg).reward).toBe(-1n);
  });
});

describe("why not the printed qeval form", () => {
  it("prints an empty string in two different ways", () => {
    const p = printed as Record<string, { data: string }>;
    expect(p["GetQuest(5)"].data).toContain("( string)");
    expect(p["GetQuest(7)"].data).toContain('("" string)');
  });
});
