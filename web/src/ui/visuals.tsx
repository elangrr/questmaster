// Inline SVG visuals: the mark, the quest-flow diagram, the quest stepper,
// deadline bars, skeletons and small illustrations. Pure SVG + CSS; every
// animation rests under prefers-reduced-motion (see styles.css).

import { useRef, useState } from "react";
import { Icon } from "./icons";
import { QuestState, type Quest } from "../lib/amino";
import { approx, thousands, timeLeft } from "../lib/format";
import { useInView, usePageVisible } from "./motion";

/** The QuestMaster mark: a notice board hanging from a peg, with a pinned quest. */
export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--brand)" />
      <path d="M16 5.5v3.2" stroke="var(--brand-ink)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 11.5 16 8.7l6.5 2.8" fill="none" stroke="var(--brand-ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="7.5" y="11.5" width="17" height="13" rx="2.2" fill="var(--brand-ink)" />
      <path d="m12.2 18.2 2.6 2.6 5-5.2" fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="5" r="1.6" fill="var(--amber)" />
    </svg>
  );
}

const FLOW = [
  { x: 56, label: "Post", sub: "reward locked" },
  { x: 182, label: "Take", sub: "builder starts" },
  { x: 308, label: "Submit", sub: "link to work" },
  { x: 434, label: "Approve", sub: "poster checks" },
  { x: 560, label: "Paid", sub: "to the builder" },
];

/**
 * How a quest moves. Wide screens: a small looping SVG diagram (a coin
 * travels along the main path; dashed branches show the refund and the
 * timeout payout), with a pause button; it also pauses off-screen and in
 * hidden tabs, and is static under reduced motion. Phones: the same steps
 * as a short HTML list, so nothing renders at a few pixels.
 */
export function QuestFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const visible = usePageVisible(); // both hooks always run (rules of hooks)
  const [userPaused, setUserPaused] = useState(false);
  const running = inView && visible && !userPaused;
  return (
    <div ref={ref} className={`flow ${running ? "" : "paused"}`} data-testid="quest-flow">
      <svg className="flow-svg" viewBox="0 0 616 236" role="img" aria-labelledby="flow-title flow-desc">
        <title id="flow-title">How a quest moves</title>
        <desc id="flow-desc">
          Post, take, submit, approve, paid. Two side exits: a closed quest refunds the poster; a submission left unanswered for about 7 days is paid
          out to the builder.
        </desc>
        <path className="flow-line" d="M56 86H560" />
        <path className="flow-line flow-progress" d="M56 86H560" pathLength={100} />
        {/* side exits */}
        <path className="flow-branch" d="M182 104v54q0 14 14 14h40" />
        <path className="flow-branch timeout" d="M308 104v54q0 14 14 14h224q14 0 14-14V104" />
        <g className="flow-exit" transform="translate(236 172)">
          <rect x="0" y="-16" width="150" height="32" rx="16" />
          <text x="75" y="5" textAnchor="middle">Closed · refunded</text>
        </g>
        <g className="flow-exit timeout" transform="translate(400 172)">
          <rect x="0" y="-16" width="150" height="32" rx="16" />
          <text x="75" y="5" textAnchor="middle">7 days · auto-pay</text>
        </g>
        {FLOW.map((n, i) => (
          <g key={n.label} className="flow-node" style={{ ["--i" as string]: i }} transform={`translate(${n.x} 86)`}>
            <circle r="17" />
            <text className="flow-num" y="5" textAnchor="middle">
              {i + 1}
            </text>
            <text className="flow-label" y="-30" textAnchor="middle">
              {n.label}
            </text>
            <text className="flow-sub" y="44" textAnchor="middle">
              {n.sub}
            </text>
          </g>
        ))}
        <g className="flow-coin">
          <circle r="9" />
          <path d="M-3 0h6M0-3v6" />
        </g>
      </svg>
      <ol className="flow-list" aria-label="How a quest moves">
        {FLOW.map((n) => (
          <li key={n.label}>
            <strong>{n.label}</strong> <span>{n.sub}</span>
          </li>
        ))}
      </ol>
      <p className="flow-exits">Exits: a closed quest refunds the poster; a submission left unanswered for about 7 days pays the builder.</p>
      <button type="button" className="btn btn-small btn-ghost flow-toggle" onClick={() => setUserPaused(!userPaused)} aria-pressed={userPaused} aria-label={userPaused ? "Play the diagram" : "Pause the diagram"}>
        <Icon name={userPaused ? "play" : "pause"} />
      </button>
    </div>
  );
}

/** The life of one quest as steps: done, current, and what can come next. */
export function QuestStepper({ q }: { q: Quest }) {
  const cancelled = q.state === QuestState.Cancelled;
  const steps = ["Posted", "Taken", "Submitted", "Paid"];
  // index of the current step (0-based)
  const cur = { [QuestState.Open]: 0, [QuestState.Claimed]: 1, [QuestState.Submitted]: 2, [QuestState.Paid]: 3, [QuestState.Cancelled]: -1 }[q.state];
  return (
    <ol className={`stepper ${cancelled ? "is-cancelled" : ""}`} aria-label="Quest progress">
      {steps.map((s, i) => {
        const state = cancelled ? (i === 0 ? "done" : "skipped") : i < cur ? "done" : i === cur ? (q.state === QuestState.Paid ? "done" : "current") : "todo";
        return (
          <li key={s} className={`step ${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="step-dot" aria-hidden="true">
              {state === "done" ? (
                <Icon name="check" />
              ) : (
                i + 1
              )}
            </span>
            <span className="step-label">{s}</span>
          </li>
        );
      })}
      {cancelled && (
        <li className="step exit current" aria-current="step">
          <span className="step-dot" aria-hidden="true">
            <Icon name="undo" />
          </span>
          <span className="step-label">Refunded</span>
        </li>
      )}
    </ol>
  );
}

/** A deadline as one fact row: label, block and time left, and a bar from its start block to the deadline. */
export function DeadlineFact({ label, start, deadline, h }: { label: string; start: bigint; deadline: bigint; h: bigint }) {
  const span = deadline - start;
  const used = h - start;
  const pct = span > 0n ? Math.max(0, Math.min(100, Number((used * 1000n) / span) / 10)) : 100;
  const passed = h > deadline;
  return (
    <div className={`deadline ${passed ? "passed" : pct > 80 ? "soon" : ""}`}>
      <dt>{label}</dt>
      <dd>
        <span className="deadline-when">
          block {thousands(deadline)} · {timeLeft(deadline, h)}
        </span>
        <span
          className="deadline-track"
          role="progressbar"
          aria-label={`${label}: ${passed ? "passed" : approx(deadline - h + 1n) + " left"}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <span className="deadline-fill" style={{ ["--p" as string]: `${pct}%` }} />
        </span>
      </dd>
    </div>
  );
}

// ------------------------------------------------------------------ skeletons

export function SkeletonBoard() {
  return (
    <div role="status" className="skeleton-wrap">
      <span className="sr-only">Reading the board…</span>
      <div className="stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat skeleton-card">
            <span className="sk sk-num" />
            <span className="sk sk-line short" />
          </div>
        ))}
      </div>
      <SkeletonRows />
    </div>
  );
}

export function SkeletonRows({ n = 6 }: { n?: number }) {
  return (
    <div className="table-wrap skeleton-table" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="sk-row" style={{ ["--d" as string]: `${i * 60}ms` }}>
          <span className="sk sk-id" />
          <span className="sk sk-title" />
          <span className="sk sk-amt" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonQuest() {
  return (
    <div role="status" className="skeleton-wrap">
      <span className="sr-only">Reading the quest…</span>
      <span className="sk sk-line short" />
      <span className="sk sk-h1" />
      <span className="sk sk-stepper" />
      <div className="facts skeleton-card">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <span className="sk sk-line short" />
            <span className="sk sk-line" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ small illustrations

/** An empty notice board (no quests yet). */
export function EmptyArt() {
  return (
    <svg className="art art-wide" viewBox="0 0 96 72" aria-hidden="true">
      <path d="M48 6v8" className="art-line" />
      <path d="M22 22 48 12l26 10" className="art-line" />
      <rect x="14" y="22" width="68" height="44" rx="6" className="art-board" />
      <rect x="26" y="32" width="18" height="22" rx="2" className="art-paper dashed" />
      <rect x="52" y="32" width="18" height="22" rx="2" className="art-paper dashed" />
      <circle cx="48" cy="6" r="3" className="art-amber" />
    </svg>
  );
}

/** A lantern with a pause mark (waiting, not live yet). */
export function WaitingArt() {
  return (
    <svg className="art" viewBox="0 0 72 72" aria-hidden="true">
      <path d="M36 6v6" className="art-line" />
      <path d="M26 14h20l4 8H22z" className="art-board" />
      <rect x="22" y="22" width="28" height="34" rx="6" className="art-paper" />
      <circle cx="36" cy="39" r="8" className="art-glow" />
      <path d="M26 58h20" className="art-line" />
    </svg>
  );
}

/** A torn notice (something went wrong). */
export function ErrorArt() {
  return (
    <svg className="art" viewBox="0 0 72 72" aria-hidden="true">
      <path d="M16 12h40v30l-8 6 6 6-6 6H16z" className="art-paper" />
      <path d="M26 26h20M26 34h14" className="art-line" />
      <circle cx="36" cy="8" r="3" className="art-amber" />
    </svg>
  );
}

/** A short burst of coins for a payout or refund. Decorative; rests under reduced motion. */
export function CoinBurst() {
  return (
    <span className="burst" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <span key={i} className="burst-coin" style={{ ["--a" as string]: `${i * (360 / 7)}deg`, ["--d" as string]: `${(i % 3) * 40}ms` }} />
      ))}
    </span>
  );
}

/** Small looping illustrations for the five steps on the How it works page. */
export function StepArt({ step }: { step: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <svg className={`step-art step-art-${step}`} viewBox="0 0 80 64" aria-hidden="true">
      {step === 1 && (
        <>
          <rect x="18" y="34" width="44" height="22" rx="4" className="art-board" />
          <path d="M18 40h44" className="art-line" />
          <g className="sa-drop">
            <circle cx="40" cy="14" r="7" className="art-coin" />
            <path d="M37 14h6" className="art-coin-mark" />
          </g>
        </>
      )}
      {step === 2 && (
        <>
          <rect x="14" y="10" width="52" height="44" rx="5" className="art-board" />
          <g className="sa-lift">
            <rect x="28" y="20" width="24" height="26" rx="2" className="art-paper" />
            <path d="M33 29h14M33 35h10" className="art-line thin" />
          </g>
          <circle cx="40" cy="20" r="2.5" className="art-amber" />
        </>
      )}
      {step === 3 && (
        <>
          <rect x="10" y="22" width="26" height="20" rx="4" className="art-paper" />
          <rect x="46" y="18" width="24" height="28" rx="4" className="art-board" />
          <path d="M20 32h4M28 32h4" className="art-line thin" />
          <g className="sa-send">
            <path d="M38 32h6l-3-3m3 3-3 3" className="art-line" />
          </g>
        </>
      )}
      {step === 4 && (
        <>
          <rect x="20" y="10" width="40" height="44" rx="4" className="art-paper" />
          <path d="M28 22h24M28 29h18" className="art-line thin" />
          <g className="sa-stamp">
            <circle cx="46" cy="42" r="10" className="art-stamp" />
            <path d="m41 42 3.5 3.5 6-6.5" className="art-stamp-mark" />
          </g>
        </>
      )}
      {step === 5 && (
        <>
          <path d="M14 48h52" className="art-line" />
          <g className="sa-stack">
            <ellipse cx="40" cy="44" rx="12" ry="4" className="art-coin" />
            <ellipse cx="40" cy="37" rx="12" ry="4" className="art-coin" />
            <ellipse cx="40" cy="30" rx="12" ry="4" className="art-coin top" />
          </g>
        </>
      )}
    </svg>
  );
}
