// Read-only access to the realm through the node's JSON-RPC (abci_query).
// No wallet is needed for anything in this file.

import { config } from "../config";
import { decodeIds, decodeInt, decodeQuest, decodeTotals, type Quest, type Totals } from "./amino";

/** A problem the user should see in plain words. */
export class ReadError extends Error {
  kind: "network" | "not-live" | "not-found" | "chain";
  constructor(kind: ReadError["kind"], message: string) {
    super(message);
    this.name = "ReadError";
    this.kind = kind;
  }
}

interface AbciResult {
  data: string; // decoded text ("" when none)
  error: string | null; // error type or message, null on success
  log: string;
}

export const READ_TIMEOUT_MS = 12_000;

let rpcId = 0;

function checkHttpStatus(res: Response): void {
  if (res.status === 403)
    throw new ReadError("network", `The node at ${config.rpcUrl} does not allow these read queries (HTTP 403). Set VITE_RPC_URL to a node that does.`);
  if (!res.ok) throw new ReadError("network", `The node had a problem (HTTP ${res.status}). Try again in a moment.`);
}

function timeoutError(): ReadError {
  return new ReadError("network", `The ${config.networkName} node at ${config.rpcUrl} did not answer in time. Try again in a moment.`);
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timeoutError());
    }, READ_TIMEOUT_MS);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } catch (e) {
    if (timedOut) throw timeoutError();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function b64decode(s: string): string {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** UTF-8 text to base64: JSON-RPC carries abci_query data bytes as base64. */
function toBase64(s: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** One abci_query call. Throws ReadError("network") on transport problems. */
export async function abciQuery(path: string, data: string, fetchFn: typeof fetch = fetch): Promise<AbciResult> {
  const json = await withTimeout(async (signal) => {
    let res: Response;
    try {
      res = await fetchFn(config.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++rpcId,
          method: "abci_query",
          params: { path, data: toBase64(data) },
        }),
        signal,
      });
    } catch {
      throw new ReadError("network", `Could not reach the ${config.networkName} node at ${config.rpcUrl}.`);
    }
    checkHttpStatus(res);
    try {
      return await res.json();
    } catch {
      throw new ReadError("network", "The node sent a response that is not JSON. Try again in a moment.");
    }
  });
  if (!json || typeof json !== "object" || Array.isArray(json))
    throw new ReadError("network", "The node sent an unexpected response. Try again in a moment.");
  if (json.error) throw new ReadError("network", `The node returned an error: ${String(json.error.message ?? json.error.data ?? "unknown")}`);
  const base = json?.result?.response?.ResponseBase;
  if (!base || typeof base !== "object") throw new ReadError("network", "The node sent an unexpected response. Try again in a moment.");
  const err = base.Error;
  let decoded = "";
  if (base.Data) {
    if (typeof base.Data !== "string")
      throw new ReadError("network", "The node sent an unexpected response. Try again in a moment.");
    try {
      decoded = b64decode(base.Data);
    } catch {
      throw new ReadError("network", "The node sent an unexpected response. Try again in a moment.");
    }
  }
  return {
    data: decoded,
    error: err ? String(err.value ?? err["@type"] ?? "error") : null,
    log: typeof base.Log === "string" ? base.Log : "",
  };
}

/** Status of the realm package: live, parked (inert) waiting for approval, or absent. */
export interface PackageStatus {
  status: "live" | "inert" | "absent" | "unknown";
  reason: string;
}

export async function packageStatus(): Promise<PackageStatus> {
  const r = await abciQuery("vm/qpkgmeta_json", config.realmPath);
  if (r.error) return { status: "unknown", reason: r.error };
  try {
    const m = JSON.parse(r.data);
    const s = m.status === "live" || m.status === "inert" || m.status === "absent" ? m.status : "unknown";
    return { status: s, reason: typeof m.reason === "string" ? m.reason : "" };
  } catch {
    return { status: "unknown", reason: "" };
  }
}

/** Evaluates a read function of the realm and returns the qeval_json body. */
async function evalJson(expr: string): Promise<string> {
  const r = await abciQuery("vm/qeval_json", `${config.realmPath}.${expr}`);
  if (r.error) {
    if (/InvalidPkgPath|package not found/i.test(r.error + r.log)) {
      throw new ReadError("not-live", notLiveMessage(await packageStatus().catch(() => null)));
    }
    if (/unknown quest id/.test(r.error)) throw new ReadError("not-found", "There is no quest with that number.");
    throw new ReadError("chain", r.error);
  }
  return r.data;
}

export function notLiveMessage(s: PackageStatus | null): string {
  if (s?.status === "inert")
    return `QuestMaster has been submitted to the ${config.networkName} but is waiting for the network's package approver to enable it. The board will appear here as soon as it is live.`;
  if (s?.status === "absent") return `QuestMaster is not deployed on the ${config.networkName} yet.`;
  return `QuestMaster is not available on the ${config.networkName} right now.`;
}

// --- small cache: identical reads within a few seconds share one request ---

const TTL_MS = 4_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: now, value });
  // Never cache failures. Only drop this read's own entry: a slow failure must not evict a newer read.
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

/** Forget cached reads (after a transaction). */
export function invalidate(): void {
  cache.clear();
}

function addr(a: string): string {
  if (!/^g1[02-9ac-hj-np-z]{38}$/.test(a)) throw new ReadError("not-found", "That is not a valid address.");
  return `address("${a}")`;
}

export const read = {
  totals: (): Promise<Totals> => cached("totals", async () => decodeTotals(await evalJson("GetTotals()"))),
  quest: (id: bigint): Promise<Quest> => cached(`q${id}`, async () => decodeQuest(await evalJson(`GetQuest(${id})`))),
  openIds: (offset: number, limit: number) =>
    cached(`open${offset}/${limit}`, async () => decodeIds(await evalJson(`OpenQuestIDs(${offset}, ${limit})`))),
  paidIds: (offset: number, limit: number) =>
    cached(`paid${offset}/${limit}`, async () => decodeIds(await evalJson(`PaidQuestIDs(${offset}, ${limit})`))),
  posterIds: (a: string, offset: number, limit: number) =>
    cached(`p${a}${offset}/${limit}`, async () => decodeIds(await evalJson(`QuestIDsByPoster(${addr(a)}, ${offset}, ${limit})`))),
  builderIds: (a: string, offset: number, limit: number) =>
    cached(`b${a}${offset}/${limit}`, async () => decodeIds(await evalJson(`QuestIDsByBuilder(${addr(a)}, ${offset}, ${limit})`))),
  posterCount: (a: string) => cached(`pc${a}`, async () => decodeInt(await evalJson(`CountByPoster(${addr(a)})`))),
  builderCount: (a: string) => cached(`bc${a}`, async () => decodeInt(await evalJson(`CountByBuilder(${addr(a)})`))),
  /** Many quests in parallel, keeping order. */
  quests: (ids: bigint[]): Promise<Quest[]> => Promise.all(ids.map((id) => read.quest(id))),
  height: (): Promise<bigint> =>
    cached("height", async () => {
      const j = await withTimeout(async (signal) => {
        let res: Response;
        try {
          res = await fetch(config.rpcUrl.replace(/\/$/, "") + "/status", { signal });
        } catch {
          throw new ReadError("network", `Could not reach the ${config.networkName} node at ${config.rpcUrl}.`);
        }
        checkHttpStatus(res);
        return await res.json().catch(() => null);
      });
      const h = j?.result?.sync_info?.latest_block_height;
      if (typeof h !== "string" || !/^\d+$/.test(h)) throw new ReadError("network", "The node did not report its block height.");
      return BigInt(h);
    }),
};
