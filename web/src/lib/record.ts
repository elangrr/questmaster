// Track records for posters and builders, derived only from what the realm
// stores today: the quest ids per address and each quest's current state.
//
// What the realm keeps, and so what can be known:
// - every quest's current state, its reject count and its CURRENT builder;
// - per address, the quests it posted and the quests it ever claimed.
// What it does not keep: who the builder was at each rejection, and whether a
// builder's turn ended by giving the quest back, missing the deadline or being
// rejected (a reject clears the builder, exactly like giving it back).
// Whether a paid quest was approved or paid out after the review window is
// not stored either (only the chain's events say so).

import { QuestState, type Quest } from "./amino";

/** How many of an address's latest quests a record looks at. */
export const RECORD_CAP = 100;
/** The realm returns at most this many ids per page. */
export const ID_PAGE = 50;

export interface PosterRecord {
  role: "poster";
  /** Quests ever posted (exact, from CountByPoster). */
  total: number;
  /** How many of the latest were read; < total means "latest N". */
  examined: number;
  paid: number;
  open: number;
  inProgress: number;
  cancelled: number;
  /** Cancelled quests that had at least one rejection: the reward went back to the poster after work was turned down. */
  refundedAfterReject: number;
  /** Sum of reject counts over the examined quests. */
  rejections: number;
  /** Quests with at least one rejection. */
  questsWithRejections: number;
}

export interface BuilderRecord {
  role: "builder";
  /** Quests ever claimed (exact, from CountByBuilder). */
  total: number;
  examined: number;
  /** Paid quests where this address is the builder (approved or paid after the review window). */
  paid: number;
  /** Claimed or submitted now by this address. */
  inProgress: number;
  /**
   * Quests this address claimed whose current builder is someone else or
   * nobody: their turn ended without pay (gave it back, missed the work
   * deadline, or the work was rejected; the realm does not record which).
   */
  endedWithoutPay: number;
  /** Of those, quests that were never rejected at all: so this turn ended by giving it back or missing the deadline. */
  endedNoRejection: number;
  /** Of those, quests with rejections: this builder may or may not be the one who was rejected. */
  endedOnRejectedQuest: number;
}

export function posterRecord(quests: Quest[], total: number): PosterRecord {
  const r: PosterRecord = {
    role: "poster",
    total,
    examined: quests.length,
    paid: 0,
    open: 0,
    inProgress: 0,
    cancelled: 0,
    refundedAfterReject: 0,
    rejections: 0,
    questsWithRejections: 0,
  };
  for (const q of quests) {
    r.rejections += q.rejectCount;
    if (q.rejectCount > 0) r.questsWithRejections++;
    switch (q.state) {
      case QuestState.Paid:
        r.paid++;
        break;
      case QuestState.Open:
        r.open++;
        break;
      case QuestState.Claimed:
      case QuestState.Submitted:
        r.inProgress++;
        break;
      case QuestState.Cancelled:
        r.cancelled++;
        if (q.rejectCount > 0) r.refundedAfterReject++;
        break;
    }
  }
  return r;
}

export function builderRecord(address: string, quests: Quest[], total: number): BuilderRecord {
  const r: BuilderRecord = { role: "builder", total, examined: quests.length, paid: 0, inProgress: 0, endedWithoutPay: 0, endedNoRejection: 0, endedOnRejectedQuest: 0 };
  for (const q of quests) {
    const current = q.builder === address;
    if (current && q.state === QuestState.Paid) r.paid++;
    else if (current && (q.state === QuestState.Claimed || q.state === QuestState.Submitted)) r.inProgress++;
    else {
      r.endedWithoutPay++;
      if (q.rejectCount === 0) r.endedNoRejection++;
      else r.endedOnRejectedQuest++;
    }
  }
  return r;
}

/** Finished = paid or cancelled. */
export const finished = (r: PosterRecord) => r.paid + r.cancelled;

/** True when the record looked at fewer quests than the address has. */
export const capped = (r: PosterRecord | BuilderRecord) => r.examined < r.total;

/** The two numbers that matter most, in words. Null for an address with no history. */
export function posterHeadline(r: PosterRecord): string | null {
  if (r.total === 0) return null;
  const parts: string[] = [];
  const f = finished(r);
  parts.push(f === 0 ? "No finished quests yet" : `Paid ${r.paid} of ${f} finished ${f === 1 ? "quest" : "quests"}`);
  parts.push(r.rejections === 0 ? "never rejected work" : `rejected work ${times(r.rejections)}`);
  return parts.join(" · ");
}

export function builderHeadline(r: BuilderRecord): string | null {
  if (r.total === 0) return null;
  const parts = [`Paid for ${r.paid} of ${r.total} ${r.total === 1 ? "quest" : "quests"} taken`];
  if (r.inProgress > 0) parts.push(`${r.inProgress} in progress`);
  if (r.endedWithoutPay > 0) parts.push(`${r.endedWithoutPay} ended without pay`);
  return parts.join(" · ");
}

export function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
}

/** What a builder about to claim should see; null when there is nothing to say. */
export function posterSignal(r: PosterRecord): { kind: "caution" | "good"; text: string } | null {
  if (r.total === 0) return null;
  if (r.rejections > 0 || r.refundedAfterReject > 0) {
    let text = `This poster has rejected work ${times(r.rejections)}`;
    if (r.questsWithRejections > 1) text += ` on ${r.questsWithRejections} quests`;
    if (r.refundedAfterReject > 0)
      text += `, and ${r.refundedAfterReject === 1 ? "one quest was" : `${r.refundedAfterReject} quests were`} refunded to them after a rejection`;
    return { kind: "caution", text: text + "." };
  }
  if (r.paid > 0) return { kind: "good", text: `This poster has paid ${r.paid === 1 ? "one quest" : `${r.paid} quests`} and never rejected work.` };
  return null;
}

/** The ids of an address's latest quests, in pages of ID_PAGE, at most `cap`. */
export async function latestIds(page: (offset: number, limit: number) => Promise<bigint[]>, total: number, cap = RECORD_CAP): Promise<bigint[]> {
  const want = Math.min(total, cap);
  const out: bigint[] = [];
  while (out.length < want) {
    const got = await page(out.length, Math.min(ID_PAGE, want - out.length));
    if (got.length === 0) break;
    out.push(...got);
  }
  return out.slice(0, want);
}

/** Runs `fn` over items with at most `n` at a time, keeping order. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}
