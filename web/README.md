# QuestMaster web app

A static, client-only web app for the QuestMaster realm. It reads the board
straight from a Gno.land node (no server, no database, no analytics, no
third-party scripts) and signs actions with the
[Adena](https://adena.app) browser wallet. gnoweb stays the built-in
fallback: every action also offers the matching `gnokey` command and gnoweb
form.

It targets the **Onyx test network (`onyx-1`) with test GNOT only**.

## Run it

Needs Node 22 and npm 10.

```sh
cd web
npm ci            # installs the exact versions in package-lock.json
npm run dev       # http://localhost:5173, talking to Onyx
```

## Test it

```sh
npm test          # unit tests (Vitest): decoder, amounts, time, validation, wallet messages
npm run typecheck
npm run e2e       # end-to-end, against a LOCAL gnodev chain (see below)
```

`npm run e2e` (in `e2e/run-e2e.mjs`):

1. starts `gnodev` (gno v1.8.0, must be on `PATH`) on 127.0.0.1 with a
   throwaway `GNOHOME`, and seeds it with genesis transactions from
   `e2e/seed-txs.mjs`: quests in every state, a closing quest, a quest with
   hostile text (`e2e/hostile.mjs`) and two pages of open quests. No key is
   created or used;
2. builds the app for that chain and serves it under `/questmaster/`, the
   way GitHub Pages would;
3. runs `e2e/app.spec.ts` in headless Chromium (Playwright) and saves
   screenshots to `e2e/out/screenshots/`.

First time only: `npx playwright install chromium` (downloads a browser into
`~/.cache/ms-playwright`).

The wallet itself cannot be tested here; see [TESTING.md](TESTING.md) for the
checklist to run in a real browser with Adena.

## Build it

```sh
npm run build     # type-checks, then writes the static site to dist/
```

`dist/` uses relative paths only (`base: "./"`), so it works from any folder
or sub-path, such as `https://<user>.github.io/questmaster/`, without a
rebuild. Routing uses the URL hash (`#/quest/3`), so a static host needs no
rewrite rules.

## Host it on GitHub Pages (steps only; nothing here deploys)

1. Make the repository public (or use a plan that allows Pages on private ones).
2. Build: `cd web && npm ci && npm run build`.
3. Either push the contents of `web/dist/` to a `gh-pages` branch and choose
   that branch in **Settings → Pages**, or add a GitHub Actions workflow that
   runs the build and uses `actions/upload-pages-artifact` +
   `actions/deploy-pages` with `path: web/dist`.
4. The site appears at `https://<user>.github.io/<repo>/`. QuestMaster's copy is at
   https://elangrr.github.io/questmaster/ (linked from the root README).

Any other static host works the same way: upload `dist/`.

## Another network (for example a local gnodev)

Everything network-specific is in **one place**: the `VITE_*` variables
(`.env` holds the Onyx defaults, read by `src/config.ts`). Override them in a
`.env.local` file or the environment, then run or build:

```sh
# .env.local for a local gnodev started from the repo root
VITE_CHAIN_ID=dev
VITE_NETWORK_NAME=Local dev chain
VITE_RPC_URL=http://127.0.0.1:26657
VITE_REALM_PATH=gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster
VITE_GNOWEB_URL=http://127.0.0.1:8888
```

| Variable | Default (Onyx) | Meaning |
|---|---|---|
| `VITE_CHAIN_ID` | `onyx-1` | chain id; Adena must be on it to sign |
| `VITE_NETWORK_NAME` | `Onyx testnet` | shown in the header |
| `VITE_RPC_URL` | `https://rpc.onyx.testnets.gno.land:443` | node RPC (must allow CORS; Onyx does) |
| `VITE_REALM_PATH` | `gno.land/r/g1llc3…/questmaster` | the realm |
| `VITE_GNOWEB_URL` | `https://onyx.testnets.gno.land` | gnoweb, for fallback links |
| `VITE_EXPLORER_TX_URL` | GnoScan, `{hash}` placeholder | transaction link after signing |
| `VITE_EXPLORER_ACCOUNT_URL` | GnoScan, `{address}` placeholder | account link |
| `VITE_SOURCE_URL` | the GitHub repo | footer link |
| `VITE_PKG_STATUS_URL` | `https://gpas.onyx.testnets.gno.land/?path={path}` | official package-approval status, linked while the realm is not live |

## How it reads the chain

Every read is an `abci_query` to the node: `vm/qeval_json` of the realm's
read functions (`GetTotals`, `GetQuest`, `OpenQuestIDs`, `PaidQuestIDs`,
`QuestIDsByPoster`, `QuestIDsByBuilder`, `CountByPoster`, `CountByBuilder`),
`vm/qpkgmeta_json` to tell "parked, waiting for approval" from "not
deployed", and `/status` for the block height. Identical reads within 4
seconds share one request; failures are never cached.

`src/lib/amino.ts` decodes the typed JSON that `vm/qeval_json` returns and
checks its exact shape (type names, field count, kinds). It uses the JSON form
rather than the printed form of `vm/qeval`, because the printed form writes an
empty string sometimes as `("" string)` and sometimes as `( string)` and needs
Go-style unquoting; the JSON form leaves nothing to guess. The unit tests use
real responses captured from a local node (`src/__fixtures__/`), including
quotes, backslashes, Unicode, newlines, tabs, parentheses, commas and braces.

Everything read from the chain is shown as text (React escapes it; nothing is
rendered as HTML). A work link is a link only if it starts with `https://`;
it opens in a new tab with `rel="noopener noreferrer nofollow"` and shows the
full URL.

## How it signs

`src/lib/wallet.ts` uses the API that the Adena extension injects
(`AddEstablish`, `GetAccount`, `SwitchNetwork`, `AddNetwork`, `DoContract`,
checked against the extension's source, `packages/adena-extension/src/inject.ts`).
Each action is one `/vm.m_call` message:

```json
{ "type": "/vm.m_call",
  "value": { "caller": "g1…", "send": "", "pkg_path": "gno.land/r/…/questmaster",
             "func": "ClaimQuest", "args": ["7"] } }
```

Only `PostQuest` has a `send` (`"5000000ugnot"`).

**With Adena, the wallet chooses the network fee.** `DoContract` takes no gas
fields: Adena estimates the fee and shows it before you sign; the app cannot
set it. The
`gnokey` commands the app shows use `-gas-wanted 10000000 -gas-fee
100000ugnot`, the same as the realm's help page.

## Dependencies

All versions are pinned exactly; `package-lock.json` is committed.
`legacy-peer-deps=true` in `.npmrc` works around an npm 10 resolver crash on
an optional peer of jsdom.

| Package | Version | Licence | Used for |
|---|---|---|---|
| react, react-dom | 19.3.1 | MIT | UI (the only runtime dependencies) |
| vite | 8.3.5 | MIT | dev server and build |
| @vitejs/plugin-react | 6.2.1 | MIT | JSX for Vite |
| typescript | 7.0.2 | Apache-2.0 | type checking |
| vitest | 5.1.0 | MIT | unit tests |
| jsdom | 30.1.3 | MIT | DOM for unit tests |
| @playwright/test | 1.64.1 | Apache-2.0 | end-to-end tests in headless Chromium |
| @types/react, @types/react-dom | 19.3.0 | MIT | types |
