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
