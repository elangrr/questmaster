import { useState, type ReactNode } from "react";
import { config, explorerTx } from "../config";
import { buildMsg, gnokeyCommand, gnowebActionLink, type ActionName } from "../lib/actions";
import { invalidate } from "../lib/rpc";
import { send, WalletError } from "../lib/wallet";
import { CopyButton } from "./parts";
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
export function TxPanel({ spec, onDone, note }: { spec: TxSpec; onDone?: (hash: string) => void; note?: ReactNode }) {
  const w = useWallet();
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sign() {
    if (!w.address) return;
    setBusy(true);
    setError(null);
    setHash(null);
    try {
      const msg = buildMsg(w.address, spec.func, spec.args, spec.sendUgnot);
      const h = await send(msg);
      setHash(h);
      invalidate();
      onDone?.(h);
    } catch (e) {
      setError(e instanceof WalletError ? e.message : e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const cmd = gnokeyCommand(spec.func, spec.args, spec.sendUgnot);
  return (
    <div className="tx">
      {note}
      <WalletGate>
        <button className="btn btn-primary" onClick={() => void sign()} disabled={busy || !!spec.problem}>
          {busy ? "Waiting for Adena…" : spec.label}
        </button>
        {spec.problem && <p className="field-error">{spec.problem}</p>}
      </WalletGate>
      {w.error && <p className="field-error" role="alert">{w.error}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {hash && !onDone && <TxSent hash={hash} />}
      <details className="fallback">
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

/** "Sent" notice with the transaction hash and an explorer link. */
export function TxSent({ hash, what }: { hash: string; what?: string }) {
  return (
    <p className="ok" role="status">
      Sent{what ? `: ${what}` : ""}. Transaction{" "}
      <a className="mono" href={explorerTx(hash)} target="_blank" rel="noopener noreferrer" title={hash}>
        {hash.length > 20 ? hash.slice(0, 10) + "…" + hash.slice(-6) : hash}
      </a>{" "}
      (opens GnoScan). The page shows the new state.
    </p>
  );
}
