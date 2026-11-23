# Questboard: build plan for the Gnome Tavern hackathon

Deadline: 18 Dec 2026, 01:00 UTC (08:00 WIB). Target finish: 15 Dec.
Related files in this folder: gnome-tavern-brief.md (hackathon rules), idea-questboard.md (the idea).

## 1. Goal

Questboard is a bounty board on Gno.land. Someone posts a small task and locks GNOT as the reward. A builder takes the task and sends a link to the work. The poster approves, and the realm pays the builder. The board shows as a page in gnoweb (the Gno.land web viewer).

Done means all of these are true:

1. The realm and the escrow package are deployed on the Onyx test network.
2. A full quest (post, take, submit, approve, payout) works on Onyx with two real wallets.
3. All tests pass with `gno test`.
4. The repo is public, with a README and a 2 to 3 minute demo video.
5. The entry is submitted on DoraHacks before the deadline.

## 2. Facts checked on 2026-11-23

- Test network: Onyx (`onyx-1`), RPC `https://rpc.onyx.testnets.gno.land:443`. `https://rpc.latest.testnets.gno.land:443` always points at the current test network. Onyx runs the same code as mainnet, has a faucet and open transfers. Source: https://docs.gno.land/resources/gnoland-networks
- Mainnet: `gnoland-1`, live since 12 Sep 2026. It has no faucet. The docs say "transfers start locked per Constitution §126". Make sure that GNOT transfers are open on mainnet before you plan a mainnet move (section 13).
- Coins: the native coin is `ugnot` (1 GNOT = 1,000,000 ugnot). A realm reads the coins sent with a call through `unsafe.OriginSend()` and pays out with a banker from `chain/banker`: `banker.NewBanker(banker.BankerTypeRealmSend, cur)`. Source: https://docs.gno.land/resources/gno-stdlibs
- Functions that change state take `cur realm` as the first parameter (the "crossing function" form). The caller comes from `unsafe.PreviousRealm()`. Source: https://docs.gno.land/resources/gno-interrealm-v2
- A sorted map for storage: `gno.land/p/nt/avl/v0`.

Gno changes often. Before you write code, make sure that each import path and function name above still matches the docs. Give Claude Code the gnomcp server (https://mcp.gno.dev) or the docs links so it does not guess.

## 3. Scope

In version 1:

- Post a quest with a GNOT reward locked in the realm
- Take (claim) an open quest
- Submit work as a link
- Approve (pay the builder) or reject (quest goes back to open)
- Cancel an open quest (refund to the poster)
- Auto-payout if the poster stays silent too long after a submission
- Board pages in gnoweb
- An escrow package in `/p/` that other realms can import

Not in version 1:

- Disputes, voting or judges
- Tokens other than GNOT (GRC20)
- Several builders on one quest
- A separate website (gnoweb is the front end)
- Fees for the platform

## 4. How a quest moves

States: `Open`, `Claimed`, `Submitted`, `Paid`, `Cancelled`.

| From | Action | Who | To | Money |
|---|---|---|---|---|
| (none) | Post | anyone, with GNOT attached | Open | GNOT moves into the realm |
| Open | Claim | anyone except the poster | Claimed | none |
| Open | Cancel | poster | Cancelled | refund to poster |
| Claimed | Submit (link) | the builder | Submitted | none |
| Claimed | Unclaim | the builder | Open | none |
| Claimed | Release | anyone, after the work deadline passes | Open | none |
| Submitted | Approve | poster | Paid | reward to builder |
| Submitted | Reject (reason) | poster | Open | none |
| Submitted | ClaimPayout | the builder, after the review deadline passes | Paid | reward to builder |

Deadlines use the block height (`runtime.ChainHeight()`), not wall-clock time.

- Work window: the number of blocks a builder has after Claim. The poster sets it at Post time, with a minimum and maximum.
- Review window: the number of blocks the poster has after Submit. Use one fixed value for every quest, for example about 3 days of blocks. If the poster does not answer in time, the builder can call ClaimPayout. This protects builders from posters who never reply.

Note on Reject: a poster could reject good work many times. In version 1, keep a public reject count on each quest and show it on the page. Disputes come later.

## 5. Code layout

```
questboard/
  p/escrow/            pure package: quest type, states, rules (no coins)
    escrow.gno
    escrow_test.gno
    gnomod.toml
  r/questboard/        realm: storage, coins, public functions, Render
    questboard.gno
    render.gno
    questboard_test.gno
    gnomod.toml
  README.md
  docs/demo-script.md
```

Deploy paths: `gno.land/p/<your-namespace>/escrow` and `gno.land/r/<your-namespace>/questboard`. Make sure that you know the namespace rule on Onyx first. Some paths need a registered username. Read the "Deploying" page in the docs.

Why two packages: the `/p/` package holds the rules and does not change once deployed. Other realms can import it and trust that its logic cannot change. This counts for the "adoption" check of the retention prize. The realm holds the coins, because a pure package cannot hold coins.

## 6. Data

Quest fields:

- `ID` (uint64, counts up from 1)
- `Poster` (address)
- `Title` (max 80 characters)
- `Details` (max 1,000 characters)
- `Reward` (int64, in ugnot)
- `State`
- `Builder` (address, empty when open)
- `WorkLink` (max 300 characters)
- `WorkBlocks` (work window set by the poster)
- `ClaimedAt`, `SubmittedAt` (block heights)
- `RejectCount`, `LastRejectReason`
- `CreatedAt` (block height)

Storage in the realm:

- `quests`: avl tree, key = zero-padded ID, value = quest
- `byPoster` and `byBuilder`: avl trees of IDs, for the "my quests" pages
- `nextID`

## 7. Public functions (realm)

All functions that change state are crossing functions (`cur realm` first).

- `PostQuest(cur realm, title, details string, workBlocks int64) uint64`: reads the sent coins, accepts only `ugnot`, requires a minimum reward (for example 1 GNOT), returns the new ID.
- `ClaimQuest(cur realm, id uint64)`
- `UnclaimQuest(cur realm, id uint64)`
- `ReleaseQuest(cur realm, id uint64)`
- `SubmitWork(cur realm, id uint64, link string)`
- `ApproveWork(cur realm, id uint64)`
- `RejectWork(cur realm, id uint64, reason string)`
- `CancelQuest(cur realm, id uint64)`
- `ClaimPayout(cur realm, id uint64)`
- `Render(path string) string`: the gnoweb pages (section 9).

Emit an event with `chain.Emit` on every state change (QuestPosted, QuestClaimed, WorkSubmitted, QuestPaid, QuestCancelled, WorkRejected). Indexers and the demo can use them.

## 8. Safety rules (escrow holds real money later)

1. Accept only `ugnot`. Reject any call that sends another coin or several coins.
2. Reject a post with no coins or below the minimum reward.
3. Functions that do not take money must reject calls that send coins. Otherwise those coins stay stuck in the realm.
4. Change the state first, then send the coins. Never send first.
5. Pay exactly the stored `Reward`, never the realm balance.
6. Only the poster can approve, reject or cancel. Only the builder can submit, unclaim or claim payout.
7. The poster cannot claim their own quest.
8. Check every state change against the table in section 4. Panic on any other move.
9. Limit the text lengths (section 6) so nobody fills storage.
10. Validate that the work link starts with `https://`.
11. Use no admin function that can move escrowed coins. Nobody, including you, can take the GNOT.
12. Make sure that the total of all open escrows always equals the GNOT that the realm holds. Test this.

## 9. gnoweb pages (Render)

- `/r/<ns>/questboard` (home): short intro, totals (open quests, GNOT locked, GNOT paid), list of open quests with reward and title.
- `:quest/<id>`: full quest, state, poster, builder, deadlines in blocks, work link, reject count. Show the ready-to-use call links for each action that gnoweb offers.
- `:poster/<address>` and `:builder/<address>`: one user's quests.
- `:paid`: finished quests, as proof that the board pays.

Keep the Markdown simple: headings, tables and links. gnoweb renders the Markdown that Render returns.

## 10. Tests

Write them in `*_test.gno` and run them with `gno test ./...`. Use the `testing` helpers (`SetRealm`, `NewUserRealm`, `SetOriginSend`, `IssueCoins`, `SkipHeights`). Make sure that the helper names still match the docs.

Must pass:

1. Full happy path: post, claim, submit, approve, and the builder balance goes up by the reward.
2. Cancel an open quest: the poster gets the refund.
3. Reject: the quest goes back to Open, the builder is cleared and the reject count goes up.
4. ClaimPayout before the review deadline fails. After `SkipHeights` past the deadline, it pays.
5. ReleaseQuest before the work deadline fails, and after it works.
6. A stranger cannot approve, cancel, submit or claim payout.
7. The poster cannot claim their own quest.
8. A post with a wrong coin, several coins, no coins or too small a reward fails.
9. A payout cannot happen twice (approve twice, approve then claim payout).
10. Cancel after Claimed fails.
11. Text over the limits fails. A link without `https://` fails.
12. The realm balance equals the sum of open escrows after a mixed run of many actions.
13. Render returns the expected pages without errors for empty and full boards.

## 11. Setup and deployment

Steps on your own PC:

1. Install Go and clone `https://github.com/gnolang/gno`. Build `gno`, `gnokey` and `gnodev` with the Getting Started guide: https://docs.gno.land/builders/getting-started
2. Create a new key with `gnokey add`. Use this key only for the hackathon.
3. Install the Adena wallet and import or create a second test wallet. You need two wallets to show a poster and a builder.
4. Get test GNOT for both wallets from https://faucet.gno.land (choose Onyx).
5. Run `gnodev` in the project folder. It starts a local chain and gnoweb, and reloads on every save.
6. When the tests pass and gnodev looks right, deploy with `gnokey maketx addpkg` to Onyx: first the `/p/` package, then the realm. Use the chain ID `onyx-1` and the Onyx RPC. Copy the exact command from the docs page on deploying.
7. Open the realm on the Onyx gnoweb and run one full quest with the two wallets.
8. Save the realm link and the GnoScan links of the transactions for the README and the DoraHacks form.

## 12. Timeline

| Dates | Work |
|---|---|
| 23 to 26 Nov | Set up tools, read docs, write and test `p/escrow` |
| 27 Nov to 3 Dec | Realm functions and tests (sections 7, 8, 10) |
| 4 to 7 Dec | Render pages, events, polish |
| 8 to 10 Dec | Deploy to Onyx, full run with two wallets, fix bugs |
| 11 to 13 Dec | README, demo video, post 3 to 5 real example quests |
| 14 to 15 Dec | Final check and submit on DoraHacks |
| 16 to 17 Dec | Buffer |

## 13. After the hackathon (retention prize)

The retention prize needs mainnet, 50 real users by month 3, 100 by month 6, at least one project that uses it, and an outside community.

- Make sure that GNOT transfers are open on mainnet. If they are locked, the board cannot pay out there yet.
- Before mainnet, get a security review of the escrow code. Real money will sit in it.
- Post real small tasks for the Gno community, for example docs fixes or small tools. Ask in the Gno.land Discord.
- Offer the `/p/escrow` package to other builders. One import counts for adoption.
- Ship at least one update each month (a judging point).

## 14. README outline

1. What Questboard does, in three sentences
2. Live links: realm on Onyx, example quest, GnoScan transactions
3. How to use it: post, take, submit, approve (with the gnokey commands and the gnoweb way)
4. The rules: states table and deadlines
5. Safety: what the escrow guarantees (section 8)
6. Run it locally with gnodev, and run the tests
7. Using `p/escrow` in your own realm
8. License (MIT or Apache 2.0)

## 15. Demo video (2 to 3 minutes)

1. 0:00 What it is and why (one sentence each)
2. 0:20 Wallet A posts a quest with 5 GNOT. Show the board page.
3. 0:50 Wallet B claims it and submits a link.
4. 1:20 Wallet A approves. Show that wallet B got the GNOT.
5. 1:50 Show cancel with refund, and the auto-payout rule.
6. 2:20 Show the tests passing and the `/p/escrow` package.
7. 2:40 Links and close.

## 16. Starter prompt for Claude Code in Orca

```
Build Questboard, a GNOT bounty board on Gno.land, from questboard-plan.md in this folder.
Start with section 5 (layout) and p/escrow with its tests. Follow sections 4, 7, 8 and 10 exactly.
Gno is not Go: before using any import or function, look it up in the Gno docs or with gnomcp. Do not guess APIs.
Run gno test after every change and show me the real output. Stop and ask before deploying anything.
```

## 17. Submission checklist

- [ ] `/p/escrow` and `/r/questboard` deployed on Onyx
- [ ] One full quest done with two wallets, links saved
- [ ] All tests pass
- [ ] Repo public, README done
- [ ] Demo video uploaded
- [ ] Short description written
- [ ] Name does not start with "Gno"
- [ ] Submitted on DoraHacks before 18 Dec 2026, 01:00 UTC (08:00 WIB)
