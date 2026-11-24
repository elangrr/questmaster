# Deploying QuestMaster to Onyx

For the owner, with the hackathon-only key `questmaster-deploy` in its own keybase. Every command is copy-paste
ready and targets the Onyx test network only (`onyx-1`, `https://rpc.onyx.testnets.gno.land:443`, test GNOT).

- Deploy address and namespace: `g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8`
- Escrow package: `gno.land/p/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/escrow`
- Realm: `gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster`

This server also runs a node. **Never use, list or touch the server's existing keys or key folders** (the default
gnokey home `~/.config/gno`, or any validator or node key). Every command below passes
`-home "$HOME/.gno-questmaster"`, the keybase that holds only `questmaster-deploy`.

Run everything from the repository root, on the branch that has the final code. Use gnokey from gno v1.8.0.

## 0. Before deploying

```sh
# The code is final: tests, lint and the local real-node flow all pass.
export GNOHOME=$(mktemp -d)   # a throwaway folder, never the folder that holds keys
gno test ./... && gno lint ./... && scripts/local-flow.sh

# The key's address and balance (about 300 GNOT; the two deploys need about 15).
gnokey list -home "$HOME/.gno-questmaster"
gnokey query -home "$HOME/.gno-questmaster" bank/balances/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8 \
  -remote https://rpc.onyx.testnets.gno.land:443
```

## What leaves the wallet

Onyx today: gas price 1 ugnot per 1,000 gas, storage 100 ugnot per byte. The gas fee you set is charged in full,
whatever gas is used.

| Step | Gas needed (estimate) | Gas wanted / fee set below | Storage deposit (measured locally) | Total out of the wallet |
|---|---|---|---|---|
| addpkg p/escrow | about 61 million: 1,250 gas per byte of the 46.7 KB of `.gno` files (charged at submit under Onyx's "inert" policy) plus transaction size | 100,000,000 / 1 GNOT | about 3.8 GNOT (38,205 bytes), taken when the package is enabled | about 4.8 GNOT |
| addpkg r/questmaster | about 164 million (125.9 KB of `.gno` files) | 250,000,000 / 1 GNOT | about 7.8 GNOT (77,696 bytes), taken when the package is enabled | about 8.8 GNOT |
| Each demo call | under 3 million | 10,000,000 / 0.1 GNOT | posting about 0.65 to 0.8 GNOT; others 0 to 0.3 | fee + deposit (+ the reward when posting) |

The deposit is capped by `-max-deposit 30000000ugnot` (30 GNOT) per package. It is taken from this address when the
network's approver enables the package, so keep at least 15 GNOT in the wallet until both packages are live.

Optional dry run: add `-simulate only` to an addpkg command below. It signs and simulates without broadcasting and
prints the gas used, so you can check the estimate first. Nothing is sent.

## (a) Deploy the escrow package

```sh
gnokey maketx addpkg -home "$HOME/.gno-questmaster" \
  -pkgpath "gno.land/p/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/escrow" -pkgdir ./p/escrow \
  -max-deposit 30000000ugnot -gas-fee 1000000ugnot -gas-wanted 100000000 \
  -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 questmaster-deploy
```

It uploads `escrow.gno`, `escrow_test.gno`, `z_example_filetest.gno` and `gnomod.toml`. Note the transaction hash it
prints (for the README).

## (b) Wait until the escrow is live

```sh
gnokey query -home "$HOME/.gno-questmaster" vm/qpkgmeta_json \
  -data "gno.land/p/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/escrow" -remote https://rpc.onyx.testnets.gno.land:443
```

- Parked, waiting for approval:
  `{"path":"gno.land/p/g1llc…/escrow","status":"inert","creator":"g1llc…","height":…,"max_deposit":"30000000ugnot","reason":"waiting for a package approver to enable it","pending":true}`
- Enabled: `{"path":"gno.land/p/g1llc…/escrow","status":"live",…}`
- Not submitted (yet): `{"path":"…","status":"absent"}`
- Any other reason (for example a failed type check) means it will not be enabled: see "If a bug is found" below.

**Official status page.** The approver (gpao, an automated oracle) publishes its verdict per package:
https://gpas.onyx.testnets.gno.land/?path=gno.land/p/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/escrow (and the same
with `gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster` for the realm). The gno docs give
`https://gpas.latest.testnets.gno.land`, which redirects there. Its statuses (from `contribs/gpao/README.md`):

| Status | Meaning | What to do |
|---|---|---|
| `pending` (shown as "in review queue") | not decided yet; it will be retried | wait |
| `approved` | enabled | nothing |
| `rejected`, with a reason | the code did not pass (for example a failed type check) | fix it and deploy to a new `/v2` path (below) |
| `gave_up` | retried up to the limit; needs a human | ask in the Gno.land Discord |
| `blocked` | nothing wrong with the package: the oracle ran out of fees | ask the operator in the Discord |
| `unknown` | never seen | check the path; if still unknown after a minute, ask in the Discord |

The gno docs say a package is enabled "a few seconds after `addpkg`"; on 2026-11-23 the realm stayed "in review
queue" for hours while the escrow was enabled, so plan for waiting. All parked packages:
`gnokey query -home "$HOME/.gno-questmaster" vm/qinertpaths -remote https://rpc.onyx.testnets.gno.land:443`

**Do not submit the realm before the escrow is live**: the approver resolves the realm's imports from the chain, so
it would fail its check.

## (c) Deploy the realm (only after the escrow is live)

```sh
gnokey maketx addpkg -home "$HOME/.gno-questmaster" \
  -pkgpath "gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster" -pkgdir ./r/questmaster \
  -max-deposit 30000000ugnot -gas-fee 1000000ugnot -gas-wanted 250000000 \
  -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 questmaster-deploy
```

It uploads `escape.gno`, `questmaster.gno`, `render.gno`, `questmaster_test.gno`, `render_test.gno`, `gnomod.toml`
and the two files in `filetests/`. Note the transaction hash.

## (d) Wait until the realm is live, then check it

```sh
gnokey query -home "$HOME/.gno-questmaster" vm/qpkgmeta_json \
  -data "gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster" -remote https://rpc.onyx.testnets.gno.land:443

gnokey query -home "$HOME/.gno-questmaster" vm/qeval \
  -data 'gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster.GetTotals()' \
  -remote https://rpc.onyx.testnets.gno.land:443
```

Then open https://onyx.testnets.gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster and check: the
home page shows zero totals; "Help and commands", "Paid quests" and the footer's [source] link work; the help page
shows `-pkgpath "gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster"`. (The realm records its own path
when it is enabled; if links showed an empty path, stop and report it.)

**2026-11-24: the realm is live.** It was submitted at block 1,347,486 (08:39 UTC on 2026-11-23) and enabled after
about 32 hours in the review queue: the status page shows "passed", with a verdict time of 16:58 UTC on 2026-11-24.
Read-only checks at about 20:16 UTC that day, all as expected: `vm/qpkgmeta_json` returns `"status":"live"` (height
1347486); `GetTotals()` is all zeros and `OpenQuestIDs(0, 5)` is empty, since no quest has been posted; the rendered
home, help and paid pages are correct, and the nine commands on the help page carry the realm's own `-pkgpath`;
`vm/qstorage` returns 77,696 bytes and a 7,769,600 ugnot deposit, the same as measured locally.

## (e) The first calls for the demo

The poster is `questmaster-deploy`; the builder is a second test wallet (Adena), funded from the Onyx Faucet.

```sh
# 1. Post a quest with a 5 GNOT reward and a 20,000-block work window (about 19 hours).
gnokey maketx call -home "$HOME/.gno-questmaster" \
  -pkgpath "gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster" -func "PostQuest" \
  -args "Translate the README to Indonesian" -args "Keep the headings. Use plain words." -args "20000" \
  -send "5000000ugnot" -gas-fee 100000ugnot -gas-wanted 10000000 \
  -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 questmaster-deploy

# 2. Builder (in Adena): open the quest page, "Open in gnoweb" next to Claim, sign; then Submit work with a link.

# 3. Approve as the poster (replace 1 with the quest number):
gnokey maketx call -home "$HOME/.gno-questmaster" \
  -pkgpath "gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster" -func "ApproveWork" -args "1" \
  -gas-fee 100000ugnot -gas-wanted 10000000 \
  -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 questmaster-deploy

# 4. A second quest, cancelled, to show the refund:
gnokey maketx call -home "$HOME/.gno-questmaster" \
  -pkgpath "gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster" -func "PostQuest" \
  -args "Old idea" -args "" -args "20000" -send "1000000ugnot" -gas-fee 100000ugnot -gas-wanted 10000000 \
  -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 questmaster-deploy
gnokey maketx call -home "$HOME/.gno-questmaster" \
  -pkgpath "gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster" -func "CancelQuest" -args "2" \
  -gas-fee 100000ugnot -gas-wanted 10000000 \
  -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 questmaster-deploy
```

Check: the builder's balance went up by exactly 5 GNOT; `GetTotals()` shows Paid 5000000 and Refunded 1000000.
Then follow `docs/demo-script.md` for the recording (one paid quest must exist first, which step 3 gives you).

## Record the links

Fill the remaining `TODO-DEPLOY` items in `README.md` (`grep -n TODO-DEPLOY README.md`):

- A quest: `https://onyx.testnets.gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster:quest/1`
- Transactions on GnoScan: `https://gnoscan.io/transactions/details?txhash=<hash>&chainId=onyx-1`
- The realm on GnoScan: `https://gnoscan.io/realms/details?path=gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster&chainId=onyx-1`
- The deploy account on GnoScan: `https://gnoscan.io/account/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8?chainId=onyx-1`
- The demo video

The GnoScan URL forms come from the site's own routes; open each once to make sure it shows Onyx data.

## If a bug is found after deploying

A deployed package cannot be changed or replaced at the same path, and a parked one should not be re-submitted
(an approval names the exact source). Never try to reuse a path. Instead:

1. Fix the code; run all tests and `scripts/local-flow.sh` again.
2. Move to new paths ending in `/v2` on both packages (the gno docs' convention for a new version):
   `gno.land/p/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/escrow/v2` and
   `gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster/v2`. Change the two `gnomod.toml` module lines,
   the escrow import in `r/questmaster` (code, tests) and in `p/escrow/z_example_filetest.gno`, and the realm path in
   the tests, filetests, `scripts/local-flow.sh` and the README. `grep -rn "g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/" .`
   finds them all. Regenerate goldens (`gno test -update-golden-tests ./r/questmaster/`) and run the tests.
3. Deploy the new escrow, wait until it is live, then the new realm (steps a to d).
4. The old realm keeps working with what it holds: open quests there can still be finished or cancelled by their
   posters. Point the README and the demo at the new realm.

## For reference: how the namespace was set

The code was written with the placeholder `questmaster_dev`; `scripts/set-namespace.sh g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8`
replaced it in `p/`, `r/` and `scripts/local-flow.sh` and reran the tests. `r/sys/names.IsAuthorizedAddressForNamespace`
returns true for this address and namespace on Onyx.
