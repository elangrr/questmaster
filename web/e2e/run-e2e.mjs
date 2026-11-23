// End-to-end check against a LOCAL gnodev chain (never a public network):
//  1. start gnodev on 127.0.0.1 with genesis transactions from seed-txs.mjs
//     (quests in every state, a closing one, hostile text, two pages);
//  2. build the app pointed at that node and serve it under /questmaster/;
//  3. run the Playwright tests in e2e/app.spec.ts (headless Chromium).
// Needs gno v1.8.0's gnodev on PATH. Uses a throwaway GNOHOME; no keys.
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, statSync, rmSync, mkdirSync } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(web, "..");
const out = join(web, "e2e", "out");
mkdirSync(out, { recursive: true });
const RPC_PORT = 36657, WEB_PORT = 38888, APP_PORT = 4173;
const realm = /module = "([^"]+)"/.exec(readFileSync(join(repo, "r/questmaster/gnomod.toml"), "utf8"))[1];

async function up(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}
if (await up(`http://127.0.0.1:${RPC_PORT}/status`)) {
  console.error(`port ${RPC_PORT} is busy; stop the other node first`);
  process.exit(1);
}

// 1. gnodev
const gnohome = mkdtempSync(join(tmpdir(), "qm-e2e-"));
const txs = join(out, "txs.jsonl");
writeFileSync(txs, execFileSync("node", [join(web, "e2e/seed-txs.mjs"), realm]));
const log = join(out, "gnodev.log");
const gnodev = spawn(
  "gnodev",
  ["local", "-chain-id", "dev", "-no-watch", "-interactive=false", "-txs-file", txs,
    "-node-rpc-listener", `127.0.0.1:${RPC_PORT}`, "-web-listener", `127.0.0.1:${WEB_PORT}`, "."],
  { cwd: repo, env: { ...process.env, GNOHOME: gnohome }, stdio: ["ignore", "pipe", "pipe"] },
);
let gnodevOut = "";
gnodev.stdout.on("data", (d) => (gnodevOut += d));
gnodev.stderr.on("data", (d) => (gnodevOut += d));
let server;
const cleanup = () => {
  try { gnodev.kill(); } catch { /* already gone */ }
  try { server?.close(); } catch { /* already closed */ }
  writeFileSync(log, gnodevOut);
  rmSync(gnohome, { recursive: true, force: true });
};
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

for (let i = 0; i < 90 && !/node is ready/.test(gnodevOut); i++) await new Promise((r) => setTimeout(r, 1000));
if (!/node is ready/.test(gnodevOut)) {
  console.error("gnodev did not start; see " + log);
  process.exit(1);
}
const failed = gnodevOut.match(/unable to deliver tx err="[^"]*"/g);
if (failed) {
  console.error("seed transactions failed:\n" + failed.join("\n"));
  process.exit(1);
}
console.log(`gnodev ready: ${realm} seeded`);

// 2. build for the local chain and serve under /questmaster/
execFileSync("npx", ["vite", "build", "--outDir", "e2e/out/dist", "--emptyOutDir"], {
  cwd: web,
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_CHAIN_ID: "dev",
    VITE_NETWORK_NAME: "Local dev chain",
    VITE_RPC_URL: `http://127.0.0.1:${RPC_PORT}`,
    VITE_REALM_PATH: realm,
    VITE_GNOWEB_URL: `http://127.0.0.1:${WEB_PORT}`,
    VITE_EXPLORER_TX_URL: "https://gnoscan.io/transactions/details?txhash={hash}&chainId=dev",
  },
});
const dist = join(web, "e2e/out/dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (!url.pathname.startsWith("/questmaster/")) {
    res.writeHead(404).end("not under /questmaster/");
    return;
  }
  let p = join(dist, decodeURIComponent(url.pathname.slice("/questmaster/".length)) || "index.html");
  if (!p.startsWith(dist) || !existsSync(p) || statSync(p).isDirectory()) p = join(dist, "index.html");
  res.writeHead(200, { "Content-Type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
}).listen(APP_PORT, "127.0.0.1");
console.log(`app served at http://127.0.0.1:${APP_PORT}/questmaster/`);

// 3. tests
// Async, so this process keeps serving the app while the tests run.
const tests = spawn("npx", ["playwright", "test", "--config", "e2e/playwright.config.ts", ...process.argv.slice(2)], {
  cwd: web,
  stdio: "inherit",
  env: { ...process.env, QM_APP_URL: `http://127.0.0.1:${APP_PORT}/questmaster/`, QM_REALM: realm },
});
tests.on("exit", (code) => process.exit(code ?? 1));
