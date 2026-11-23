# QuestMaster web app

A static, client-only web app for the QuestMaster realm. It reads the board
straight from a Gno.land node (no server, no database, no analytics, no
third-party scripts) and signs actions with the
[Adena](https://adena.app) browser wallet. gnoweb stays the built-in
fallback: every action also offers the matching `gnokey` command and gnoweb
form.

It targets the **Onyx test network (`onyx-1`) with test GNOT only**.

**The app asks CoinGecko for the GNOT price; nothing else leaves the page
except chain queries.** See [Dollar hint](#dollar-hint) for exactly what is
sent and how to turn it off.

## Run it

Needs Node 22 and npm 10.

```sh
cd web
npm ci            # installs the exact versions in package-lock.json
npm run dev       # http://localhost:5173, talking to Onyx
```

## Test it

```sh
npm test          # unit tests (Vitest): decoder, amounts, time, validation, wallet messages, dollar hint
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
   screenshots to `e2e/out/screenshots/`. The GNOT price request is answered
   inside the test, never sent to CoinGecko. Checks include: no animation
   left running under `prefers-reduced-motion`, no layout shift from the hero
   diagram, and the three transaction steps with a mocked Adena.

Videos and Lighthouse numbers (phone profile) for reviews come from
`e2e/media.spec.ts`, which runs only when given an output folder:
`QM_MEDIA=<folder> node e2e/run-e2e.mjs e2e/media.spec.ts`. It fetches
Lighthouse with `npx`; Lighthouse is not a dependency.

The share-card image `public/og.png` is rendered from
`scripts/og-image.html` with `node scripts/og-image.mjs`.

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
| `VITE_GNOT_USD_SOURCE` | `coingecko` | where the dollar hint gets the GNOT price; `off` sends no request and shows no dollar figures |
| `VITE_GNOT_USD` | empty | a GNOT price in US dollars set by hand (for example `0.05`); when set, nothing is fetched |

## Dollar hint

Next to each GNOT amount the app shows roughly what it is worth in US
dollars, for example `5 GNOT · ≈ $0.25`. GNOT stays the main number; the
dollar figure is smaller and muted. On Onyx this is **test GNOT with no
value**: the figure is what the same number of mainnet GNOT would be worth at
the current market price, and the tooltip and the footer say so, with the
price used and when it was fetched.

- **Source:** CoinGecko's keyless public API, coin id `gno-land` (Gno.land's
  GNOT, home page gno.land; traded on Kraken and KuCoin). The one request is
  `GET https://api.coingecko.com/api/v3/simple/price?ids=gno-land&vs_currencies=usd`.
  CoinGecko answers with CORS `*`.
- **What is sent:** that URL only. No cookies (`credentials: "omit"`), no
  referrer (`referrerPolicy: "no-referrer"`), nothing about the user, their
  wallet or their address.
- **When:** after the page has rendered, never blocking it. It gives up after
  3.5 seconds. The price is cached in memory and in `localStorage` for
  5 minutes, so browsing the app makes at most one request per 5 minutes.
- **Failure:** any error, timeout, rate limit or odd reply hides the dollar
  figures quietly. A reply that is not a sane price for `gno-land` is ignored.
- **Never used for transactions:** amounts sent are always the exact ugnot
  typed; the dollar figure is display only (`src/lib/price.ts`).
- **Turn it off:** build with `VITE_GNOT_USD_SOURCE=off`, or set
  `VITE_GNOT_USD` to fix the price by hand.

## Design and motion

**Sizing.** Every size comes from the tokens at the top of `src/styles.css`:
a type scale by role (display, title, section, card, lead, body, small,
micro, number, mono, code; headings and numbers step down on phones), the
spacing scale 4/8/12/16/24/32/48, one control height (44 px; small buttons
36 px, and 44 px on phones), card/control/inset/pill radii, one border width,
icon sizes per context, and one content width and gutter per breakpoint
(phone < 700 px, tablet, desktop >= 1100 px). Two checks keep it that way:
`src/styles.test.ts` fails on raw px or font sizes outside the tokens, and
the e2e "sizing" tests measure every page at 390 and 1280 px and fail when
the same role (for example "section title" or "button (regular)") has more
than one size, a page overflows at 360 px, or a phone control is under
44 px. `QM_AUDIT=<folder> node e2e/run-e2e.mjs e2e/audit.spec.ts` writes the
full audit (all pages, 360-1280 px, light and dark), and
`node e2e/audit-report.mjs <folder>` turns it into a table.

Colours, type sizes, spacing and motion timings are tokens at the top of
`src/styles.css`, with a light ("parchment") and a dark theme. Headings use the
system serif stack, body text the system sans; no web fonts are downloaded.
Visuals are inline SVG in `src/ui/visuals.tsx` (the mark, the quest-flow
diagram, the quest stepper, deadline bars, skeletons, small illustrations);
motion helpers are in `src/ui/motion.ts`. There is no animation library.

- Under `prefers-reduced-motion: reduce` every animation and transition
  settles at once: the diagram is shown in its final state and totals appear
  without counting.
- The hero diagram loops quietly and pauses when it is off-screen or the tab
  is hidden.
- Loaders are skeletons the same size as what replaces them, so content does
  not jump.

## Track records

Each address's record (as poster and as builder) is computed in the browser
from the realm's own reads: `CountByPoster`/`CountByBuilder`, then the
latest ids in pages of 50 (`QuestIDsByPoster`/`QuestIDsByBuilder`), then one
`GetQuest` per id, at most 6 at a time. It looks at the latest 100 quests per
address and says "latest 100 of N" when there are more. Records load after
the page's main content, are cached per address for the session (cleared
after a transaction), and fail quietly: the summary stays empty and nothing
else is affected. The maths is in `src/lib/record.ts`; what the realm does not
store (who was the builder at each rejection, approval versus timeout payout)
is stated on the address page instead of guessed.

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
