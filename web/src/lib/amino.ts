// Strict decoder for the realm values we read through `vm/qeval_json`.
//
// Why qeval_json and not qeval: `vm/qeval` returns Gno's printed form, e.g.
// (struct{(7 uint64),("He said \"hi\"" string),...} pkg.QuestView). It is
// parseable, but it prints an empty string sometimes as ("" string) and
// sometimes as ( string), and every string needs Go-style unquoting. The JSON
// form (documented in gno's docs/builders/query-state-api.md) returns strings
// as JSON strings and numbers as 8-byte little-endian base64, with zero values
// omitted, which leaves nothing to guess. Both queries are served by the same
// RPC and node version.
//
// Every decoder checks the exact shape (type IDs, field count, primitive
// kinds) and throws DecodeError on anything else, so a change in the realm or
// the node shows up as an error instead of wrong numbers.

export class DecodeError extends Error {
  constructor(message: string) {
    super("Unexpected data from the chain: " + message);
    this.name = "DecodeError";
  }
}

// Gno primitive kinds as they appear in amino JSON ("value" of PrimitiveType).
const KIND = {
  bool: "4",
  string: "16",
  int: "32",
  int64: "1024",
  uint64: "65536",
} as const;

type Json = unknown;

function isObj(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function need(cond: boolean, what: string): asserts cond {
  if (!cond) throw new DecodeError(what);
}

/** The single result of a qeval_json response body. */
export function singleResult(body: string): Record<string, Json> {
  let parsed: Json;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new DecodeError("not JSON");
  }
  need(isObj(parsed) && Array.isArray(parsed.results), "no results array");
  const results = (parsed as { results: Json[] }).results;
  need(results.length === 1, `expected 1 result, got ${results.length}`);
  const r = results[0];
  need(isObj(r), "result is not an object");
  return r;
}

/** Little-endian 8-byte base64 ("N") to a non-negative or signed bigint. */
function decodeN(n: Json, signed: boolean, what: string): bigint {
  if (n === undefined) return 0n; // zero values are omitted
  need(typeof n === "string", `${what}: N is not a string`);
  let bin: string;
  try {
    bin = atob(n as string);
  } catch {
    throw new DecodeError(`${what}: N is not base64`);
  }
  need(bin.length === 8, `${what}: N is ${bin.length} bytes, expected 8`);
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(bin.charCodeAt(i));
  if (signed && v >= 1n << 63n) v -= 1n << 64n;
  return v;
}

function primitiveKind(t: Json): string | undefined {
  if (isObj(t) && t["@type"] === "/gno.PrimitiveType" && typeof t.value === "string") return t.value;
  return undefined;
}

function refId(t: Json): string | undefined {
  if (isObj(t) && t["@type"] === "/gno.RefType" && typeof t.ID === "string") return t.ID;
  return undefined;
}

/** A typed value of the given primitive kind. */
function prim(tv: Json, kind: string, what: string): Record<string, Json> {
  need(isObj(tv), `${what}: not an object`);
  need(primitiveKind(tv.T) === kind, `${what}: expected kind ${kind}, got ${JSON.stringify(tv.T)}`);
  return tv;
}

function str(tv: Json, what: string): string {
  const v = prim(tv, KIND.string, what);
  return stringValue(v.V, what);
}

function stringValue(V: Json, what: string): string {
  if (V === undefined) return ""; // empty string is omitted
  need(isObj(V) && V["@type"] === "/gno.StringValue" && typeof V.value === "string", `${what}: not a StringValue`);
  return V.value as string;
}

function address(tv: Json, what: string): string {
  need(isObj(tv) && refId(tv.T) === ".uverse.address", `${what}: not an address`);
  const a = stringValue(tv.V, what);
  need(a === "" || /^g1[02-9ac-hj-np-z]{38}$/.test(a), `${what}: malformed address`);
  return a;
}

function u64(tv: Json, what: string): bigint {
  return decodeN(prim(tv, KIND.uint64, what).N, false, what);
}

function i64(tv: Json, what: string): bigint {
  return decodeN(prim(tv, KIND.int64, what).N, true, what);
}

function int(tv: Json, what: string): number {
  return Number(decodeN(prim(tv, KIND.int, what).N, true, what));
}

function bool(tv: Json, what: string): boolean {
  const v = decodeN(prim(tv, KIND.bool, what).N, false, what);
  need(v === 0n || v === 1n, `${what}: bool is ${v}`);
  return v === 1n;
}

function structFields(r: Record<string, Json>, typeSuffix: string, count: number): Json[] {
  const id = refId(r.T);
  need(id !== undefined && id.endsWith(typeSuffix), `expected ${typeSuffix}, got ${JSON.stringify(r.T)}`);
  need(isObj(r.V) && r.V["@type"] === "/gno.StructValue" && Array.isArray(r.V.Fields), `${typeSuffix}: not a struct`);
  const fields = (r.V as { Fields: Json[] }).Fields;
  need(fields.length === count, `${typeSuffix}: ${fields.length} fields, expected ${count}`);
  return fields;
}

export enum QuestState {
  Open = 1,
  Claimed = 2,
  Submitted = 3,
  Paid = 4,
  Cancelled = 5,
}

export interface Quest {
  id: bigint;
  poster: string;
  title: string;
  details: string;
  reward: bigint; // ugnot
  state: QuestState;
  builder: string; // "" when none
  workLink: string;
  workBlocks: bigint;
  createdAt: bigint;
  claimedAt: bigint;
  submittedAt: bigint;
  workDeadline: bigint; // 0 unless Claimed or Submitted
  reviewDeadline: bigint; // 0 unless Submitted
  rejectCount: number;
  lastRejectReason: string;
  closing: boolean;
  canRelease: boolean;
  canClaimPayout: boolean;
}

/** Decodes the result of GetQuest(id). Field order is QuestView's in questmaster.gno. */
export function decodeQuest(body: string): Quest {
  const r = singleResult(body);
  const f = structFields(r, "/questmaster.QuestView", 19);
  const stateField = f[5];
  need(isObj(stateField) && (refId(stateField.T) ?? "").endsWith("/escrow.State"), "State: wrong type");
  const state = Number(decodeN(stateField.N, false, "State"));
  need(state >= 1 && state <= 5, `State: unknown value ${state}`);
  return {
    id: u64(f[0], "ID"),
    poster: address(f[1], "Poster"),
    title: str(f[2], "Title"),
    details: str(f[3], "Details"),
    reward: i64(f[4], "Reward"),
    state: state as QuestState,
    builder: address(f[6], "Builder"),
    workLink: str(f[7], "WorkLink"),
    workBlocks: i64(f[8], "WorkBlocks"),
    createdAt: i64(f[9], "CreatedAt"),
    claimedAt: i64(f[10], "ClaimedAt"),
    submittedAt: i64(f[11], "SubmittedAt"),
    workDeadline: i64(f[12], "WorkDeadline"),
    reviewDeadline: i64(f[13], "ReviewDeadline"),
    rejectCount: int(f[14], "RejectCount"),
    lastRejectReason: str(f[15], "LastRejectReason"),
    closing: bool(f[16], "Closing"),
    canRelease: bool(f[17], "CanRelease"),
    canClaimPayout: bool(f[18], "CanClaimPayout"),
  };
}

export interface Totals {
  quests: bigint;
  openQuests: number;
  posted: bigint;
  locked: bigint;
  paid: bigint;
  refunded: bigint;
  paidQuests: number;
}

/** Decodes the result of GetTotals(). */
export function decodeTotals(body: string): Totals {
  const f = structFields(singleResult(body), "/questmaster.Totals", 7);
  return {
    quests: u64(f[0], "Quests"),
    openQuests: int(f[1], "OpenQuests"),
    posted: i64(f[2], "Posted"),
    locked: i64(f[3], "Locked"),
    paid: i64(f[4], "Paid"),
    refunded: i64(f[5], "Refunded"),
    paidQuests: int(f[6], "PaidQuests"),
  };
}

/** Decodes a []uint64 result (the *QuestIDs functions). */
export function decodeIds(body: string): bigint[] {
  const r = singleResult(body);
  need(
    isObj(r.T) && r.T["@type"] === "/gno.SliceType" && primitiveKind((r.T as Record<string, Json>).Elt) === KIND.uint64,
    "expected []uint64",
  );
  if (r.V === undefined) return []; // nil slice
  need(isObj(r.V) && r.V["@type"] === "/gno.SliceValue", "not a SliceValue");
  const base = (r.V as Record<string, Json>).Base;
  const offset = Number((r.V as Record<string, Json>).Offset ?? "0");
  const length = Number((r.V as Record<string, Json>).Length ?? "0");
  if (length === 0) return [];
  need(isObj(base) && base["@type"] === "/gno.ArrayValue" && Array.isArray(base.List), "slice has no array");
  const list = (base as { List: Json[] }).List;
  need(Number.isInteger(offset) && Number.isInteger(length) && offset >= 0 && offset + length <= list.length, "slice bounds");
  return list.slice(offset, offset + length).map((tv, i) => u64(tv, `id[${i}]`));
}

/** Decodes an int result (CountByPoster, CountByBuilder). */
export function decodeInt(body: string): number {
  return int(singleResult(body), "int");
}
