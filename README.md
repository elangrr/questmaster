# QuestMaster

QuestMaster is a bounty board for small tasks, paid in GNOT, running on Gno.land. A poster describes a task and locks the reward in the realm; a builder takes the task, does the work and sends a link to it; when the poster approves, the realm pays the builder. It is for anyone who wants a small piece of work done (a docs fix, a tool, a translation) and for builders who want to be paid for it without trusting the poster to pay later.

> **Status: Onyx testnet (`onyx-1`), test GNOT only.** Nothing here uses real money.
>
> - Live board: `TODO-DEPLOY: realm URL` (https://onyx.testnets.gno.land/r/NAMESPACE/questmaster)
> - Escrow package: `TODO-DEPLOY: package URL` (https://onyx.testnets.gno.land/p/NAMESPACE/escrow)
> - Example quest: `TODO-DEPLOY: quest page URL`
> - Example transactions on GnoScan: `TODO-DEPLOY: post tx`, `TODO-DEPLOY: approve tx`, `TODO-DEPLOY: cancel tx`
> - Demo video: `TODO-DEPLOY: video URL`

Contents: [Tour](#a-one-minute-tour) · [How to use it](#how-to-use-it) · [Rules](#the-rules) · [Costs](#what-it-costs) · [Safety](#safety) · [Use the escrow in your realm](#using-pescrow-in-your-own-realm) · [Run it locally](#run-it-locally) · [Layout and roadmap](#project-layout) · [Licence](#licence-and-credits)

## A one-minute tour

The whole front end is gnoweb, the web viewer every Gno.land network has. The realm's `Render` function returns the pages below as Markdown. These samples are trimmed from `r/questmaster/filetests/z_pages_filetest.gno`, a golden test that renders a small board with a quest in every state.

**Home page**: what the board is, the totals, the open quests and how it works.

```markdown
# QuestMaster
A bounty board for small tasks, paid in GNOT. ...
_Runs on the Onyx test network with test GNOT._
**Post a quest:** [1 GNOT](…$help&func=PostQuest&.send=1000000ugnot) · [5 GNOT](…) · [10 GNOT](…) · [How it works](#how-it-works) · …

## Board
| Open quests | GNOT locked | GNOT paid out | Quests paid |
|---|---|---|---|
| 1 | 9.2 | 2.5 | 1 |

## Open quests
| # | Quest | Reward | Work window | Rejected |
|---|---|---|---|---|
| 5 | [Fix typos in docs/plan.md](…:quest/5) | 1.2 GNOT | 20,000 (about 19 hours) | 0 |
```

**Quest page**: everything about one quest, and only the moves that are possible now, each with who may make it.

```markdown
# Quest 4: Add a dark theme to the demo page
| State | **Submitted (waiting for review)** |
| Reward | 5 GNOT |
| Poster | [g1jg8mtu…sqf5](…:poster/g1jg8m…) |
| Builder | [g1us8428…njlj](…:builder/g1us84…) |
| Review deadline | block 75,123 (about 3 days left) |
| Work | [https://github.com/example/questmaster/pull/9](https://github.com/example/questmaster/pull/9) |

## What can happen next
If the poster does not answer by block 75,123, the builder can claim the reward from block 75,124.
- **Approve**: the poster accepts the work and the builder is paid 5 GNOT. [Open in gnoweb](…$help&func=ApproveWork&id=4)
- **Reject**: the poster refuses the work with a reason, until block 75,123. The quest opens again. [Open in gnoweb](…)
```

**Paid page**: proof that the board pays.

```markdown
# Paid quests
Every quest below was paid by this realm to its builder: 1 quest, 2.5 GNOT in total.
| # | Quest | Reward | Builder | Times rejected |
| 1 | [Translate the README to Indonesian](…:quest/1) | 2.5 GNOT | [g1us8428…njlj](…) | 0 |
```

There are also pages per poster and per builder (`:poster/<address>`, `:builder/<address>`), a help page (`:help`) with a command for every action, and a friendly "Not found" page. Lists show 20 quests per page (`?page=2`).

## How to use it

First get test GNOT: open https://faucet.gno.land, choose the **Onyx Faucet**, paste your address and pick an amount (100, 200 or 300 test GNOT). A builder needs a little GNOT too, for transaction fees.

### With gnoweb and a browser wallet

1. Install a Gno.land wallet such as [Adena](https://www.adena.app) and switch it to the Onyx network.
2. Open the board (`TODO-DEPLOY: realm URL`).
3. **Post**: click one of the reward links (1, 5 or 10 GNOT). gnoweb opens a form for `PostQuest` with the reward filled in. It shows "This transaction link is requesting … from your balance"; turn on the switch to add the coins, fill in the title, details and work window in blocks, and sign with your wallet. For another amount, change `.send=` in the link, or use gnokey.
4. **Everything else**: open a quest page. Under "What can happen next" each possible move has an "Open in gnoweb" link that opens the form with the quest number filled in. Sign it with your wallet. These calls take no coins.

### With gnokey

Every command below targets Onyx. Replace `KEY` with your key name and `ID` with the quest number. The realm path is `gno.land/r/NAMESPACE/questmaster` (`TODO-DEPLOY: namespace`).

```sh
# Post a quest with a 5 GNOT reward and a 20,000-block work window (about 19 hours)
gnokey maketx call -pkgpath "gno.land/r/NAMESPACE/questmaster" -func "PostQuest" \
  -args "Fix a typo in the docs" -args "Details of the task" -args "20000" -send "5000000ugnot" \
  -gas-fee 100000ugnot -gas-wanted 10000000 -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 KEY

# The other calls send no coins; only -func and -args change:
#   -func "ClaimQuest"   -args "ID"                                  anyone but the poster
#   -func "SubmitWork"   -args "ID" -args "https://link-to-the-work" the builder
#   -func "ApproveWork"  -args "ID"                                  the poster (pays the builder)
#   -func "RejectWork"   -args "ID" -args "What is missing"          the poster
#   -func "CancelQuest"  -args "ID"                                  the poster, while open (refund)
#   -func "UnclaimQuest" -args "ID"                                  the builder
#   -func "ReleaseQuest" -args "ID"                                  anyone, after the work deadline
#   -func "ClaimPayout"  -args "ID"                                  the builder, after the review deadline
gnokey maketx call -pkgpath "gno.land/r/NAMESPACE/questmaster" -func "ClaimQuest" -args "ID" \
  -gas-fee 100000ugnot -gas-wanted 10000000 -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 KEY
```

Read the state without a transaction:

```sh
gnokey query vm/qeval -data 'gno.land/r/NAMESPACE/questmaster.GetQuest(1)' -remote https://rpc.onyx.testnets.gno.land:443
gnokey query vm/qeval -data 'gno.land/r/NAMESPACE/questmaster.GetTotals()' -remote https://rpc.onyx.testnets.gno.land:443
```

## The rules

A quest is in one of five states. Every move is checked against this table; anything else is refused.

| From | Move | Who | To | Money |
|---|---|---|---|---|
| (none) | `PostQuest(title, details, workBlocks)` | anyone, sending the reward | Open | reward locked in the realm |
| Open | `ClaimQuest` | anyone except the poster | Claimed | none |
| Open | `CancelQuest` | the poster | Cancelled | reward refunded to the poster |
| Claimed | `SubmitWork(link)` | the builder, until the work deadline | Submitted | none |
| Claimed | `UnclaimQuest` | the builder | Open | none |
| Claimed | `ReleaseQuest` | anyone, after the work deadline | Open | none |
| Submitted | `ApproveWork` | the poster | Paid | reward paid to the builder |
| Submitted | `RejectWork(reason)` | the poster, until the review deadline | Open | none (reject count +1, reason shown) |
| Submitted | `ClaimPayout` | the builder, after the review deadline | Paid | reward paid to the builder |

Paid and Cancelled are final: no move is possible from them.

Deadlines are block heights, not clock times. "Until" a deadline includes the deadline block; "after" starts at the next block. Times below assume about 3.5 seconds per block (measured 3.42 s on Onyx in November 2026).

- **Work window**: set by the poster, from 1,000 blocks (about 1 hour) to 2,200,000 blocks (about 89 days). It starts when the quest is claimed. If the builder has not submitted by the end, anyone can release the quest.
- **Review window**: 75,000 blocks (about 3 days) after the submission, the same for every quest. If the poster neither approves nor rejects by then, the builder can take the reward with `ClaimPayout`. A late approval still works.

Limits: reward at least 1 GNOT, in `ugnot` only, as one coin; title up to 80 characters on one line; details up to 1,000 characters; work link up to 300 characters and starting with `https://`; reject reason up to 300 characters.

## What it costs

On Onyx, with test GNOT:

- **The reward**: locked when you post, paid to the builder or refunded to you. Exactly the amount you sent.
- **Gas fees**: every transaction pays its fee whether or not it succeeds. The minimum gas price on Onyx is 1 ugnot per 1,000 gas (`auth/gasprice`). A QuestMaster call needs about 3 million gas or less; the commands above ask for 10 million and pay 0.1 GNOT, which leaves room if the gas price rises. The help page in this version shows higher values (50 million gas, 1 GNOT); they work but cost more.
- **Storage deposit**: the chain charges 100 ugnot per byte of new data a transaction stores (`params/vm:p:storage_price`), paid by whoever sends it. Measured on a local node: posting a quest about 0.65 GNOT, claiming about 0.29 GNOT, approving about 0.10 GNOT. The deposit is held by the chain at an address of its own, not by the realm, so it never mixes with escrowed rewards. When a later call makes the stored data smaller (for example cancelling a quest freed about 0.10 GNOT), the chain returns that share to the sender of that call. On Onyx `ugnot` is not a restricted coin, so the refund goes to that sender.

## Safety

The escrow holds other people's money, so the rules are strict and each one is tested.

| Guarantee | How | Tested by |
|---|---|---|
| No admin, owner, pause, upgrade or sweep function. Nobody, including the authors, can move locked GNOT except through the moves above. | The realm has no such function; package variables are unexported; read functions return copies, never pointers to stored state. | `TestNoPointerLeak`, code review |
| Exactly one payout per quest, of exactly the stored reward. | `p/escrow` returns a payout only from Approve, ClaimPayout or Cancel, and only after setting the final state; a final quest refuses every move. The realm updates its records first and sends coins last. | `TestNoDoublePayout`, `TestIllegalMovesPerState`, escrow and realm balance checks |
| Only direct calls from a wallet. | Every state-changing function requires `cur.Previous().IsUserCall()`; other realms and `maketx run` scripts are refused. This also makes the coin checks sound. | `TestCodeRealmRefused` |
| Coins are accepted only by `PostQuest`: exactly one coin, `ugnot`, at least 1 GNOT. Every other call refuses coins, so none get stuck. | Checks before any write. | `TestPostCoins`, `TestNoCoinsOnOtherCalls` |
| Only the right person can make each move. | `p/escrow` checks the caller on every move. | `TestStranger`, `TestPosterCannotClaim` |
| The realm always holds exactly the rewards of open, claimed and submitted quests. | Running totals; payments go out only as the escrow says. | `TestMixedRunInvariant` (300 random steps, checked after every step), `scripts/local-flow.sh` on a real local node |
| A failed call changes nothing. | All checks run before the first write; on chain the transaction reverts. | Every failing call in the tests is checked against a full snapshot of state; on a local node a refused call cost only its gas fee |
| User text cannot change the page. | Every title, detail, reason and link is escaped (`p/nt/markdown/sanitize/v0` plus two gnoweb-specific steps). | `TestRenderInjection`, the hostile-text stage of `scripts/local-flow.sh` (checked in gnoweb's HTML) |

### Known limits in v1

- A poster can reject good work and then cancel the reopened quest to get the reward back. The reject count and the last reason are public on every quest page, so builders can see such a poster.
- A builder can hold a quest for its whole work window without submitting. After the window anyone can release it.
- GNOT only; no other tokens.
- One builder per quest.
- Coins sent straight to the realm address with a bank transfer (not through `PostQuest`) are not tracked by any quest and cannot be recovered. So on chain the realm balance is at least the locked total, and equal to it unless someone does that.
- No dispute process: the poster decides, within the review window.
- Calls from other realms or DAOs are refused. Only wallets can use the board.
- New packages on Onyx are parked until the network's package approver enables them (see `docs/deploy.md`).

## Using `p/escrow` in your own realm

`p/escrow` is a pure package: it holds the quest type and every rule, but no coins and no storage. Your realm keeps the quests and moves the coins; the escrow tells it whether a move is allowed and whom to pay. This minimal realm is tested: it is the top of `p/escrow/z_example_filetest.gno`.

```go
package bounty

import (
	"chain"
	"chain/banker"
	"chain/runtime"
	"chain/runtime/unsafe"
	"strconv"

	"gno.land/p/nt/avl/v0"
	"gno.land/p/NAMESPACE/escrow"
)

var (
	quests avl.Tree // id -> *escrow.Quest
	lastID uint64
)

// Post locks the ugnot sent with the call as the reward.
func Post(cur realm, title string, workBlocks int64) uint64 {
	if !cur.Previous().IsUserCall() {
		panic("direct user calls only")
	}
	sent := unsafe.OriginSend()
	if len(sent) != 1 || sent[0].Denom != "ugnot" {
		panic("send the reward as one ugnot coin")
	}
	lastID++
	q, err := escrow.NewQuest(lastID, cur.Previous().Address(), title, "", sent[0].Amount, workBlocks, runtime.ChainHeight())
	if err != nil {
		panic(err.Error())
	}
	quests.Set(strconv.FormatUint(lastID, 10), q)
	return lastID
}

func Claim(cur realm, id uint64) {
	check(get(id).Claim(cur.Previous().Address(), runtime.ChainHeight()))
}

func Submit(cur realm, id uint64, link string) {
	check(get(id).Submit(cur.Previous().Address(), link, runtime.ChainHeight()))
}

// Approve applies the move first, then pays exactly what the escrow says.
func Approve(cur realm, id uint64) {
	p, err := get(id).Approve(cur.Previous().Address(), runtime.ChainHeight())
	check(err)
	pay(p, cur)
}

func pay(p escrow.Payout, rlm realm) {
	b := banker.NewBanker(banker.BankerTypeRealmSend, rlm)
	b.SendCoins(rlm.Address(), p.To, chain.Coins{{Denom: "ugnot", Amount: p.Amount}})
}

func get(id uint64) *escrow.Quest {
	v := quests.Get(strconv.FormatUint(id, 10))
	if v == nil {
		panic("unknown quest")
	}
	return v.(*escrow.Quest)
}

func check(err error) {
	if err != nil {
		panic(err.Error())
	}
}
```

Moves that release money (`Approve`, `ClaimPayout`, `Cancel`) return an `escrow.Payout{Kind, To, Amount}`; the others return only an error. A real realm should also refuse coins on calls that do not take them, as `r/questmaster` does. The full API is documented in `p/escrow/escrow.gno`.

## Run it locally

Toolchain: gno **v1.8.0** (commit `fc79041f4cd1`), the version Onyx runs. Build `gno` and `gnodev` from https://github.com/gnolang/gno at that tag (`make install.gno install.gnodev`; it needs Go 1.25.9).

```sh
gno test ./...                 # 57 tests: escrow, realm, pages, golden pages, events, the README example
gno lint ./... && gno fmt -diff ./...
gnodev local .                 # local chain and gnoweb at http://127.0.0.1:8888/r/questmaster_dev/questmaster
scripts/local-flow.sh          # full flow on a real local node, no keys needed (see below)
```

`scripts/local-flow.sh` boots gnodev several times with a growing list of genesis transactions (which need no signature) and checks real balances after each stage: the builder gets exactly the reward on approval, the poster gets the refund on cancel, refused calls cost only their gas fee, the realm balance equals the locked total, and hostile text renders as plain text in gnoweb's HTML. It only works against the local `dev` chain and uses a throwaway `GNOHOME`.

Set `GNOHOME` to a folder of its own when you run the tools: by default it is `~/.config/gno`, which is also where gnokey keeps keys.

## Project layout

```
p/escrow/                 pure package: Quest type, states, rules, payouts (no coins)
  escrow.gno, escrow_test.gno, z_example_filetest.gno (the README example)
r/questmaster/            realm: storage, coins, public functions, events, pages
  questmaster.gno         state-changing and read functions
  render.gno, escape.gno  gnoweb pages and escaping
  *_test.gno, filetests/  tests, golden pages, events
scripts/local-flow.sh     full flow on a local node
scripts/set-namespace.sh  replace the placeholder namespace before deploying
docs/                     plan, deployment steps, demo script, Gno notes
```

Events on every change, for indexers: `QuestPosted`, `QuestClaimed`, `QuestUnclaimed`, `QuestReleased`, `WorkSubmitted`, `WorkRejected`, `QuestPaid` (with `how` = approved or timeout), `QuestCancelled`.

## Roadmap

- A "Built on gno.land" footer on the pages, and lower default gas values on the help page.
- Smaller storage per quest, to lower the posting deposit.
- A simple dispute step (for example a neutral reviewer chosen at post time) instead of the poster alone deciding.
- Optional rewards in GRC20 tokens.
- Calls from other realms and DAOs, so a DAO can post and pay quests.

## Licence and credits

QuestMaster is free software under the **GNO Network General Public License, version 6** (or any later version). Copyright (C) 2026 Fluxen. The licence text in `LICENSE` is copied verbatim from `LICENSE.md` in github.com/gnolang/gno at tag v1.8.0.

It uses three packages from github.com/gnolang/gno, which are under the same licence:

- `gno.land/p/nt/avl/v0`: the sorted tree that stores quests.
- `gno.land/p/moul/txlink/v0`: builds the gnoweb transaction links.
- `gno.land/p/nt/markdown/sanitize/v0`: escapes user text for Markdown.

Built on [gno.land](https://gno.land).

QuestMaster is an independent project made for the Gnome Tavern hackathon. It is not an official Gno.land product.
