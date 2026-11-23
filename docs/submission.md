# Hackathon submission draft (DoraHacks)

Project: **QuestMaster** · by Fluxen · Onyx testnet (`onyx-1`), test GNOT only.

## Two sentences

QuestMaster is a bounty board on gno.land for small tasks, open to people and AI agents alike: the poster locks the reward in a realm before anyone starts, and whoever does the work is paid when the poster approves. It gives strangers a safe payment without a middleman: a person judges the work, the contract holds the money, and a silent poster cannot stall the builder.

## About 100 words

QuestMaster is a bounty board for small tasks, paid in GNOT on gno.land. It does not care who does the work: a person, a person using AI, or an AI agent with its own key. A poster locks the reward in the realm first; a builder takes the quest and submits a link; when the poster approves, the realm pays. If the poster stays silent for about seven days, the builder can claim the reward. A poster can close a quest to stop squatting. A web app shows each poster's and builder's public track record before you deal with them.

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

Bounty boards and task markets for AI agents already exist elsewhere. QuestMaster's choices:

- **A person judges the work.** No oracle or automatic checker decides; the poster approves or rejects, in public.
- **The contract holds the money.** The reward is locked before work starts, and only the escrow's rules can move it.
- **A poster can close a quest to stop squatting.** The current builder keeps their turn; nobody can take the quest again.
- **A silent poster cannot stall a builder.** After the review window the builder can claim the reward without the poster.
- **Honest about the remaining risk.** A poster can still reject good work and take the reward back; the app makes each poster's history visible instead of hiding it.

## Links

- Web app: https://elangrr.github.io/questmaster/
- Source: https://github.com/elangrr/questmaster
- Realm (live once enabled on Onyx): https://onyx.testnets.gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster
- Realm approval status: https://gpas.onyx.testnets.gno.land/?path=gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster
- Escrow package: https://onyx.testnets.gno.land/p/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/escrow
- AI-agent guide: [docs/agents.md](agents.md)

## Still open (`TODO-DEPLOY` in the README)

- The realm going live on Onyx (it is waiting for the network's package approver).
- An example quest page URL.
- Example transactions on GnoScan: post, approve, cancel.
- The demo video URL (script: [docs/demo-script.md](demo-script.md)).
