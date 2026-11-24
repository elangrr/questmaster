import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestState, type Quest } from "./amino";
import {
  acceptQuestRead,
  AFTER_TX_TIMEOUT_MS,
  findPosted,
  MAX_BACKOFF_MS,
  nextDelay,
  questChanged,
  sameValue,
  startPoller,
  waitFor,
  waitForQuestChange,
  type VisibilitySource,
} from "./live";

const POSTER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const BUILDER = "g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj";

function quest(over: Partial<Quest> = {}): Quest {
  return {
    id: 4n,
    poster: POSTER,
    title: "Add a dark theme",
    details: "",
    reward: 5_000_000n,
    state: QuestState.Claimed,
    builder: BUILDER,
    workLink: "",
    workBlocks: 20_000n,
    createdAt: 10n,
    claimedAt: 12n,
    submittedAt: 0n,
    workDeadline: 20_012n,
    reviewDeadline: 0n,
    rejectCount: 0,
    lastRejectReason: "",
    closing: false,
    canRelease: false,
    canClaimPayout: false,
    ...over,
  };
}

/** A document stand-in whose visibility the test controls. */
function fakeDoc(hidden = false) {
  const fns = new Set<() => void>();
  const doc: VisibilitySource & { set(h: boolean): void; listeners(): number } = {
    hidden,
    addEventListener: (_t, fn) => void fns.add(fn),
    removeEventListener: (_t, fn) => void fns.delete(fn),
    set(h: boolean) {
      (doc as { hidden: boolean }).hidden = h;
      fns.forEach((f) => f());
    },
    listeners: () => fns.size,
  };
  return doc;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("nextDelay", () => {
  it("is the interval while reads succeed, and stretches after failures up to 8x", () => {
    expect(nextDelay(4_000, 0)).toBe(4_000);
    expect(nextDelay(4_000, 1)).toBe(8_000);
    expect(nextDelay(4_000, 2)).toBe(16_000);
    expect(nextDelay(4_000, 3)).toBe(32_000);
    expect(nextDelay(4_000, 9)).toBe(32_000);
  });
  it("never waits longer than a minute (unless the interval itself is longer)", () => {
    expect(nextDelay(15_000, 3)).toBe(MAX_BACKOFF_MS);
    expect(nextDelay(90_000, 2)).toBe(90_000);
  });
});

describe("startPoller", () => {
  it("reads every interval while the page is visible, one read at a time", async () => {
    vi.useFakeTimers();
    let running = 0;
    let most = 0;
    const tick = vi.fn(async () => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 3_000)); // a slow read
      running--;
    });
    const p = startPoller(tick, 4_000, fakeDoc());
    expect(tick).toHaveBeenCalledTimes(0); // the page has just loaded: no immediate read
    await vi.advanceTimersByTimeAsync(4_000);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000 + 4_000); // the next one starts 4 s after the slow one ended
    expect(tick).toHaveBeenCalledTimes(2);
    p.poke(); // while a read runs: one more right after it, never two at once
    await vi.advanceTimersByTimeAsync(3_000);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(most).toBe(1);
    p.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it("pauses while the tab is hidden and reads at once when it is visible again", async () => {
    vi.useFakeTimers();
    const doc = fakeDoc();
    const tick = vi.fn(async () => {});
    const p = startPoller(tick, 4_000, doc);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(tick).toHaveBeenCalledTimes(1);
    doc.set(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(1);
    doc.set(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(tick).toHaveBeenCalledTimes(3);
    p.stop();
    expect(doc.listeners()).toBe(0);
  });

  it("does not start while the tab is hidden", async () => {
    vi.useFakeTimers();
    const tick = vi.fn(async () => {});
    const p = startPoller(tick, 4_000, fakeDoc(true));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(tick).not.toHaveBeenCalled();
    p.stop();
  });

  it("backs off after failed reads and returns to the interval after a good one", async () => {
    vi.useFakeTimers();
    let fail = true;
    const tick = vi.fn(async () => {
      if (fail) throw new Error("node down");
    });
    const p = startPoller(tick, 4_000, fakeDoc());
    await vi.advanceTimersByTimeAsync(4_000); // 1st read fails
    await vi.advanceTimersByTimeAsync(7_999);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // 8 s later: 2nd read fails
    expect(tick).toHaveBeenCalledTimes(2);
    fail = false;
    await vi.advanceTimersByTimeAsync(16_000); // 3rd read succeeds
    expect(tick).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(tick).toHaveBeenCalledTimes(4);
    p.stop();
  });

  it("survives a tick that throws synchronously", async () => {
    vi.useFakeTimers();
    const tick = vi.fn((): Promise<void> => {
      throw new Error("boom");
    });
    const p = startPoller(tick, 1_000, fakeDoc());
    await vi.advanceTimersByTimeAsync(1_000 + 2_000);
    expect(tick).toHaveBeenCalledTimes(2);
    p.stop();
  });

  it("works without a document (no visibility events)", async () => {
    vi.useFakeTimers();
    const tick = vi.fn(async () => {});
    const p = startPoller(tick, 1_000, null);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(tick).toHaveBeenCalledTimes(3);
    p.stop();
  });
});

describe("sameValue and questChanged", () => {
  it("compares decoded data deeply, bigint included", () => {
    expect(sameValue({ a: [1n, 2n], b: "x" }, { a: [1n, 2n], b: "x" })).toBe(true);
    expect(sameValue({ a: [1n, 2n] }, { a: [1n, 3n] })).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameValue([1], { 0: 1 })).toBe(false);
    expect(sameValue(null, {})).toBe(false);
    expect(sameValue(1n, 1)).toBe(false);
  });

  it("sees every change a transaction can make to a quest", () => {
    const q = quest();
    expect(questChanged(q, quest())).toBe(false);
    for (const over of [
      { state: QuestState.Submitted },
      { builder: "" },
      { workLink: "https://example.com/x" },
      { rejectCount: 1 },
      { lastRejectReason: "No" },
      { closing: true },
      { workDeadline: 20_013n },
      { reviewDeadline: 9n },
      { canRelease: true },
    ] as Partial<Quest>[])
      expect(questChanged(q, quest(over)), JSON.stringify(Object.keys(over))).toBe(true);
  });
});

describe("acceptQuestRead (lagging nodes)", () => {
  const before = quest({ state: QuestState.Submitted });
  const after = quest({ state: QuestState.Paid });
  it("ignores a read equal to the quest before the transaction while the guard holds", () => {
    const guard = { before, until: 30_000 };
    expect(acceptQuestRead(quest({ state: QuestState.Submitted }), guard, 10_000)).toBe(false);
    expect(acceptQuestRead(after, guard, 10_000)).toBe(true);
  });
  it("accepts everything without a guard or once it has expired", () => {
    expect(acceptQuestRead(before, null, 0)).toBe(true);
    expect(acceptQuestRead(before, { before, until: 30_000 }, 30_000)).toBe(true);
  });
});

/** A clock for the wait loops: sleep() moves time forward instantly. */
function clock() {
  let t = 1_000_000;
  return { now: () => t, sleep: async (ms: number) => void (t += ms), elapsed: () => t - 1_000_000 };
}

describe("waitForQuestChange", () => {
  it("keeps reading until the quest differs, retrying failed reads", async () => {
    const c = clock();
    const before = quest();
    const reads = [before, new Error("node lag"), before, quest({ state: QuestState.Submitted, workLink: "https://x.example" })];
    const readQuest = vi.fn(async () => {
      const r = reads.shift()!;
      if (r instanceof Error) throw r;
      return r;
    });
    const got = await waitForQuestChange(readQuest, before, { intervalMs: 1_000, now: c.now, sleep: c.sleep });
    expect(got?.state).toBe(QuestState.Submitted);
    expect(readQuest).toHaveBeenCalledTimes(4);
    expect(c.elapsed()).toBe(3_000);
  });

  it("gives up with null after the timeout (30 s by default)", async () => {
    const c = clock();
    const before = quest();
    const readQuest = vi.fn(async () => before);
    expect(await waitForQuestChange(readQuest, before, { now: c.now, sleep: c.sleep })).toBeNull();
    expect(c.elapsed()).toBeLessThanOrEqual(AFTER_TX_TIMEOUT_MS);
    expect(readQuest.mock.calls.length).toBeGreaterThanOrEqual(30);
  });

  it("stops when cancelled (the page went away)", async () => {
    const c = clock();
    let n = 0;
    const before = quest();
    expect(await waitForQuestChange(async () => (n++, before), before, { now: c.now, sleep: c.sleep, cancelled: () => n >= 2 })).toBeNull();
    expect(n).toBe(2);
  });
});

describe("waitFor", () => {
  it("returns the first value found", async () => {
    const c = clock();
    const found = [null, null, 35n];
    expect(await waitFor(async () => found.shift() ?? null, { intervalMs: 500, now: c.now, sleep: c.sleep })).toBe(35n);
    expect(c.elapsed()).toBe(1_000);
  });
});

describe("findPosted", () => {
  const want = { poster: POSTER, title: "Add a dark theme", details: "", reward: 5_000_000n, minHeight: 10n };
  it("finds the newest matching quest created at or after the transaction's block", () => {
    const old = quest({ id: 3n, createdAt: 2n }); // the same quest posted earlier
    const mine = quest({ id: 9n, createdAt: 11n });
    expect(findPosted([mine, old], want)).toBe(9n);
    expect(findPosted([old], want)).toBeNull();
  });
  it("ignores quests by someone else or with other text or reward", () => {
    for (const over of [{ poster: BUILDER }, { title: "Other" }, { details: "x" }, { reward: 1n }] as Partial<Quest>[])
      expect(findPosted([quest({ id: 9n, createdAt: 11n, ...over })], want)).toBeNull();
  });
});
