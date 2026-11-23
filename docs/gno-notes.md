# Gno notes for QuestMaster

Checked on 2026-11-23 against gno **v1.8.0** (commit `fc79041f4cd1a7b3ed4b316dc5ac14162eb78730`), the version that both
mainnet (`gnoland-1`) and Onyx (`onyx-1`, as `v1.8.0-rc.1` at the same commit) run.
Sources: the docs at https://docs.gno.land, and `docs/`, `gnovm/stdlibs/`, `gnovm/tests/stdlibs/` and `examples/` in the
gno repo at that tag.

## Toolchain

| What | Status | Source |
|---|---|---|
| Version to use: v1.8.0 (`fc79041f4`) | confirmed | `misc/deployments/{mainnet,onyx}.gno.land/UPGRADES.md` on branch `chain/mainnet` |
| Build needs Go 1.25.9 (`go.mod`); `GOTOOLCHAIN=go1.25.9 make install.gno install.gnodev` fetches it | confirmed | `go.mod` |
| `gno fmt` has `-w` and `-diff` (no `-l`) | confirmed | `gno fmt -h` |
| `gno lint` and `gno test ./...` need a `gnowork.toml` at the repo root (empty file) | confirmed | docs/resources/configuring-gno-projects.md |
| `gno` downloads missing dependencies (e.g. `p/nt/avl/v0`, `p/nt/uassert/v0`) from the chain into `$GNOHOME/pkg/mod`. The default `GNOHOME` is `~/.config/gno`, which is also gnokey's default key folder, so set `GNOHOME` to a separate folder when running the tools. The downloaded `avl` code was checked identical to the v1.8.0 examples. | confirmed | `gno env`, observed |

## Section 2 of the plan

| Plan fact | Status | Notes / source |
|---|---|---|
| `gno.land/p/nt/avl/v0` | confirmed | `examples/gno.land/p/nt/avl/v0/gnomod.toml` |
| `chain/banker`, `banker.NewBanker(banker.BankerTypeRealmSend, cur)` | confirmed | `gnovm/stdlibs/chain/banker/banker.gno`; signature is `NewBanker(bt BankerType, rlm realm) Banker` and `rlm` must be the live `cur` (panics otherwise). Read-only access is a separate `NewReadonlyBanker()`. |
| `chain` (coins, `chain.Emit`) | confirmed | `gnovm/stdlibs/chain/emit_event.gno`: `func Emit(typ string, attrs ...string)` |
| `chain/runtime`, `runtime.ChainHeight()` | confirmed | `gnovm/stdlibs/chain/runtime/native.gno`: `func ChainHeight() int64` |
| `unsafe.OriginSend()` / `unsafe.PreviousRealm()` | **corrected (import path)** | They live in package `unsafe` at import path **`chain/runtime/unsafe`** (not a top-level `unsafe`). `OriginSend() chain.Coins`, `PreviousRealm() runtime.Realm`. |
| Caller comes from `unsafe.PreviousRealm()` | **corrected (preferred form)** | The package doc of `chain/runtime/unsafe` and docs/resources/gno-interrealm-v2.md §5.4 say to use **`cur.Previous()`** on the `cur realm` parameter for caller identity; `unsafe.PreviousRealm()` stack-walks and is flagged as footgun-prone. Use `cur.Previous().Address()` in the realm. |
| Payment check with `OriginSend()` | **added requirement** | `unsafe.OriginSend` doc: when used for payment verification, pair it with `runtime.AssertOriginCall()` and `cur.Previous().IsUserCall()` (not `IsUser()`), because a middle realm could consume the send envelope. |
| `cur realm` crossing form | confirmed | gno-interrealm-v2.md §5: `func F(cur realm, ...)`, `cur` must be the first parameter, only in `/r/` packages, never in `/p/`. Call from another realm as `F(cross(cur), ...)`. |
| `gnomod.toml` format | confirmed | `module = "<path>"` and `gno = "0.9"`. An `[addpkg]` section is filled by the chain at deploy time; a module with `[[replace]]` cannot be deployed. |
| `testing` helpers `SetRealm`, `NewUserRealm`, `SetOriginSend`, `IssueCoins`, `SkipHeights` | confirmed | `gnovm/tests/stdlibs/testing/context_testing.gno`. Also there: `SetOriginCaller`, `SetHeight`, `NewCodeRealm`. `NewUserRealm(addr) runtime.Realm`. |
| Panic vs error | note | docs/resources/effective-gno.md: realms should panic to revert; reusable packages should return errors. `p/escrow` returns errors; the realm should panic with `err.Error()`. |

## Namespace (decision still open)

`p/escrow/gnomod.toml` uses the placeholder `gno.land/p/questmaster_dev/escrow`, which works for local `gno test`.

What the docs say:

- Anyone can deploy under their own address namespace, `gno.land/p/<g1-address>/...` and `gno.land/r/<g1-address>/...`, with nothing to register (https://docs.gno.land/resources/users-and-teams, https://docs.gno.land/builders/deploy-packages).
- A name namespace (`gno.land/r/<name>/...`) needs the name registered in `r/sys/users` first. One registered name owns both `r/<name>/*` and `p/<name>/*` (`examples/gno.land/r/sys/names/verifier.gno`). The users-and-teams page still says username namespaces are "not currently supported", which is out of date against the verifier code.
- Onyx enables this name check from block 1 (`r/sys/names.Enable` at genesis, per the Onyx deployment README), so the placeholder `questmaster_dev` path cannot be deployed on Onyx unless that exact name is registered to the deploying key.

Change before deployment:

1. `p/escrow/gnomod.toml`: `module = "gno.land/p/<namespace>/escrow"`.
2. `r/questmaster/gnomod.toml`: its `module` line. `r/questmaster/questmaster.gno`, `questmaster_test.gno` and `filetests/*`: the import of the escrow package and the realm path (also the expected `pkg_path` in the events filetest; regenerate with `gno test -update-golden-tests`).
3. Any import of the escrow package in tests or docs (`grep -rn questmaster_dev .`).

## Block time and window constants (measured 2026-11-23, read-only RPC)

| Network | Blocks | From | To | Seconds per block |
|---|---|---|---|---|
| Onyx (`onyx-1`) | 1,293,717 to 1,343,717 (50,000) | 2026-11-21T05:29:53Z | 2026-11-23T05:04:18Z | 3.425 |
| Onyx | 1,333,717 to 1,343,717 (10,000) | 2026-11-22T19:33:39Z | 2026-11-23T05:04:18Z | 3.424 |
| Mainnet (`gnoland-1`) | 1,705,927 to 1,755,927 (50,000) | 2026-11-21T03:43:56Z | 2026-11-23T05:04:17Z | 3.552 |
| Mainnet | 1,745,927 to 1,755,927 (10,000) | 2026-11-22T19:18:13Z | 2026-11-23T05:04:17Z | 3.516 |

Source: `/status` and `/block?height=` on `https://rpc.onyx.testnets.gno.land:443` and `https://rpc.gno.land:443`.
Assumed block time for the constants: 3.5 s.

| Constant (p/escrow) | Target | Maths at 3.5 s | Chosen | Real time at 3.42 s / 3.55 s |
|---|---|---|---|---|
| `MinWorkBlocks` | about 1 hour | 3,600 / 3.5 = 1,029 | 1,000 | 57 min / 59 min |
| `ReviewBlocks` | about 3 days | 259,200 / 3.5 = 74,057 | 75,000 | 2.97 d / 3.08 d |
| `MaxWorkBlocks` | about 90 days | 7,776,000 / 3.5 = 2,221,714 | 2,200,000 | 87 d / 90 d |

The block time can change with chain upgrades, so the README should state windows in blocks with the
approximate time.

## Realm caller and payment guard (v1.8.0)

- Every state-changing function in `r/questmaster` requires `cur.Previous().IsUserCall()` (a direct
  `gnokey maketx call`) and takes the actor from `cur.Previous().Address()`. Sources:
  docs/resources/effective-gno.md ("use `IsUserCall()` instead of `IsUser()`"),
  docs/resources/gno-security-guide.md and gno-ai-contract-review.md ("Payment-guarded entry points use
  `cur.Previous().IsUserCall()`").
- `IsUserCall()` is false for other realms and for `maketx run` scripts (they run as the ephemeral realm
  `gno.land/e/<addr>/run`), so it already rules out MsgRun.
- `runtime.AssertOriginCall()` is **not** added. effective-gno.md says it "rejects `testing.NewUserRealm`-based
  unit tests in some configurations"; tried here, it makes every realm test and the filetest fail with
  "invalid non-origin call". Since `IsUserCall()` alone is the documented payment guard and already refuses
  realms and MsgRun, adding it would only make the realm untestable.

## Test harness facts (v1.8.0), learned while writing the realm tests

- Realm tests have the form `func TestX(cur realm, t *testing.T)` and call the realm as `F(cross(cur), ...)`.
- `testing.SetRealm` changes the realm of the frame that calls it, so it must be called in the same function
  that then does `cross(cur)`, not in a shared helper.
- A panic does **not** roll back realm state in `gno test` (checked with a test-only function that wrote a
  variable and then panicked). On chain, the whole transaction reverts. The tests therefore snapshot all
  state before each failing call and check that it is unchanged.
- Bank balances reset between test functions; realm variables do not. Tests reset the realm's variables at
  the start.
- `testing.SetOriginSend` only sets what `unsafe.OriginSend()` returns; it moves no coins.
  `testing.IssueCoins(realmAddress, coins)` simulates the deposit that `-send` makes on chain.
- `uassert.Equal` does not accept custom types such as `escrow.State` or `address`: compare `.String()`.
- In filetests, an `// Events:` block is checked when it is non-empty; `gno test -update-golden-tests`
  writes the actual events.
- A function may take a `realm` as a non-first parameter, but it must not be named `cur`.

## Local check with gnodev

`gnodev local -txs-file <file>` replays genesis transactions with no signature, and their signers are
premined, so a `PostQuest` call can be checked without creating or importing any key. gnodev keeps its
built-in test1 key in `<-home>/data/keys.db`; `-home` defaults to `GNOHOME`, so keep that pointed at a
throwaway folder.

## gnoweb and Render (v1.8.0)

- gnoweb calls `Render` with everything after `:` in the URL, query string included:
  `/r/ns/questmaster:quest/3?page=2` gives `Render("quest/3?page=2")`, and `/r/ns/questmaster?page=2` gives
  `Render("?page=2")` (`weburl.EncodeArgs`, `gno.land/pkg/gnoweb/weburl/url.go`). The realm splits off and
  parses the query itself with `net/url`.
- Transaction links: `/r/<path>$help&func=Fn&arg=value&.send=1000000ugnot` opens gnoweb's form for `Fn`
  with arguments prefilled (GnoConnect, docs/resources/gnoconnect.md). The realm builds them with
  `gno.land/p/moul/txlink/v0` (`txlink.Realm(path).NewLink(fn).AddArgs(...).SetSend(...)`). For `.send`,
  gnoweb shows a warning with the amount and the user must switch on "add coins" before signing. The
  amount comes from the link, so the pages offer 1, 5 and 10 GNOT links. Checked on gnodev's gnoweb.
- Escaping: `gno.land/p/nt/markdown/sanitize/v0` (InlineText, TableCell, URL, ...) is the sanitizer that
  gnoweb's own markdown tests use (`gno.land/pkg/gnoweb/markdown/SANITIZE.md`). It is deployed on Onyx and
  mainnet. Two gaps for this realm: `Blockquote`/`Block` keep inline links and images, so multi-line text
  is escaped line by line with `TableCell` instead; and gnoweb's mention parser turns `@name` and ` g1…`
  (an address after a space) into profile links, which the sanitizer does not stop, so `@` becomes `\@` and
  the space before `g1` becomes `&#32;`. Both are checked in the realm tests and on the real gnoweb.
- `unsafe.CurrentRealm()` inside `Render` depends on the caller's frame: called from a test it returned an
  empty path. The realm captures its package path once in `init()` instead. On gnodev the links came out
  right.
- gnoweb serves the raw Markdown of a page with the request header `Accept: text/markdown`.

## Storage deposit (measured on gnodev, default price 100 ugnot per byte)

- Every call that grows a realm's stored data locks a deposit from the caller; it goes to the address
  derived from `pkgPath:<realm path>.storageDeposit` (`gno.DeriveStorageDepositCryptoAddr`), not to the
  realm's own address. So the realm's balance holds only escrowed rewards.
- When a call makes the stored data smaller, the freed share goes back to that caller. On a network where
  `ugnot` transfers are restricted (`bank:p:restricted_denoms`), it goes to the storage fee collector
  instead (`gno.land/pkg/sdk/vm/keeper.go`, `processStorageDeposit`).
- Measured per call on the local flow: posting a quest about 0.65 GNOT (647,600 ugnot), approve 102,800,
  claim about 0.29 GNOT; cancelling returned 97,800 to the poster. The cap per call is `-max-deposit`
  (default 100 GNOT on the chain).
- Gas: one PostQuest used about 2.1M VM gas in a filetest; the example commands use `-gas-wanted 50000000`.

## Local flow on gnodev without keys

`scripts/local-flow.sh` boots gnodev with a file of genesis transactions (`-txs-file`). Genesis
transactions go through the same `Deliver` path as normal ones (bank, storage deposit, revert on error)
but need no signature, only the caller's public key, so no key is created or used. Each stage reboots
with the transactions so far and reads balances, totals, storage and pages.

## Onyx facts (read-only queries, 2026-11-23, height about 1,344,400)

All queries are ABCI queries to `https://rpc.onyx.testnets.gno.land:443` (`/abci_query?path="<path>"&data=0x<hex>`);
`gnokey query <path> -data "<data>" -remote https://rpc.onyx.testnets.gno.land:443` gives the same.

| Query | Result | Meaning |
|---|---|---|
| `auth/gasprice` | `{"gas":"1000","price":"1ugnot"}` | Current minimum gas price: 1 ugnot per 1,000 gas. A fee must be at least `gas-wanted / 1000` ugnot. The price is dynamic (`params/auth:p:target_gas_ratio` = 70) and can rise when blocks are full. |
| `params/auth:p:initial_gasprice` | `{"gas":"1000","price":"1ugnot"}` | Same as the current price. |
| `params/vm:p:storage_price` | `"100ugnot"` | Storage deposit: 100 ugnot per byte. |
| `params/vm:p:default_deposit` | `"100000000ugnot"` | Deposit cap per message when `-max-deposit` is not given: 100 GNOT. |
| `params/bank:p:restricted_denoms` | `[]` | ugnot is not restricted, so a freed deposit goes back to the caller who freed it (not to the storage fee collector `g1c9stkafpvcwez2efq3qtfuezw4zpaux3tvxggk`). |
| `params/vm:p:code_submission_policy` | `"inert"` | **A new package is parked until a package approver enables it.** |
| `params/vm:p:pkg_approvers` | 7 addresses, first `g1yaee4f2qt8yyzse54wq7r897ndupnvxcyl6adz` (gpao, the approvals oracle) | gpao (`contribs/gpao`) watches new `addpkg` transactions, typechecks and preprocesses each package within a time budget, and if it passes sends `MsgEnablePackage`. Imports are resolved from the chain, so `p/escrow` must be live before `r/questmaster` is submitted. |
| `params/vm:p:inert_submission_charge` | `""` | No charge for submitting. |
| `params/vm:p:run_submitters` | one address | `gnokey maketx run` is closed to everyone else; QuestMaster only needs `maketx call`. |
| `params/vm:p:syscla_pkgpath` + `vm/qrender` `gno.land/r/sys/cla:` | "CLA enforcement is currently DISABLED. All package deployments are allowed." | No CLA to sign today. |
| `vm/qeval` `gno.land/r/sys/names.IsEnabled()` | `true` | Namespace check is on. |
| `vm/qeval` `gno.land/r/sys/names.IsAuthorizedAddressForNamespace(address("g1jg8m…sqf5"), "g1jg8m…sqf5")` | `true` | An address may deploy under its own address namespace. |
| same with namespace `"questmaster_dev"` | `false` | The placeholder cannot be deployed as is. |
| `vm/qrender` `gno.land/r/sys/namereg/v0:` | names must be `nym-<5 to 13 lowercase letters><3 digits>`, 12 to 20 characters, stem not starting with gno, gl, atom, atone, photon, cosmos, no reserved role names; "Registration price: 0.000000 GNOT (0ugnot)"; register via `Register` on `r/sys/namereg/v0` | A free name such as `nym-fluxen123` gives `gno.land/{p,r}/nym-fluxen123/*`. |
| `vm/qfile` `gno.land/p/nt/avl/v0`, `gno.land/p/moul/txlink/v0`, `gno.land/p/nt/markdown/sanitize/v0` | file lists returned | All three dependencies are live on Onyx at the paths we import. |
| `vm/qinertpaths` | 68 parked packages, among them recent ones | Approval is not instant and not guaranteed. |
| `vm/qpkgmeta_json` `<path>` | e.g. `{"status":"inert",...,"reason":"waiting for a package approver to enable it","pending":true}` or `{"status":"live",...}` | How to check whether a submitted package is live yet. |
| `auth/accounts/g1yaee4f…` (gpao) | sequence 1190 at heights 1,344,383 and 1,344,441 | gpao has sent about 1,190 approvals in total; no new one in that 5-minute window, while a small package submitted at height 1,343,990 was still parked. Deploy early and check. |

Other facts:

- gnoweb for Onyx: `https://onyx.testnets.gno.land` (its pages carry `<meta name="gnoconnect:chainid" content="onyx-1">`). A realm is at
  `https://onyx.testnets.gno.land/r/<namespace>/questmaster`, a page at `…/questmaster:quest/1`.
- Explorer: GnoScan (`https://gnoscan.io`) lists Onyx (`chainId: "onyx-1"`, RPC `https://rpc.onyx.testnets.gno.land:443`) in its
  network list. From its front-end routes (read from the site's JavaScript, not documented): realm
  `https://gnoscan.io/realms/details?path=gno.land/r/<namespace>/questmaster&chainId=onyx-1`, transaction
  `https://gnoscan.io/transactions/details?txhash=<hash>&chainId=onyx-1`, account
  `https://gnoscan.io/account/<g1address>?chainId=onyx-1`. Check each link once after deploying.
- Faucet: `https://faucet.gno.land`, entry "Onyx Faucet" (`chain_id: "onyx-1"`, served by
  `https://faucet.onyx.testnets.gno.land`), with request amounts 100, 200 or 300 test GNOT and a captcha (from the faucet
  site's configuration in its JavaScript). Per-address limits are not stated.
- Gas actually used (filetests, VM gas including storage writes): PostQuest about 2.1M to 2.7M; a whole quest
  lifecycle of 17 calls 10.4M. Recommended for every QuestMaster call: `-gas-wanted 10000000 -gas-fee 100000ugnot`
  (the minimum fee for 10M gas is 10,000 ugnot at today's price; 100,000 ugnot is 0.1 test GNOT and leaves room if
  the price rises). gnokey simulates a transaction before broadcasting (default `-simulate test`), so too little gas
  fails before anything is paid. The help page in `r/questmaster/render.gno` still shows
  `-gas-fee 1000000ugnot -gas-wanted 50000000` (1 GNOT per call): to be changed in the next code task.
- Deploying (`gnokey maketx addpkg`): flags `-pkgpath`, `-pkgdir`, `-max-deposit`, plus `-gas-fee`, `-gas-wanted`,
  `-broadcast`, `-chainid`, `-remote`. It uploads every file in the folder, tests included. Sizes: `p/escrow` about
  36 KB, `r/questmaster` about 101 KB (with filetests); on gnodev the realm's stored size after deploy was about 66 KB,
  so a 6.6 GNOT deposit. Use `-max-deposit 30000000ugnot` for each package.
- Licence: the gno repo, which includes the three packages we import, is under the GNO Network General Public License
  v6 with an "Additional Terms (Strong Attribution)" clause: a user interface that uses a covered work must show an
  attribution link to "a URL designated by the Licensor", with up to three words such as "built on". No URL is named
  in the repo at v1.8.0; we use https://gno.land as our best reading. The licence text has no "Everyone is permitted
  to copy and distribute verbatim copies" sentence, but its section "How to Apply These Terms to Your New Programs"
  invites other authors to license their programs under it; our LICENSE follows that section. This is our reading,
  not legal advice.

## Hardening after the security review (task 5)

### Closing a claimed or submitted quest

`CancelQuest` on a Claimed or Submitted quest marks it closing (`escrow.Quest.Closing()`, `QuestView.Closing`) and
moves no coins; a second call fails with "escrow: the quest is already closing". While closing, the current builder
keeps every right (submit until the work deadline, approval, timeout payout), and every move that would reopen the
quest (Unclaim, Release after the work deadline, Reject) ends it instead: Cancelled, with a RefundPoster payout that
the realm sends in the same call. In `p/escrow`, `Unclaim`, `Release` and `Reject` now return `(Payout, error)`; a
zero Payout (`Due() == false`) means no transfer. A non-zero Payout is only returned together with a move into a
final state, and `cancel()` is the only place that builds a refund. Events: `QuestClosing` (id, actor);
`QuestCancelled` now carries `how` = `open`, `unclaimed`, `released` or `rejected`.

### Review window

`ReviewBlocks` is 172,800 (7 days at 3.5 s; 6.8 days at Onyx's measured 3.42 s). The home and help pages warn
posters that a silent poster pays any submission after the window.

### Escaping additions

The sanitizer does not escape `$`, and gnoweb renders `$…$` and `$$…$$` as math; every user-text helper now turns
`$` into `\$`. gnoweb's mention parser links an address after a space, and the realm itself puts a space before user
text in headings (`# Quest 1: `), table cells and quote lines, so a `g1` at the start of user text becomes
`&#103;1`. Both were checked in gnoweb's real HTML (stage 9 of `scripts/local-flow.sh`): no `<math>`, no `/u/g1`
link, and the text shows as typed.

### Two messages in one transaction

Stage 10 of `scripts/local-flow.sh` sends one (unsigned genesis) transaction with two `PostQuest` messages, sending
2 and 3 GNOT. Each quest stored its own reward and the realm received exactly 5 GNOT: `unsafe.OriginSend()` is per
message.

### ugnot restrictions

`params/bank:p:restricted_denoms` read on 2026-11-23: `[]` on Onyx and `[]` on mainnet (`gnoland-1`, read-only, for
reference only). If a network lists `ugnot` there, realm payouts (bank transfers) would not go through and freed
storage deposits would go to the storage fee collector.

### Where the storage deposit of a quest goes

Measured with filetests (`storage: +N bytes`) on variants of the realm with one index removed at a time; posts by
the same poster after the first; 100 ugnot per byte on Onyx.

| Part | Bytes per post | GNOT per post |
|---|---|---|
| The quest object (`escrow.Quest`, with title and details) and its node in `quests` | about 3,600 | about 0.36 |
| Its entry in `openIDs` | about 2,000 | about 0.20 |
| Its entry in the poster's `byPoster` tree | about 2,000 | about 0.20 |
| Total per post | about 7,600 | about 0.76 |
| Once per new poster: the poster's own index tree | about 1,800 | about 0.18 |
| Text | about 1 per character | 0.0001 per character |

A first claim by a builder costs about 1,900 bytes (their `byBuilder` tree); later claims are about neutral, because
the new `byBuilder` entry replaces the removed `openIDs` entry.

Cheapest reductions (not done; estimates from the table):

1. Keep each user's quest ids in a `[]uint64` inside one struct per user instead of an avl tree per user: about
   8 bytes per id instead of about 2,000, and no 1,800-byte tree per new user. Saves about 0.20 GNOT per post and
   0.18 GNOT per new poster or builder. Cost: every append rewrites the slice (gas grows with the user's number of
   quests).
2. Drop `openIDs` and find open quests by scanning `quests` from the newest: saves about 0.20 GNOT per post. Cost:
   the home page reads more quests when many are closed, so `Render` gets slower as the board grows.
3. Do both: about 0.36 to 0.40 GNOT per post instead of about 0.76.
