import { useState, type ReactNode } from "react";
import { gnowebPage, pkgStatusPage } from "../config";
import { QuestState, type Quest } from "../lib/amino";
import { approx, gnot, shortAddr, thousands } from "../lib/format";
import { ReadError } from "../lib/rpc";

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
  return <span className={`badge badge-${cls}`}>{stateLabel(q)}</span>;
}

export function Gnot({ ugnot }: { ugnot: bigint }) {
  return (
    <span className="amount">
      {gnot(ugnot)} <span className="unit">GNOT</span>
    </span>
  );
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

export function Loading({ what = "Loading" }: { what?: string }) {
  return (
    <div className="state-box" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {what}…
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const notLive = error instanceof ReadError && error.kind === "not-live";
  return (
    <div className={`state-box ${notLive ? "waiting" : "error"}`} role="alert">
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
  return <div className="state-box empty">{children}</div>;
}

export function QuestTable({ quests, show }: { quests: Quest[]; show: "open" | "paid" | "any" }) {
  return (
    <div className="table-wrap">
      <table className="quests">
        <thead>
          <tr>
            <th scope="col" className="num">#</th>
            <th scope="col">Quest</th>
            <th scope="col" className="num">Reward</th>
            {show === "open" && <th scope="col" className="hide-sm">Work window</th>}
            {show === "paid" && <th scope="col" className="hide-sm">Builder</th>}
            {show === "any" && <th scope="col">State</th>}
            {show !== "paid" && <th scope="col" className="num hide-sm">Rejected</th>}
          </tr>
        </thead>
        <tbody>
          {quests.map((q) => (
            <tr key={q.id.toString()}>
              <td className="num muted">{q.id.toString()}</td>
              <td className="title-cell">
                <a href={`#/quest/${q.id}`}>{q.title}</a>
              </td>
              <td className="num">
                <Gnot ugnot={q.reward} />
              </td>
              {show === "open" && <td className="hide-sm muted nowrap" title={approx(q.workBlocks)}>{thousands(q.workBlocks)} blocks</td>}
              {show === "paid" && (
                <td className="hide-sm">
                  <Addr a={q.builder} />
                </td>
              )}
              {show === "any" && (
                <td>
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

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn-small"
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
