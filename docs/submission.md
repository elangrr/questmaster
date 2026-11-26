# Hackathon submission draft (DoraHacks)

Project: **QuestMaster** · by Fluxen · Onyx testnet (`onyx-1`), test GNOT only.

## Two sentences

QuestMaster is a bounty board on gno.land where every step is one Adena signature in the browser: the poster locks a reward in native GNOT sent with the call, with no token to wrap and nothing to approve first, a builder takes the quest and submits a link, and the poster approves to pay. The rules are a small escrow package with no admin function, and they protect both sides: a silent poster cannot stall the builder, and once work is waiting for review the poster cannot get the reward back without rejecting it in public.

## About 100 words

QuestMaster is a bounty board for small tasks on gno.land, open to people and AI agents. Post, take, submit, approve, reject and cancel each take one Adena signature in the web app, and the page updates by itself. The reward is native GNOT sent with the post: no wrapping, no allowance. One builder works at a time. If the poster says nothing for about seven days after a submission, the builder collects the reward. While work waits for review, the poster cannot take the reward back except by a public rejection with a reason. The escrow rules are a small reusable package with no admin.

## Features

- Escrow rules in a reusable package (`p/escrow`), the board in a realm (`r/questmaster`); no admin, owner, pause or sweep function.
- Exactly one payout per quest, of exactly the locked reward; the realm tracks exactly the rewards of unfinished quests (coins sent straight to its address outside a quest are not tracked).
- Two deadlines: a work window chosen by the poster, and a fixed review window after which the builder can claim the reward.
- Closing: a poster can stop a squatter without taking the reward from an honest builder mid-turn.
- Public reject count and last reason on every quest, and a track record per address in the web app (posted, paid, rejections, refunds after a rejection, quests taken and paid).
- gnoweb pages with every action linked, and `gnokey` commands for each.
- Web app (static, Adena wallet): board, quest pages with progress and deadline bars, posting with a live cost summary, an approximate dollar value next to GNOT amounts, light and dark themes, reduced-motion support.
- AI agents: read the board through gnomcp (render and eval); a guide covers what a write would need.
- Tests: unit and filetests for the package and realm, a full local-chain flow script, and browser end-to-end tests against a seeded local chain.

## What is different

Each point can be checked in a minute, in the web app or in the code.

- **The whole flow runs in the browser, with native GNOT.** On the Post page, one Adena signature sends the
  reward with the `PostQuest` call; there is no token to wrap and no allowance to approve first. Taking,
  submitting, approving, rejecting, closing and cancelling are each one button and one signature, and the
  quest page shows the new state without a reload. The same realm also works from gnoweb forms and from
  `gnokey`, so our site is a convenience, not a requirement. Check: the web app, and `requireReward` in
  `r/questmaster/questmaster.gno`.
- **A silent poster cannot stall a builder.** Once work is submitted, the poster has a review window of
  172,800 blocks (about 7 days). After it, the builder can claim the reward without the poster. Check:
  `ClaimPayout` in `p/escrow/escrow.gno`.
- **A poster cannot pull the reward while work is waiting for review.** On a taken or submitted quest,
  "Close quest" moves no coins: the builder keeps their turn. While work waits for review, the poster's only
  ways to end it are to approve (the builder is paid) or to reject with a written reason before the review
  deadline; the reason and the reject count are public. A poster gets the reward back at once only from a
  quest nobody has taken. Check: `Cancel` and `Reject` in `p/escrow/escrow.gno`.
- **A poster can close a quest against re-taking.** If someone takes a quest and sits on it, closing it
  means nobody can take it again. The reward returns to the poster when that builder's turn ends without
  approval: they give the quest back, their work is rejected, or they miss the work deadline and anyone
  releases the quest.
- **The escrow rules are a small package that other realms can import.** `p/escrow` is one file, about 375
  lines without comments, that imports only `errors`, `strings` and `unicode`. It holds no coins and has no
  admin: each move returns who must be paid, and the realm that imports it moves the coins. Our realm has no
  admin, owner, pause, upgrade or sweep function either. Check: the package on gnoweb, and
  `p/escrow/z_example_filetest.gno`, a second realm built on it.
- **Small and easy to audit, on purpose.** One poster, one builder at a time, exactly one payout of exactly
  the locked reward. There is no arbiter: a person judges the work, and a third party with power over the
  money would be more code and more trust to check. Instead the web app shows each poster's history: quests
  posted and paid, rejections, and refunds after a rejection.
- **Honest about the remaining risk.** A poster can still reject good work, then cancel the reopened quest
  and get the reward back. Both steps are public, and the poster's history in the web app shows them.

## Links

- Web app: https://elangrr.github.io/questmaster/
- Source: https://github.com/elangrr/questmaster
- Realm (live on Onyx since 2026-11-24, with real quests posted through the web app): https://onyx.testnets.gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster
- Realm approval status: https://gpas.onyx.testnets.gno.land/?path=gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster
- Escrow package: https://onyx.testnets.gno.land/p/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/escrow
- AI-agent guide: [docs/agents.md](agents.md)

## Still open (`TODO-DEPLOY` in the README)

- An example quest page URL.
- Example transactions on GnoScan: post, approve, cancel.
- The demo video URL (script: [docs/demo-script.md](demo-script.md)).
