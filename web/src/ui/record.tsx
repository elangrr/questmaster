// Track records in the UI. Records load after the main content, are cached
// per address for the session, and fail quietly (the summary just stays empty).

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import type { Quest } from "../lib/amino";
import {
  builderHeadline,
  builderRecord,
  capped,
  finished,
  latestIds,
  mapLimit,
  posterHeadline,
  posterRecord,
  posterSignal,
  type BuilderRecord,
  type PosterRecord,
} from "../lib/record";
import { read } from "../lib/rpc";

type Role = "poster" | "builder";
type Rec<R extends Role> = R extends "poster" ? PosterRecord : BuilderRecord;

const cache = new Map<string, Promise<PosterRecord | BuilderRecord>>();

async function load(address: string, role: Role): Promise<PosterRecord | BuilderRecord> {
  const total = role === "poster" ? await read.posterCount(address) : await read.builderCount(address);
  const page = role === "poster" ? (o: number, l: number) => read.posterIds(address, o, l) : (o: number, l: number) => read.builderIds(address, o, l);
  const ids = await latestIds(page, total);
  const quests: Quest[] = await mapLimit(ids, 6, (id) => read.quest(id));
  return role === "poster" ? posterRecord(quests, total) : builderRecord(address, quests, total);
}

/** For tests and after a transaction. */
export function forgetRecords(): void {
  cache.clear();
}

export function loadRecord<R extends Role>(address: string, role: R): Promise<Rec<R>> {
  const key = `${role}:${address}`;
  let p = cache.get(key);
  if (!p) {
    p = load(address, role);
    cache.set(key, p);
    p.catch(() => cache.delete(key)); // try again next time
  }
  return p as Promise<Rec<R>>;
}

type State<R extends Role> = { status: "loading" } | { status: "ready"; rec: Rec<R> } | { status: "error" };

/** Loads after first paint, so the page itself never waits for it. */
export function useRecord<R extends Role>(address: string, role: R): State<R> {
  const [s, setS] = useState<State<R>>({ status: "loading" });
  useEffect(() => {
    if (!address) return;
    let live = true;
    setS({ status: "loading" });
    const t = setTimeout(() => {
      loadRecord(address, role).then(
        (rec) => live && setS({ status: "ready", rec }),
        () => live && setS({ status: "error" }),
      );
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [address, role]);
  return s;
}

const latest = (r: PosterRecord | BuilderRecord) => (capped(r) ? ` (latest ${r.examined} of ${r.total})` : "");

/**
 * One line under an address on the quest page: the headline in words, a
 * small mark, and a link to the full record. Its height is reserved, so it
 * appears without moving the page.
 */
export function RecordLine({ address, role }: { address: string; role: Role }) {
  const s = useRecord(address, role);
  const href = `#/address/${address}${role === "builder" ? "?as=builder" : ""}`;
  let body: React.ReactNode = null;
  let mark: "caution" | "good" | null = null;
  if (s.status === "loading") body = <span className="muted">Reading track record…</span>;
  if (s.status === "ready") {
    const r = s.rec;
    const headline = r.role === "poster" ? posterHeadline(r) : builderHeadline(r);
    if (r.role === "poster") mark = posterSignal(r)?.kind ?? null;
    body = headline ? (
      <>
        {mark && (
          <span className={`rec-mark ${mark}`} aria-hidden="true">
            <Icon name={mark === "good" ? "check" : "alert"} />
          </span>
        )}
        <span>
          {headline}
          {latest(r)}
        </span>{" "}
        <a href={href}>Record</a>
      </>
    ) : (
      <span className="muted">No history yet</span>
    );
  }
  return (
    <span className={`rec-line ${mark ?? ""}`} data-record={role}>
      {body}
    </span>
  );
}

/** The calm, factual note a builder sees before claiming. Nothing when there is nothing to say. */
export function PosterNote({ address }: { address: string }) {
  const s = useRecord(address, "poster");
  if (s.status !== "ready") return null;
  const sig = posterSignal(s.rec);
  if (!sig) return null;
  return (
    <p className={`rec-note ${sig.kind}`} data-poster-note={sig.kind}>
      <span className={`rec-mark ${sig.kind}`} aria-hidden="true">
        <Icon name={sig.kind === "good" ? "check" : "alert"} />
      </span>
      <span>
        {sig.text}
        {sig.kind === "caution" && " A poster can turn down work and take the reward back, so consider starting small."}{" "}
        <a href={`#/address/${address}`}>See their record</a>
      </span>
    </p>
  );
}

/** The full record at the top of the address page: both roles. */
export function RecordPanel({ address }: { address: string }) {
  const p = useRecord(address, "poster");
  const b = useRecord(address, "builder");
  return (
    <section className="record" aria-label="Track record">
      <div className="record-card" data-record-card="poster">
        <h2 className="card-title">As poster</h2>
        {p.status === "loading" && <RecordSkeleton />}
        {p.status === "error" && <p className="muted">The record could not be read right now.</p>}
        {p.status === "ready" && <PosterFacts r={p.rec} />}
      </div>
      <div className="record-card" data-record-card="builder">
        <h2 className="card-title">As builder</h2>
        {b.status === "loading" && <RecordSkeleton />}
        {b.status === "error" && <p className="muted">The record could not be read right now.</p>}
        {b.status === "ready" && <BuilderFacts r={b.rec} />}
      </div>
    </section>
  );
}

function RecordSkeleton() {
  return (
    <div aria-hidden="true" className="record-sk">
      <span className="sk sk-line" />
      <span className="sk sk-line short" />
      <span className="sk sk-line" />
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "good" | "caution" }) {
  return (
    <div className={`rec-stat ${tone ?? ""}`}>
      <dt>{label}</dt>
      <dd>{n}</dd>
    </div>
  );
}

function PosterFacts({ r }: { r: PosterRecord }) {
  if (r.total === 0) return <p className="muted">No history yet.</p>;
  const sig = posterSignal(r);
  return (
    <>
      <p className="rec-headline">{posterHeadline(r)}</p>
      {sig && <p className={`rec-note ${sig.kind}`}>{sig.text}</p>}
      <dl className="rec-stats">
        <Stat n={r.total} label="Posted" />
        <Stat n={r.paid} label="Paid" tone={r.paid > 0 ? "good" : undefined} />
        <Stat n={r.open + r.inProgress} label="Open or in progress" />
        <Stat n={r.cancelled} label="Cancelled or refunded" />
        <Stat n={r.rejections} label="Rejections" tone={r.rejections > 0 ? "caution" : undefined} />
        <Stat n={r.refundedAfterReject} label="Refunded after a rejection" tone={r.refundedAfterReject > 0 ? "caution" : undefined} />
      </dl>
      <p className="muted small">
        {capped(r) ? `Counted over the latest ${r.examined} of ${r.total} quests (posted is exact). ` : ""}
        Finished means paid or cancelled ({finished(r)}). A cancelled quest with no rejection was cancelled before anyone delivered, or its builder gave
        it up or missed the deadline. Paid includes quests paid out because the poster did not answer in time; the realm does not store which.
      </p>
    </>
  );
}

function BuilderFacts({ r }: { r: BuilderRecord }) {
  if (r.total === 0) return <p className="muted">No history yet.</p>;
  return (
    <>
      <p className="rec-headline">{builderHeadline(r)}</p>
      <dl className="rec-stats">
        <Stat n={r.total} label="Taken" />
        <Stat n={r.paid} label="Paid" tone={r.paid > 0 ? "good" : undefined} />
        <Stat n={r.inProgress} label="In progress" />
        <Stat n={r.endedWithoutPay} label="Ended without pay" />
      </dl>
      {r.endedWithoutPay > 0 && (
        <p className="small">
          Of the {r.endedWithoutPay} that ended without pay: {r.endedNoRejection} on quests never rejected (so this builder gave them back or missed the
          deadline) and {r.endedOnRejectedQuest} on quests with rejections ({r.endedOnRejectedQuest === 1 ? "it" : "each"} may or may not have been this
          builder's work).
        </p>
      )}
      <p className="muted small">
        {capped(r) ? `Counted over the latest ${r.examined} of ${r.total} quests (taken is exact). ` : ""}
        The realm keeps only the current builder of each quest and how many times it was rejected, not who was rejected. Paid includes rewards
        claimed after the poster stayed silent for the review window.
      </p>
    </>
  );
}

