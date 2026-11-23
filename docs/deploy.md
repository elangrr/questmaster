# Deploying QuestMaster to Onyx

A checklist for the owner, with a key made only for this hackathon. Every command targets the Onyx test
network (`onyx-1`, `https://rpc.onyx.testnets.gno.land:443`) and uses test GNOT. Never point these
commands at another network.

Values used below (read from Onyx on 2026-11-23, see `docs/gno-notes.md`):

- Gas price 1 ugnot per 1,000 gas. Calls: `-gas-wanted 10000000 -gas-fee 100000ugnot`. Deploys:
  `-gas-wanted 100000000 -gas-fee 1000000ugnot`.
- Storage deposit 100 ugnot per byte. Each deploy: `-max-deposit 30000000ugnot` (30 GNOT cap; about 4 to 7 GNOT
  expected).
- New packages are **parked** until the network's package approver (gpao) enables them. Plan for waiting.

## 1. Key and funds (owner only)

1. Create a new key used only for this hackathon. The seed phrase is shown once: write it down offline and never
   paste it into a chat, a file in this repo, or a bot.
   ```sh
   gnokey add questmaster-deploy
   gnokey list          # note the g1 address of questmaster-deploy
   ```
2. Make a second wallet for the demo builder (for example in Adena), also test-only.
3. Fund both from https://faucet.gno.land, "Onyx Faucet" (100, 200 or 300 test GNOT per request). The deploy key
   needs about 20 GNOT (deposits and fees) plus the rewards you plan to post.
   ```sh
   gnokey query bank/balances/<g1-address> -remote https://rpc.onyx.testnets.gno.land:443
   ```

## 2. Choose the namespace

Either is fine; the address is simplest.

- **Your address**: `gno.land/p/<g1-address>/escrow` and `gno.land/r/<g1-address>/questmaster`. Nothing to register.
  Check: `gnokey query vm/qeval -data 'gno.land/r/sys/names.IsAuthorizedAddressForNamespace(address("<g1-address>"), "<g1-address>")' -remote https://rpc.onyx.testnets.gno.land:443` must print `(true bool)`.
- **A name** such as `nym-fluxen123`: free on Onyx. Format `nym-<5 to 13 lowercase letters><3 digits>`, stem not
  starting with gno, gl, atom, atone, photon or cosmos. Register it from the deploy key with the "Click here to
  register" link on https://onyx.testnets.gno.land/r/sys/namereg/v0 (function `Register`), then run the same
  `IsAuthorizedAddressForNamespace` check with the name.

## 3. Replace the placeholder namespace

The code uses the placeholder `questmaster_dev`. It appears in:

| File | What |
|---|---|
| `p/escrow/gnomod.toml` | `module = "gno.land/p/questmaster_dev/escrow"` |
| `p/escrow/z_example_filetest.gno` | the escrow import in the README example |
| `r/questmaster/gnomod.toml` | `module = "gno.land/r/questmaster_dev/questmaster"` |
| `r/questmaster/questmaster.gno`, `render.gno` | the escrow import (and a comment) |
| `r/questmaster/questmaster_test.gno`, `render_test.gno` | the escrow import, the realm path and address in tests |
| `r/questmaster/filetests/z_events_filetest.gno`, `z_pages_filetest.gno` | the realm import, path and expected output |
| `scripts/local-flow.sh` | the realm path for the local flow |

One command does all of it and reruns the tests (it only edits files; it never calls gnokey):

```sh
GNOHOME=$HOME/.gno-builder scripts/set-namespace.sh <g1-address or nym-name>
grep -rn questmaster_dev p r scripts/local-flow.sh    # must print nothing
```

Also replace `NAMESPACE` in `README.md` (`grep -n NAMESPACE README.md`). Commit the change on a branch.

## 4. Deploy the escrow package, wait until it is live

```sh
gnokey maketx addpkg -pkgpath "gno.land/p/<ns>/escrow" -pkgdir ./p/escrow \
  -max-deposit 30000000ugnot -gas-fee 1000000ugnot -gas-wanted 100000000 \
  -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 questmaster-deploy
```

Note the transaction hash it prints. Then check the status until it says `"status":"live"`:

```sh
gnokey query vm/qpkgmeta_json -data "gno.land/p/<ns>/escrow" -remote https://rpc.onyx.testnets.gno.land:443
```

`"status":"inert"` with "waiting for a package approver to enable it" means it is parked. On 2026-11-23 Onyx had 68
parked packages, some for a long time, so do this early (days before the deadline, not hours). If it stays parked,
ask in the Gno.land Discord. Do not deploy the realm before the escrow is live: the approver resolves imports from
the chain, so the realm would fail its check.

## 5. Deploy the realm, wait until it is live

```sh
gnokey maketx addpkg -pkgpath "gno.land/r/<ns>/questmaster" -pkgdir ./r/questmaster \
  -max-deposit 30000000ugnot -gas-fee 1000000ugnot -gas-wanted 100000000 \
  -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 questmaster-deploy

gnokey query vm/qpkgmeta_json -data "gno.land/r/<ns>/questmaster" -remote https://rpc.onyx.testnets.gno.land:443
```

## 6. Check it on gnoweb

- https://onyx.testnets.gno.land/r/<ns>/questmaster shows the home page with zero totals.
- The links "Help and commands" and "Paid quests" work; the help page shows `-pkgpath "gno.land/r/<ns>/questmaster"`.
- `gnokey query vm/qeval -data 'gno.land/r/<ns>/questmaster.GetTotals()' -remote https://rpc.onyx.testnets.gno.land:443`

## 7. One full quest with two wallets

Follow `docs/demo-script.md` (it is the same flow): the deploy key posts with 5 GNOT, the builder wallet claims and
submits a link, the poster approves. Check that the builder's balance went up by exactly 5 GNOT and that
`GetTotals()` shows Locked 0 and Paid 5000000. Also post a second quest and cancel it, to show the refund.

## 8. Record the links

Fill every `TODO-DEPLOY` in `README.md` (`grep -rn TODO-DEPLOY .`):

- Realm: `https://onyx.testnets.gno.land/r/<ns>/questmaster`
- Package: `https://onyx.testnets.gno.land/p/<ns>/escrow`
- A quest: `https://onyx.testnets.gno.land/r/<ns>/questmaster:quest/1`
- Transactions on GnoScan: `https://gnoscan.io/transactions/details?txhash=<hash>&chainId=onyx-1`
- Accounts on GnoScan: `https://gnoscan.io/account/<g1-address>?chainId=onyx-1`
- The realm on GnoScan: `https://gnoscan.io/realms/details?path=gno.land/r/<ns>/questmaster&chainId=onyx-1`

The GnoScan URL forms come from the site's own routes; open each once to make sure it shows Onyx data.
