import { useState, type ReactNode } from "react";
import { gnowebPage, pkgStatusPage } from "../config";
import { QuestState, type Quest } from "../lib/amino";
import { approx, gnot, shortAddr, thousands } from "../lib/format";
import { ReadError } from "../lib/rpc";
import { Usd } from "./price";
import { useCountUp } from "./motion";
import { EmptyArt, ErrorArt, SkeletonRows, WaitingArt } from "./visuals";

export function stateLabel(q: Quest): string {
  const base = {
    [QuestState.Open]: "Open",
    [QuestState.Claimed]: "In progress",
    [QuestState.Submitted]: "Waiting for review",
    [QuestState.Paid]: "Paid",
    [QuestState.Cancelled]: "Cancelled",
  }[q.state];
  return q.closing && q.state !== QuestState.Paid && q.state !== QuestState.Cancelled ? `${base} · closing` : base;
}

export function StateBadge({ q }: { q: Quest }) {
  const cls = {
    [QuestState.Open]: "open",
    [QuestState.Claimed]: "progress",
    [QuestState.Submitted]: "review",
    [QuestState.Paid]: "paid",
    [QuestState.Cancelled]: "cancelled",
  }[q.state];
  const closing = q.closing && q.state !== QuestState.Paid && q.state !== QuestState.Cancelled;
  return <span className={`badge badge-${cls}${closing ? " badge-closing" : ""}`}>{stateLabel(q)}</span>;
}

/** A GNOT amount, with the approximate dollar value after it (or under it with usd="block"). */
export function Gnot({ ugnot, usd = "inline" }: { ugnot: bigint; usd?: "inline" | "block" | "none" }) {
  return (
    <>
      <span className="amount">
        {gnot(ugnot)} <span className="unit">GNOT</span>
      </span>
      {usd !== "none" && <Usd ugnot={ugnot} block={usd === "block"} />}
    </>
  );
}

/** A whole number that counts up once on first show (at once under reduced motion). */
export function CountInt({ n }: { n: number | bigint }) {
  const target = Number(n);
  const v = useCountUp(target);
  return <>{v === target ? n.toString() : Math.round(v).toString()}</>;
}

/** A GNOT total that counts up once; ends on the exact value. */
export function CountGnot({ ugnot }: { ugnot: bigint }) {
  const exact = gnot(ugnot);
  const target = Number(ugnot) / 1e6;
  const v = useCountUp(target);
  const decimals = exact.includes(".") ? exact.split(".")[1].length : 0;
  return <>{v === target ? exact : v.toFixed(decimals)}</>;
}

/** An address shown short, with the full value on hover and a link to its quests. */
export function Addr({ a }: { a: string }) {
  if (!a) return <span className="muted">none</span>;
  return (
    <a className="addr" href={`#/address/${a}`} title={a}>
      {shortAddr(a)}
    </a>
  );
}

/**
 * A link from chain data. Shown as a link only when it starts with https://;
 * the visible text is always the full URL; it opens in a new tab without
 * referrer or opener.
 */
export function SafeLink({ url }: { url: string }) {
  if (!url.startsWith("https://")) return <span className="mono wrap">{url}</span>;
  return (
    <a className="mono wrap" href={url} target="_blank" rel="noopener noreferrer nofollow">
      {url}
    </a>
  );
}

/** A skeleton of the coming table, announced as "Loading…" to screen readers. */
export function Loading({ what = "Loading" }: { what?: string }) {
  return (
    <div className="skeleton-wrap" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{what}…</span>
      <SkeletonRows n={5} />
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const notLive = error instanceof ReadError && error.kind === "not-live";
  return (
    <div className={`state-box with-art ${notLive ? "waiting" : "error"}`} role="alert">
      {notLive ? <WaitingArt /> : <ErrorArt />}
      <strong>{notLive ? "Not live yet" : "Could not load this"}</strong>
      <p>{error.message}</p>
      {notLive && (
        <p className="muted">
          {pkgStatusPage() && (
            <>
              <a href={pkgStatusPage()!} target="_blank" rel="noopener noreferrer">
                Official approval status
              </a>{" "}
              ·{" "}
            </>
          )}
          <a href={gnowebPage()} target="_blank" rel="noopener noreferrer">
            gnoweb
          </a>
        </p>
      )}
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="state-box with-art empty">
      <EmptyArt />
      <p>{children}</p>
    </div>
  );
}

export function QuestTable({ quests, show }: { quests: Quest[]; show: "open" | "paid" | "any" }) {
  return (
    <div className="table-wrap">
      <table className="quests">
        <thead>
          <tr>
            <th scope="col" className="num">#</th>
            <th scope="col">Quest</th>
            <th scope="col" className="num hide-sm">Reward</th>
            {show === "open" && <th scope="col" className="hide-sm">Work window</th>}
            {show === "paid" && <th scope="col" className="hide-sm">Builder</th>}
            {show === "any" && <th scope="col" className="hide-sm">State</th>}
            {show !== "paid" && <th scope="col" className="num hide-sm">Rejected</th>}
          </tr>
        </thead>
        <tbody>
          {quests.map((q, i) => (
            <tr key={q.id.toString()} style={{ ["--r" as string]: i }}>
              <td className="num muted">{q.id.toString()}</td>
              <td className="title-cell">
                <a href={`#/quest/${q.id}`}>{q.title}</a>
                {/* Phones: reward and state under the title, so the title gets the full width. */}
                <span className="cell-meta show-sm">
                  <Gnot ugnot={q.reward} />
                  {show === "any" && <StateBadge q={q} />}
                </span>
              </td>
              <td className="num hide-sm">
                <Gnot ugnot={q.reward} usd="block" />
              </td>
              {show === "open" && <td className="hide-sm muted nowrap" title={approx(q.workBlocks)}>{thousands(q.workBlocks)} blocks</td>}
              {show === "paid" && (
                <td className="hide-sm">
                  <Addr a={q.builder} />
                </td>
              )}
              {show === "any" && (
                <td className="hide-sm">
                  <StateBadge q={q} />
                </td>
              )}
              {show !== "paid" && <td className="num hide-sm muted">{q.rejectCount}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, total, pageSize, base }: { page: number; total: number; pageSize: number; base: string }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  const sep = base.includes("?") ? "&" : "?";
  return (
    <nav className="pager" aria-label="Pages">
      {page > 1 ? <a className="btn" href={`#${base}${sep}page=${page - 1}`}>← Newer</a> : <span />}
      <span className="muted">
        Page {page} of {last}
      </span>
      {page < last ? <a className="btn" href={`#${base}${sep}page=${page + 1}`}>Older →</a> : <span />}
    </nav>
  );
}

export function CopyButton({ text, label = "Copy", name }: { text: string; label?: string; name?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn-small"
      aria-label={name ? `${done ? "Copied" : label}: ${name}` : undefined}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => undefined,
        );
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

/** Text from the chain, shown as plain text with its line breaks. */
export function PlainText({ text }: { text: string }) {
  return <div className="plain">{text}</div>;
}
