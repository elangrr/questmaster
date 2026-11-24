// Adena browser wallet. API from the Adena extension source
// (packages/adena-extension/src/inject.ts and inject/types/*.ts):
//   AddEstablish(name), GetAccount(), SwitchNetwork(chainId),
//   AddNetwork({chainId, chainName, rpcUrl}), DoContract({messages, memo}),
//   On("changedAccount" | "changedNetwork", cb).
// Responses: { code, status: "success" | "failure", type, message, data }.
// DoContract takes no gas fields: Adena estimates the fee and shows it.
//
// Restoring a connection after a page load (checked against the Adena source,
// packages/adena-extension/src/inject/message/message-handler.ts and
// inject/message/methods/{common,wallet}.ts): GetAccount never opens a popup
// (GET_ACCOUNT is in NON_POPUP_REQUEST_TYPES and its handler only answers).
// For a site the user has not connected it fails with NOT_CONNECTED; for a
// connected site with the wallet locked it fails with WALLET_LOCKED; with no
// account in the wallet, NO_ACCOUNT. AddEstablish is the call that opens a
// popup, so a restore uses GetAccount only.
// On(event, cb) adds a window listener and returns true; there is no way to
// remove it, so listeners must be registered once per page.

import { config } from "../config";
import type { MsgCall } from "./actions";

export interface AdenaResponse<T = any> {
  code: number;
  status: "success" | "failure";
  type: string;
  message: string;
  data: T;
}

export interface Adena {
  AddEstablish(name: string): Promise<AdenaResponse>;
  GetAccount(): Promise<AdenaResponse<{ address: string; chainId: string; coins?: string; status?: string }>>;
  SwitchNetwork(chainId: string): Promise<AdenaResponse>;
  AddNetwork(n: { chainId: string; chainName: string; rpcUrl: string }): Promise<AdenaResponse>;
  DoContract(p: { messages: MsgCall[]; memo?: string }): Promise<AdenaResponse<{ hash?: string; height?: string; deliverTx?: any; checkTx?: any }>>;
  On?(event: string, cb: (v: string) => void): unknown;
}

export class WalletError extends Error {
  kind: "not-installed" | "rejected" | "locked" | "wrong-network" | "failed";
  constructor(kind: WalletError["kind"], message: string) {
    super(message);
    this.name = "WalletError";
    this.kind = kind;
  }
}

export function getAdena(): Adena | null {
  const a = (globalThis as any).adena;
  return a && typeof a.DoContract === "function" ? (a as Adena) : null;
}

function need(): Adena {
  const a = getAdena();
  if (!a) throw new WalletError("not-installed", "The Adena wallet is not installed in this browser.");
  return a;
}

/** The realm's own error text from a failed transaction, if present. */
export function chainErrorText(...sources: unknown[]): string | null {
  for (const s of sources) {
    const text = typeof s === "string" ? s : s ? JSON.stringify(s) : "";
    const m = /((?:escrow|questmaster): [^"\\\n]+)/.exec(text);
    if (m) return m[1].trim();
  }
  return null;
}

/** Turns an Adena failure response into a plain-language WalletError. */
export function failure(r: AdenaResponse): WalletError {
  switch (r.type) {
    case "TRANSACTION_REJECTED":
    case "SIGN_REJECTED":
    case "CONNECTION_REJECTED":
    case "SWITCH_NETWORK_REJECTED":
    case "ADD_NETWORK_REJECTED":
      return new WalletError("rejected", "You cancelled this in Adena. Nothing was sent.");
    case "WALLET_LOCKED":
      return new WalletError("locked", "Adena is locked. Unlock it and try again.");
    case "NOT_CONNECTED":
      return new WalletError("failed", "Adena is not connected to this site. Connect again.");
    case "NO_ACCOUNT":
      return new WalletError("failed", "Adena has no account yet. Create one in Adena first.");
    case "ACCOUNT_MISMATCH":
      return new WalletError("failed", "The account in Adena changed. Reconnect and try again.");
    case "UNRESOLVED_TRANSACTION_EXISTS":
      return new WalletError("failed", "Adena already has a request waiting. Finish or close it first.");
    case "UNADDED_NETWORK":
    case "NOT_INITIALIZED_NETWORK":
      return new WalletError("wrong-network", `Adena does not have the ${config.networkName} (${config.chainId}) yet.`);
    case "NETWORK_TIMEOUT":
      return new WalletError("failed", "The network did not answer in time. Check the quest before trying again: it may have gone through.");
    default: {
      const chain = chainErrorText(r.message, r.data);
      if (chain) return new WalletError("failed", `The chain refused it: ${chain}`);
      return new WalletError("failed", r.message || "Adena could not complete this.");
    }
  }
}

export interface Account {
  address: string;
  chainId: string;
}

/** Ask Adena to connect this site and return the current account. */
export async function connect(appName = "QuestMaster"): Promise<Account> {
  const a = need();
  const r = await a.AddEstablish(appName);
  if (r.status !== "success" && r.type !== "ALREADY_CONNECTED") throw failure(r);
  return account();
}

export async function account(): Promise<Account> {
  const r = await need().GetAccount();
  if (r.status !== "success") throw failure(r);
  const d = r.data ?? ({} as any);
  if (typeof d.address !== "string" || !/^g1[02-9ac-hj-np-z]{38}$/.test(d.address)) throw new WalletError("failed", "Adena returned no address.");
  return { address: d.address, chainId: String(d.chainId ?? "") };
}

export type RestoreResult = { status: "connected"; account: Account } | { status: "not-connected" | "locked" | "unavailable" };

/** How long a silent restore waits for Adena to answer GetAccount. */
export const RESTORE_TIMEOUT_MS = 4_000;

/**
 * Asks Adena for the account without any popup (GetAccount only). Used on
 * page load when this browser connected before. Never throws.
 *  - connected: the site is still connected and the wallet is unlocked;
 *  - not-connected: Adena no longer has this site (or has no account): forget it;
 *  - locked: the wallet is locked: stay disconnected, try again on the next load;
 *  - unavailable: no Adena, no answer in time, or an unexpected reply.
 */
export async function restoreAccount(timeoutMs = RESTORE_TIMEOUT_MS): Promise<RestoreResult> {
  const a = getAdena();
  if (!a) return { status: "unavailable" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const r = await Promise.race([
      a.GetAccount(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (!r) return { status: "unavailable" };
    if (r.status !== "success") {
      if (r.type === "NOT_CONNECTED" || r.type === "NO_ACCOUNT") return { status: "not-connected" };
      if (r.type === "WALLET_LOCKED") return { status: "locked" };
      return { status: "unavailable" };
    }
    const d = r.data ?? ({} as any);
    if (typeof d.address !== "string" || !/^g1[02-9ac-hj-np-z]{38}$/.test(d.address)) return { status: "unavailable" };
    return { status: "connected", account: { address: d.address, chainId: String(d.chainId ?? "") } };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

// ---- remembering that this browser connected (a flag only; never a key or an address)

export const REMEMBER_KEY = "qm-wallet-connected";

type FlagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function localStore(): FlagStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // private mode or blocked storage
  }
}

/** Remember (or forget) that the user connected Adena here. Silent when storage is unavailable. */
export function rememberConnection(on: boolean, storage: FlagStorage | null = localStore()): void {
  try {
    if (on) storage?.setItem(REMEMBER_KEY, "1");
    else storage?.removeItem(REMEMBER_KEY);
  } catch {
    /* not remembered: the user connects again next time */
  }
}

/** True when the user connected here before and did not disconnect. */
export function wasConnected(storage: FlagStorage | null = localStore()): boolean {
  try {
    return storage?.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

/** Switch Adena to the app's network, adding it first if Adena does not know it. */
export async function switchNetwork(): Promise<void> {
  const a = need();
  let r = await a.SwitchNetwork(config.chainId);
  if (r.status === "success" || r.type === "REDUNDANT_CHANGE_REQUEST") return;
  if (r.type === "UNADDED_NETWORK" || r.type === "NOT_INITIALIZED_NETWORK") {
    const add = await a.AddNetwork({ chainId: config.chainId, chainName: config.networkName, rpcUrl: config.rpcUrl });
    if (add.status !== "success" && add.type !== "NETWORK_ALREADY_EXISTS") throw failure(add);
    r = await a.SwitchNetwork(config.chainId);
    if (r.status === "success" || r.type === "REDUNDANT_CHANGE_REQUEST") return;
  }
  throw failure(r);
}

/** Sign and broadcast one call. Returns the transaction hash. */
/** Signs and sends one call; resolves with the hash once Adena reports it. */
export async function send(msg: MsgCall): Promise<string> {
  return (await sendTx(msg)).hash;
}

/** Like send, plus the block height Adena reports for the transaction (null if it gives none). */
export async function sendTx(msg: MsgCall): Promise<{ hash: string; height: bigint | null }> {
  const a = need();
  const acc = await account();
  if (acc.chainId !== config.chainId)
    throw new WalletError("wrong-network", `Adena is on ${acc.chainId || "another network"}; switch it to the ${config.networkName} (${config.chainId}).`);
  if (acc.address !== msg.value.caller) throw new WalletError("failed", "The account in Adena changed. Reconnect and try again.");
  const r = await a.DoContract({ messages: [msg], memo: "" });
  if (r.status !== "success") throw failure(r);
  const d = r.data ?? {};
  const failed = chainErrorText(d.deliverTx?.ResponseBase?.Log, d.deliverTx?.ResponseBase?.Error, d.checkTx?.ResponseBase?.Log, d.checkTx?.ResponseBase?.Error);
  const deliverErr = d.deliverTx?.ResponseBase?.Error ?? d.checkTx?.ResponseBase?.Error;
  if (deliverErr) throw new WalletError("failed", failed ? `The chain refused it: ${failed}` : "The transaction failed on chain.");
  if (typeof d.hash !== "string" || d.hash === "") throw new WalletError("failed", "Adena did not return a transaction hash. Check the quest: it may have gone through.");
  const height = typeof d.height === "string" && /^\d{1,19}$/.test(d.height) ? BigInt(d.height) : typeof d.height === "number" && Number.isSafeInteger(d.height) && d.height > 0 ? BigInt(d.height) : null;
  return { hash: d.hash, height };
}
