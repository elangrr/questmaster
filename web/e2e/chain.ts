// Sends real transactions to the local gnodev chain during a test, so a page
// can be watched while the state changes under it. Signs as gnodev's built-in
// test1 account (the seeded POSTER), whose mnemonic is public test data in the
// gno repository (gno.land/pkg/integration/node_testing.go). The key lives in
// a throwaway gnokey home that is deleted when the tests end. Local only.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RPC = "http://127.0.0.1:36657";
const TEST1 = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const TEST1_MNEMONIC =
  "source bonus chronic canvas draft south burst lottery vacant surface solve popular case indicate oppose farm nothing bullet exhibit title speed wink action roast";

let home: string | null = null;
function keyHome(): string {
  if (home) return home;
  home = mkdtempSync(join(tmpdir(), "qm-e2e-key-"));
  execFileSync("gnokey", ["add", "test1", "--recover", "--insecure-password-stdin", "--home", home], { input: `${TEST1_MNEMONIC}\n\n\n`, stdio: ["pipe", "ignore", "ignore"] });
  process.on("exit", () => home && rmSync(home, { recursive: true, force: true }));
  return home;
}

export const POSTER_KEY_ADDRESS = TEST1;

export interface Sent {
  hash: string;
  height: string;
  /** The new quest's id, for PostQuest. */
  id: string | null;
}

/** Calls the realm as test1 and waits for the block. Throws if the chain refuses. */
export function callAsPoster(realm: string, func: string, args: (string | number)[], send?: string): Sent {
  const a = ["maketx", "call", "-pkgpath", realm, "-func", func, ...args.flatMap((x) => ["-args", String(x)])];
  if (send) a.push("-send", send);
  a.push("-gas-fee", "1000000ugnot", "-gas-wanted", "50000000", "-broadcast", "-chainid", "dev", "-remote", RPC, "-insecure-password-stdin", "--home", keyHome(), "test1");
  const out = execFileSync("gnokey", a, { input: "\n", stdio: ["pipe", "pipe", "ignore"] }).toString();
  const hash = /TX HASH:\s+(\S+)/.exec(out)?.[1];
  const height = /HEIGHT:\s+(\d+)/.exec(out)?.[1];
  if (!hash || !height) throw new Error(`gnokey: unexpected output\n${out}`);
  const id = /"type":"QuestPosted","attrs":\[\{"key":"id","value":"(\d+)"/.exec(out)?.[1] ?? null;
  return { hash, height, id };
}

/** Posts a quest as test1 and returns its id. */
export function postAsPoster(realm: string, title: string, reward = 1_000_000): string {
  const r = callAsPoster(realm, "PostQuest", [title, "Posted during an end-to-end test.", 20000], `${reward}ugnot`);
  if (!r.id) throw new Error("PostQuest returned no id");
  return r.id;
}
