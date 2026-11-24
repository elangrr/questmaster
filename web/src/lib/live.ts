// Live pages: re-reading the chain on a timer while the tab is visible, and
// telling whether a quest has changed. No React and no DOM globals here, so
// all of it runs under unit tests with fake timers and a fake document.

import type { Quest } from "./amino";

// ---------------------------------------------------------------- pacing

/** Quest page: about one block (rules.blockMillis is about 3.5 s). */
export const QUEST_POLL_MS = 4_000;
/** Board, paid list and address pages: slower, to be kind to the public node. */
export const LIST_POLL_MS = 15_000;
/** Right after the user's own transaction: re-read quickly until the change shows. */
export const AFTER_TX_POLL_MS = 1_000;
/** After this long without seeing the change, say the transaction went through and keep polling at the normal pace. */
export const AFTER_TX_TIMEOUT_MS = 30_000;
/** Polling reads may reuse an identical read started this recently (or still in flight). */
export const POLL_MAX_AGE_MS = 1_000;
/** Longest gap between reads after repeated failures. */
export const MAX_BACKOFF_MS = 60_000;

/** Delay before the next read: the interval, doubled per consecutive failure, up to 8x and MAX_BACKOFF_MS. */
export function nextDelay(intervalMs: number, failures: number): number {
  if (failures <= 0) return intervalMs;
  return Math.min(intervalMs * 2 ** Math.min(failures, 3), Math.max(intervalMs, MAX_BACKOFF_MS));
}

// ---------------------------------------------------------------- poller

/** The parts of `document` the poller needs. */
export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", fn: () => void): void;
  removeEventListener(type: "visibilitychange", fn: () => void): void;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(t: unknown): void;
}

export interface Poller {
  /** Read now (cancels the pending timer); the next read is scheduled after this one ends. */
  poke(): void;
  /** Stop for good. */
  stop(): void;
}

/**
 * Calls tick() every intervalMs while the page is visible, never two at once.
 * A rejected tick counts as a failure and stretches the next delay (see
 * nextDelay); a resolved one resets it. While the page is hidden nothing is
 * scheduled; when it becomes visible again it reads at once.
 */
export function startPoller(
  tick: () => Promise<unknown>,
  intervalMs: number,
  doc: VisibilitySource | null = typeof document !== "undefined" ? document : null,
  timers: Timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) },
): Poller {
  let stopped = false;
  let running = false;
  let again = false; // poke() while a read runs: read once more right after it
  let timer: unknown = null;
  let failures = 0;

  const clear = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    clear();
    if (stopped || running || doc?.hidden) return;
    timer = timers.setTimeout(run, nextDelay(intervalMs, failures));
  };
  const run = () => {
    timer = null;
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    let p: Promise<unknown>;
    try {
      p = Promise.resolve(tick());
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then(
      () => void (failures = 0),
      () => void failures++,
    ).finally(() => {
      running = false;
      if (again && !stopped && !doc?.hidden) {
        again = false;
        run();
      } else {
        again = false;
        schedule();
      }
    });
  };
  const onVisibility = () => {
    if (stopped) return;
    if (doc?.hidden) clear();
    else {
      clear();
      run();
    }
  };
  doc?.addEventListener("visibilitychange", onVisibility);
  schedule();
  return {
    poke() {
      if (stopped) return;
      clear();
      run();
    },
    stop() {
      stopped = true;
      clear();
      doc?.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

// ---------------------------------------------------------------- comparing reads

/** Deep equality for decoded chain data: plain objects, arrays, bigint, strings, numbers, booleans. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => sameValue(v, bb[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameValue((a as any)[k], (b as any)[k]));
}

/**
 * True when a quest read differs in anything a transaction can change
 * (state, builder, link, deadlines, reject count and reason, closing, and the
 * two "can" flags that follow from the height).
 */
export function questChanged(before: Quest, after: Quest): boolean {
  return !sameValue(before, after);
}

/**
 * Guards a page against a read from a node that lags behind: after the page
 * has seen the result of the user's own transaction, a read equal to the
 * quest as it was before the transaction is stale for a while and is ignored.
 */
export interface StaleGuard {
  before: Quest;
  until: number; // ms timestamp
}

export const STALE_GUARD_MS = 30_000;

/** Whether a background read of the quest may replace what the page shows. */
export function acceptQuestRead(next: Quest, guard: StaleGuard | null, now: number): boolean {
  if (!guard || now >= guard.until) return true;
  return questChanged(guard.before, next);
}

// ---------------------------------------------------------------- after a transaction

type WaitOpts = { intervalMs?: number; timeoutMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void>; cancelled?: () => boolean };

/**
 * Re-reads the quest until it differs from `before`; null after timeoutMs.
 * Read failures are retried; they never end the wait early.
 */
export function waitForQuestChange(readQuest: () => Promise<Quest>, before: Quest, opts: WaitOpts = {}): Promise<Quest | null> {
  return waitFor(async () => {
    const q = await readQuest();
    return questChanged(before, q) ? q : null;
  }, opts);
}

/**
 * Calls find() every intervalMs until it returns a value (for example the id
 * of a quest just posted); null after timeoutMs or once cancelled() is true.
 * A failed call is retried. `sleep` and `now` are injectable for tests.
 */
export async function waitFor<T>(find: () => Promise<T | null>, opts: WaitOpts = {}): Promise<T | null> {
  const intervalMs = opts.intervalMs ?? AFTER_TX_POLL_MS;
  const timeoutMs = opts.timeoutMs ?? AFTER_TX_TIMEOUT_MS;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const end = now() + timeoutMs;
  for (;;) {
    if (opts.cancelled?.()) return null;
    try {
      const v = await find();
      if (v !== null) return v;
    } catch {
      /* try again */
    }
    if (now() + intervalMs > end) return null;
    await sleep(intervalMs);
  }
}

// ---------------------------------------------------------------- after posting

export interface PostedQuest {
  poster: string;
  title: string;
  details: string;
  reward: bigint;
  /** The quest was created at or after this block (the transaction's block, or the height when the user pressed the button). */
  minHeight: bigint;
}

/** The id of the quest just posted, found among the poster's newest quests; null if it is not there yet. */
export function findPosted(quests: Quest[], p: PostedQuest): bigint | null {
  let best: bigint | null = null;
  for (const q of quests) {
    if (q.poster !== p.poster || q.title !== p.title || q.details !== p.details || q.reward !== p.reward || q.createdAt < p.minHeight) continue;
    if (best === null || q.id > best) best = q.id;
  }
  return best;
}
