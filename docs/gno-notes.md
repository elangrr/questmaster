# Gno notes for Questboard

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

`p/escrow/gnomod.toml` uses the placeholder `gno.land/p/questboard_dev/escrow`, which works for local `gno test`.

What the docs say:

- Anyone can deploy under their own address namespace, `gno.land/p/<g1-address>/...` and `gno.land/r/<g1-address>/...`, with nothing to register (https://docs.gno.land/resources/users-and-teams, https://docs.gno.land/builders/deploy-packages).
- A name namespace (`gno.land/r/<name>/...`) needs the name registered in `r/sys/users` first. One registered name owns both `r/<name>/*` and `p/<name>/*` (`examples/gno.land/r/sys/names/verifier.gno`). The users-and-teams page still says username namespaces are "not currently supported", which is out of date against the verifier code.
- Onyx enables this name check from block 1 (`r/sys/names.Enable` at genesis, per the Onyx deployment README), so the placeholder `questboard_dev` path cannot be deployed on Onyx unless that exact name is registered to the deploying key.

Change before deployment:

1. `p/escrow/gnomod.toml`: `module = "gno.land/p/<namespace>/escrow"`.
2. `r/questboard/gnomod.toml` (later task): its `module` line, and its import of `gno.land/p/<namespace>/escrow`.
3. Any import of the escrow package in tests or docs (`grep -rn questboard_dev .`).
