import { useState, type ReactNode } from "react";
import { config, explorerTx } from "../config";
import { buildMsg, gnokeyCommand, gnowebActionLink, type ActionName } from "../lib/actions";
import { invalidate, read } from "../lib/rpc";
import { sendTx, WalletError } from "../lib/wallet";
import { thousands } from "../lib/format";
import { CoinBurst } from "./visuals";
import { forgetRecords } from "./record";
import { CopyButton, Gnot } from "./parts";
import { useWallet } from "./WalletContext";

/** Connect / switch-network prompts, shown where a signature is needed. */
export function WalletGate({ children }: { children: ReactNode }) {
  const w = useWallet();
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
          Connect Adena
        </button>{" "}
        to sign this.
      </p>
    );
  if (!w.onRightNetwork)
    return (
      <p className="hint warn">
        Adena is on <span className="mono">{w.chainId || "another network"}</span>.{" "}
        <button className="btn btn-primary" onClick={() => void w.switchNetwork()} disabled={w.busy}>
          Switch to {config.networkName}
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
 * Signs one call with Adena and reports the result. Always offers the gnokey
 * command and the gnoweb form for the same call.
 */
export function TxPanel({ spec, onDone, note, fallbackOpen = false }: { spec: TxSpec; onDone?: (hash: string, block: bigint | null) => void; note?: ReactNode; fallbackOpen?: boolean }) {
  const w = useWallet();
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [block, setBlock] = useState<bigint | null>(null);

  async function sign() {
    if (!w.address) return;
    setBusy(true);
    setError(null);
    setHash(null);
    setBlock(null);
    setPhase("wallet");
    let sent = false;
    try {
      const msg = buildMsg(w.address, spec.func, spec.args, spec.sendUgnot);
      const r = await sendTx(msg);
      sent = true;
      setHash(r.hash);
      setPhase("sent");
      invalidate();
      forgetRecords();
      const b = await confirmed(r.height);
      setBlock(b);
      setPhase("confirmed");
      onDone?.(r.hash, b);
    } catch (e) {
      setPhase(sent ? "confirmed" : "failed");
      setError(e instanceof WalletError ? e.message : e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const cmd = gnokeyCommand(spec.func, spec.args, spec.sendUgnot);
  return (
    <div className="tx">
      {note}
      {spec.sendUgnot !== undefined && spec.sendUgnot > 0n && (
        <p className="tx-sends small">
          This sends <Gnot ugnot={spec.sendUgnot} /> from your wallet, plus the network fee.
        </p>
      )}
      <WalletGate>
        <button className="btn btn-primary" onClick={() => void sign()} disabled={busy || !!spec.problem}>
          {busy ? "Waiting for Adena…" : spec.label}
        </button>
        {spec.problem && <p className="field-error">{spec.problem}</p>}
      </WalletGate>
      {phase !== "idle" && <TxSteps phase={phase} block={block} />}
      {w.error && <p className="field-error" role="alert">{w.error}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {hash && !onDone && <TxSent hash={hash} block={block} />}
      <details className="fallback" open={fallbackOpen}>
        <summary>No Adena? Use gnokey or gnoweb</summary>
        <p className="muted">With gnokey (replace YOUR_KEY_NAME):</p>
        <pre className="cmd">{cmd}</pre>
        <CopyButton text={cmd} label="Copy command" />
        <p className="muted">
          Or open the{" "}
          <a href={gnowebActionLink(spec.func, spec.questId, spec.sendUgnot)} target="_blank" rel="noopener noreferrer">
            gnoweb form
          </a>{" "}
          {spec.args.length > 1 ? "and fill in the remaining fields." : "with the quest number filled in."}
        </p>
      </details>
    </div>
  );
}

type TxPhase = "idle" | "wallet" | "sent" | "confirmed" | "failed";

/**
 * Waits (briefly) until the node has reached the transaction's block, so the
 * page re-reads the new state. Adena answers after the block is committed,
 * so this is normally immediate. Returns the block height when known.
 */
async function confirmed(height: bigint | null): Promise<bigint | null> {
  if (height === null) return null;
  for (let i = 0; i < 6; i++) {
    try {
      invalidate();
      if ((await read.height()) >= height) return height;
    } catch {
      /* keep trying for a moment */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return height;
}

const STEPS: { key: Exclude<TxPhase, "idle" | "failed">; label: string; doing: string }[] = [
  { key: "wallet", label: "Approve in your wallet", doing: "Waiting for your wallet" },
  { key: "sent", label: "Sent", doing: "Sending to the network" },
  { key: "confirmed", label: "Confirmed", doing: "Waiting for the block" },
];

/** Three-step progress: wallet, sent, confirmed. Announced politely to screen readers. */
function TxSteps({ phase, block }: { phase: TxPhase; block: bigint | null }) {
  const at = phase === "failed" ? 0 : STEPS.findIndex((s) => s.key === phase);
  return (
    <ol className="txsteps" aria-label="Transaction progress" aria-live="polite">
      {STEPS.map((s, i) => {
        const st = phase === "failed" && i === 0 ? "failed" : i < at || phase === "confirmed" ? "done" : i === at ? "active" : "todo";
        const text = st === "active" ? s.doing : s.key === "confirmed" && st === "done" && block !== null ? `Confirmed in block ${thousands(block)}` : s.label;
        return (
          <li key={s.key} className={`txstep ${st}`} aria-current={st === "active" ? "step" : undefined}>
            {st === "active" ? <span className="spinner" aria-hidden="true" /> : <span className="txstep-dot" aria-hidden="true">{st === "done" ? "✓" : st === "failed" ? "!" : i + 1}</span>}
            <span>{text}</span>
          </li>
        );
      })}
    </ol>
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
      (opens GnoScan){block !== null ? `, confirmed in block ${thousands(block)}` : ""}. The page shows the new state.
    </p>
  );
}
