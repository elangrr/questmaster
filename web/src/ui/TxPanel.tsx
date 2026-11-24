import { useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { config, explorerTx } from "../config";
import { buildMsg, gnokeyCommand, gnowebActionLink, type ActionName } from "../lib/actions";
import { invalidate } from "../lib/rpc";
import { sendTx, WalletError } from "../lib/wallet";
import { thousands } from "../lib/format";
import { CoinBurst } from "./visuals";
import { forgetRecords } from "./record";
import { CopyButton, Gnot } from "./parts";
import { useWallet } from "./WalletContext";

/** Connect / switch-network prompts, shown where a signature is needed. */
export function WalletGate({ children }: { children: ReactNode }) {
  const w = useWallet();
  if (w.restoring)
    return (
      <p className="hint wallet-wait">
        <span className="spinner" aria-hidden="true" /> Reconnecting your wallet…
      </p>
    );
  if (!w.installed)
    return (
      <p className="hint">
        To sign here, install the <a href="https://adena.app" target="_blank" rel="noopener noreferrer">Adena wallet</a>. You can also use
        the gnokey command or the gnoweb form below.
      </p>
    );
  if (!w.address)
    return (
      <p className="hint">
        <button className="btn btn-primary" onClick={() => void w.connect()} disabled={w.busy}>
          Connect wallet
        </button>
      </p>
    );
  if (!w.onRightNetwork)
    return (
      <p className="hint warn">
        Adena is on <span className="mono">{w.chainId || "another network"}</span>.{" "}
        <button className="btn btn-primary" onClick={() => void w.switchNetwork()} disabled={w.busy}>
          Switch to {config.chainId}
        </button>
      </p>
    );
  return <>{children}</>;
}

export interface TxSpec {
  func: ActionName;
  args: string[];
  sendUgnot?: bigint;
  questId?: bigint;
  /** Text on the sign button. */
  label: string;
  /** Checked before signing; a message blocks the button. */
  problem?: string | null;
}

/**
 * Called once the transaction is in a block. Resolve when the page shows the
 * new state ("updated"), or "timeout" if it has not shown up yet (the page
 * keeps checking by itself). Until then the progress shows "Updating status…".
 */
export type OnSent = (hash: string, block: bigint | null) => Promise<"updated" | "timeout">;

export interface TxHooks {
  /** The user pressed the sign button (before Adena opens). */
  onStart?: () => void;
  onSent?: OnSent;
  /** Nothing was sent (cancelled in Adena, refused, or failed). */
  onFailed?: () => void;
}

export type TxPhase = "idle" | "wallet" | "updating" | "updated" | "slow" | "failed" | "unclear";

export interface Tx {
  phase: TxPhase;
  busy: boolean;
  hash: string | null;
  block: bigint | null;
  error: string | null;
  sign(): Promise<void>;
}

/** Signs one call with Adena, then waits for the page to show its result. */
export function useTx(spec: TxSpec, hooks: TxHooks = {}): Tx {
  const w = useWallet();
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [hash, setHash] = useState<string | null>(null);
  const [block, setBlock] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = phase === "wallet" || phase === "updating";

  async function sign() {
    if (!w.address || busy) return;
    setError(null);
    setHash(null);
    setBlock(null);
    setPhase("wallet");
    hooks.onStart?.();
    let sent = false;
    try {
      const msg = buildMsg(w.address, spec.func, spec.args, spec.sendUgnot);
      const r = await sendTx(msg);
      sent = true;
      setHash(r.hash);
      setPhase("updating");
      setBlock(r.height);
      invalidate();
      forgetRecords();
      const seen = hooks.onSent ? await hooks.onSent(r.hash, r.height) : "updated";
      setPhase(seen === "updated" ? "updated" : "slow");
    } catch (e) {
      setPhase(sent ? "unclear" : "failed");
      if (!sent) hooks.onFailed?.();
      setError(e instanceof WalletError ? e.message : e instanceof Error ? e.message : "Couldn't send this. Nothing was signed. Try again.");
    }
  }
  return { phase, busy, hash, block, error, sign };
}

/** Progress, errors and the plain "it went through" note for one transaction. */
export function TxStatus({ tx, updating = "Updating status…", showSent = true }: { tx: Tx; updating?: string; showSent?: boolean }) {
  const w = useWallet();
  return (
    <>
      {tx.phase !== "idle" && <TxSteps phase={tx.phase} block={tx.block} updating={updating} />}
      {tx.phase === "slow" && (
        <p className="hint" role="status">
          The transaction went through. This page will show the new status by itself as soon as the network has it.
        </p>
      )}
      {w.error && (
        <p className="field-error" role="alert">
          {w.error}
        </p>
      )}
      {tx.error && (
        <p className="field-error" role="alert">
          {tx.error}
        </p>
      )}
      {showSent && tx.hash && (tx.phase === "updated" || tx.phase === "slow") && <TxSent hash={tx.hash} block={tx.block} />}
    </>
  );
}

/** The gnokey command and the gnoweb form for the same call. */
export function TxFallback({ spec, open = false, summary = "Other ways to sign" }: { spec: TxSpec; open?: boolean; summary?: string }) {
  const cmd = gnokeyCommand(spec.func, spec.args, spec.sendUgnot);
  return (
    <details className="fallback" open={open}>
      <summary>
        <Icon name="chevron" />
        {summary}
      </summary>
      <div className="fallback-body">
        <div className="cmd-head">
          <p className="muted small">With gnokey (replace YOUR_KEY_NAME):</p>
          <CopyButton text={cmd} label="Copy command" />
        </div>
        <pre className="cmd">{cmd}</pre>
        <p className="muted small">
          Or open the{" "}
          <a href={gnowebActionLink(spec.func, spec.questId, spec.sendUgnot)} target="_blank" rel="noopener noreferrer">
            gnoweb form
          </a>{" "}
          {spec.args.length > 1 ? "and fill in the remaining fields." : "with the quest number filled in."}
        </p>
      </div>
    </details>
  );
}

/**
 * Signs one call with Adena and reports the result. Always offers the gnokey
 * command and the gnoweb form for the same call.
 */
export function TxPanel({
  spec,
  hooks,
  note,
  fallbackOpen = false,
  updating,
  showSent = true,
}: {
  spec: TxSpec;
  hooks?: TxHooks;
  note?: ReactNode;
  fallbackOpen?: boolean;
  updating?: string;
  showSent?: boolean;
}) {
  const tx = useTx(spec, hooks);
  return (
    <div className="tx">
      {note}
      {spec.sendUgnot !== undefined && spec.sendUgnot > 0n && (
        <p className="tx-sends small">
          This sends <Gnot ugnot={spec.sendUgnot} /> from your wallet, plus the network fee.
        </p>
      )}
      <WalletGate>
        <div className="tx-submit-row">
          <button className="btn btn-primary" onClick={() => void tx.sign()} disabled={tx.busy || !!spec.problem}>
            {tx.phase === "wallet" ? "Waiting for Adena…" : spec.label}
          </button>
        </div>
        {spec.problem && <p className="field-error">{spec.problem}</p>}
      </WalletGate>
      <TxStatus tx={tx} updating={updating} showSent={showSent} />
      <TxFallback spec={spec} open={fallbackOpen} summary="No Adena? Use gnokey or gnoweb" />
    </div>
  );
}

const STEPS = [
  { key: "wallet", label: "Approve in your wallet", doing: "Waiting for your wallet" },
  { key: "sent", label: "Sent", doing: "Sending to the network" },
  { key: "confirmed", label: "Confirmed", doing: "Updating status…" },
] as const;

/**
 * Three-step progress: wallet, sent, confirmed. The last step spins with
 * "Updating status…" until the page shows the new state. The current step is
 * announced politely to screen readers.
 */
function TxSteps({ phase, block, updating }: { phase: TxPhase; block: bigint | null; updating: string }) {
  // Index of the active step; 3 = all done.
  const at = phase === "wallet" || phase === "failed" ? 0 : phase === "updating" ? 2 : 3;
  const items = STEPS.map((s, i) => {
    const st = phase === "failed" && i === 0 ? "failed" : i < at ? "done" : i === at ? "active" : "todo";
    const text =
      st === "active" ? (s.key === "confirmed" ? updating : s.doing) : s.key === "confirmed" && st === "done" && block !== null ? `Confirmed in block ${thousands(block)}` : s.label;
    return { ...s, st, text };
  });
  const now = phase === "failed" ? "Not sent." : (items.find((i) => i.st === "active")?.text ?? (phase === "unclear" ? "" : items[2].text));
  return (
    <>
      <ol className="txsteps" aria-label="Transaction progress">
        {items.map((s, i) => (
          <li key={s.key} className={`txstep ${s.st}`} aria-current={s.st === "active" ? "step" : undefined}>
            {s.st === "active" ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <span className="txstep-dot" aria-hidden="true">
                {s.st === "done" ? <Icon name="check" /> : s.st === "failed" ? <Icon name="alert" /> : i + 1}
              </span>
            )}
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      <span className="sr-only" role="status">
        {now}
      </span>
    </>
  );
}

/** "Sent" notice with the transaction hash and an explorer link; a small coin burst for a payout or refund. */
export function TxSent({ hash, what, block = null, celebrate = false }: { hash: string; what?: string; block?: bigint | null; celebrate?: boolean }) {
  return (
    <p className={`ok ${celebrate ? "has-burst" : ""}`} role="status">
      {celebrate && (
        <>
          <span className="ok-coin" aria-hidden="true" />
          <CoinBurst />
        </>
      )}
      Sent{what ? `: ${what}` : ""}. Transaction{" "}
      <a className="mono" href={explorerTx(hash)} target="_blank" rel="noopener noreferrer" title={hash}>
        {hash.length > 20 ? hash.slice(0, 10) + "…" + hash.slice(-6) : hash}
      </a>{" "}
      (opens GnoScan){block !== null ? `, confirmed in block ${thousands(block)}` : ""}.
    </p>
  );
}
