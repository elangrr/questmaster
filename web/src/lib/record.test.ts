import { describe, expect, it, vi } from "vitest";
import { QuestState, type Quest } from "./amino";
import {
  builderHeadline,
  builderRecord,
  capped,
  ID_PAGE,
  latestIds,
  mapLimit,
  posterHeadline,
  posterRecord,
  posterSignal,
  RECORD_CAP,
} from "./record";

const POSTER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ME = "g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj";
const OTHER = "g1u7y667z64x2h7vc6fmpcprgey4ck233jaww9zq";

let next = 1n;
function q(state: QuestState, rejectCount = 0, builder = ""): Quest {
  return {
    id: next++,
    poster: POSTER,
    title: "t",
    details: "",
    reward: 1_000_000n,
    state,
    builder,
    workLink: "",
    workBlocks: 1000n,
    createdAt: 0n,
    claimedAt: 0n,
    submittedAt: 0n,
    workDeadline: 0n,
    reviewDeadline: 0n,
    rejectCount,
    lastRejectReason: rejectCount ? "no" : "",
    closing: false,
    canRelease: false,
    canClaimPayout: false,
  };
}

describe("poster record", () => {
  it("counts states, rejections and refunds after a rejection", () => {
    const quests = [
      q(QuestState.Paid, 0, OTHER),
      q(QuestState.Paid, 1, OTHER), // rejected once, then paid
      q(QuestState.Cancelled, 2), // rejected twice, then refunded: the troll pattern
      q(QuestState.Cancelled, 0), // cancelled while open
      q(QuestState.Open, 0),
      q(QuestState.Claimed, 0, OTHER),
      q(QuestState.Submitted, 0, OTHER),
    ];
    const r = posterRecord(quests, 7);
    expect(r).toMatchObject({ total: 7, examined: 7, paid: 2, open: 1, inProgress: 2, cancelled: 2, refundedAfterReject: 1, rejections: 3, questsWithRejections: 2 });
    expect(capped(r)).toBe(false);
    expect(posterHeadline(r)).toBe("Paid 2 of 4 finished quests · rejected work 3 times");
    expect(posterSignal(r)).toEqual({
      kind: "caution",
      text: "This poster has rejected work 3 times on 2 quests, and one quest was refunded to them after a rejection.",
    });
  });

  it("gives a positive mark for paid quests and no rejections", () => {
    const r = posterRecord([q(QuestState.Paid, 0, OTHER), q(QuestState.Open)], 2);
    expect(posterHeadline(r)).toBe("Paid 1 of 1 finished quest · never rejected work");
    expect(posterSignal(r)).toEqual({ kind: "good", text: "This poster has paid one quest and never rejected work." });
  });

  it("says nothing good or bad about a poster with no finished quests", () => {
    const r = posterRecord([q(QuestState.Open), q(QuestState.Claimed, 0, OTHER)], 2);
    expect(posterHeadline(r)).toBe("No finished quests yet · never rejected work");
    expect(posterSignal(r)).toBeNull();
  });

  it("a single rejection reads as 'once'", () => {
    const r = posterRecord([q(QuestState.Open, 1)], 1);
    expect(posterSignal(r)?.text).toBe("This poster has rejected work once.");
  });

  it("has no history for a new address (not zeros)", () => {
    const r = posterRecord([], 0);
    expect(posterHeadline(r)).toBeNull();
    expect(posterSignal(r)).toBeNull();
  });

  it("knows when it is capped", () => {
    const r = posterRecord([q(QuestState.Paid, 0, OTHER)], 250);
    expect(capped(r)).toBe(true);
    expect(r.total).toBe(250);
    expect(r.examined).toBe(1);
  });
});

describe("builder record", () => {
  it("separates paid, in progress and turns that ended without pay", () => {
    const quests = [
      q(QuestState.Paid, 0, ME), // paid to me
      q(QuestState.Paid, 0, OTHER), // I gave it up; someone else was paid
      q(QuestState.Submitted, 0, ME), // in progress
      q(QuestState.Open, 0), // I gave it up or missed the deadline (never rejected)
      q(QuestState.Open, 1), // reopened after a rejection: maybe mine, maybe not
      q(QuestState.Cancelled, 2), // refunded after rejections: maybe mine
    ];
    const r = builderRecord(ME, quests, 6);
    expect(r).toMatchObject({ total: 6, examined: 6, paid: 1, inProgress: 1, endedWithoutPay: 4, endedNoRejection: 2, endedOnRejectedQuest: 2 });
    expect(builderHeadline(r)).toBe("Paid for 1 of 6 quests taken · 1 in progress · 4 ended without pay");
  });

  it("a builder paid for everything", () => {
    const r = builderRecord(ME, [q(QuestState.Paid, 0, ME)], 1);
    expect(builderHeadline(r)).toBe("Paid for 1 of 1 quest taken");
  });

  it("has no history for a new address", () => {
    expect(builderHeadline(builderRecord(ME, [], 0))).toBeNull();
  });
});

describe("latestIds / mapLimit", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => BigInt(n - i));
  const pager = (all: bigint[]) => vi.fn(async (offset: number, limit: number) => all.slice(offset, offset + Math.min(limit, ID_PAGE)));

  it("reads in pages of 50 and stops at the cap", async () => {
    const all = ids(230);
    const page = pager(all);
    const got = await latestIds(page, 230);
    expect(got).toHaveLength(RECORD_CAP);
    expect(got[0]).toBe(230n);
    expect(page.mock.calls).toEqual([
      [0, 50],
      [50, 50],
    ]);
  });

  it("reads exactly what exists below the cap", async () => {
    const page = pager(ids(7));
    expect(await latestIds(page, 7)).toEqual(ids(7));
    expect(page).toHaveBeenCalledTimes(1);
    const none = pager([]);
    expect(await latestIds(none, 0)).toEqual([]);
    expect(none).not.toHaveBeenCalled();
  });

  it("stops if the chain returns fewer ids than counted", async () => {
    const page = pager(ids(60));
    expect(await latestIds(page, 80)).toHaveLength(60);
  });

  it("keeps order and limits concurrency", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5 - (n % 3)));
      running--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(peak).toBe(3);
  });
});
