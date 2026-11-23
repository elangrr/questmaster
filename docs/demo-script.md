# Demo video script (2 to 3 minutes)

A screen recording of the real deployment on the Onyx test network, with two wallets: **Poster** and **Builder**.
Words to say are in quotes. Keep sentences short and calm; it is fine to pause while a transaction confirms and cut
the wait out afterwards.

## Preparation checklist

- [ ] Realm and escrow live on Onyx (`docs/deploy.md`); note the realm URL.
- [ ] Two test-only wallets in Adena, named **Poster** and **Builder** (not your real name). Switched to Onyx.
- [ ] Both funded from the Onyx Faucet: Poster at least 30 test GNOT, Builder at least 5.
- [ ] One quest already **paid** before recording (post, take, submit, approve), so the Paid page is not empty.
- [ ] One quest already **open** with a clear title, for example "Translate the README to Indonesian".
- [ ] A real-looking work link ready to paste, for example a public pull request URL.
- [ ] A terminal with the repo, already at the root, font large, `GNOHOME` set to a throwaway folder; run
      `gno test ./...` once before so the second run is quick.
- [ ] Browser: one window, zoom 125%, no other tabs, bookmarks bar hidden, no personal accounts or real names
      visible, notifications off.
- [ ] Note the Builder's balance before recording (Adena shows it).
- [ ] Do a full dry run once; keep its transactions, they also fill the board.

## Shots

| Time | On screen | Do | Say |
|---|---|---|---|
| 0:00 | Board home page | Scroll slowly from the title to the totals line and the quests. | "This is QuestMaster, a bounty board on Gno.land. You post a small task and lock the reward in GNOT. A builder does the work, and the realm pays them when you approve. It runs on the Onyx testnet with test GNOT." |
| 0:20 | Home page, "Post a quest" links | Switch Adena to **Poster**. Click "5 GNOT". | "Let's post a quest with a 5 GNOT reward." |
| 0:25 | gnoweb form for PostQuest | Type the title and details, work window `20000`. Turn on the switch that adds the 5 GNOT. Sign in Adena. | "The form already holds the reward. I confirm sending it, fill in the task, and sign. The 5 GNOT is now locked in the realm, not with me and not with anyone else." |
| 0:45 | Home page | Reload; point at the new row and "GNOT locked" in the totals line. | "The quest is open, and the board shows the locked reward." |
| 0:50 | Quest page | Open the quest. Point at "What can happen next". | "Every quest page shows only the moves that are possible now, and who may make them." |
| 0:55 | Quest page | Switch Adena to **Builder**. On "Take this quest", click **Do this**, then **Take this quest**, and sign in Adena. | "Now I'm the builder. I take the quest. The work window starts now." |
| 1:05 | Quest page | Reload. Click "Open in gnoweb" next to Submit work, paste the link, sign. | "I've done the work, so I submit a link to it." |
| 1:15 | Quest page | Reload. Point at State "Submitted" and the review deadline. | "The poster now has about 7 days to approve or reject. If they never answer, the builder can claim the reward after that, so the board warns posters to check their quests." |
| 1:20 | Quest page | Switch Adena to **Poster**. Click Approve, sign. | "Back as the poster. The work is good, so I approve." |
| 1:30 | Adena, Builder account | Show the Builder's balance. | "The builder received exactly 5 GNOT, paid by the realm." |
| 1:40 | Paid page | Open "Paid quests". | "The Paid page lists every quest the board has paid, as public proof." |
| 1:50 | Home page, then a second open quest | As **Poster**, open the other open quest, click Cancel, sign. | "A poster can also cancel an open quest. The reward comes straight back." |
| 2:00 | Help page, "Cancel or close a quest" | Scroll to the rules. | "Two deadlines keep things fair: if a builder stalls, anyone can release the quest; if a poster stays silent, the builder gets paid. And if someone grabs a quest and sits on it, the poster can close it: the reward comes back when that builder's turn ends." |
| 2:15 | Terminal | Run `gno test ./...` and let it finish. | "The escrow rules are a separate package that other realms can import. There is no admin function: nobody can move the locked GNOT except through these rules. All of it is tested." |
| 2:35 | Browser, `p/escrow` source on gnoweb | Show the package page. | "The package is on chain for anyone to use." |
| 2:40 | Home page | End on the board. | "That's QuestMaster. The links are in the README. Thanks for watching." |

## If a transaction is slow

- Wait up to 30 seconds with the page still; cut the wait in editing.
- If it fails (for example a fee error), say nothing, retry once, and cut the failed attempt.
- If Onyx is not producing blocks, stop and record later; use the dry-run transactions on GnoScan for the README
  links in the meantime.
- If the gnoweb form misbehaves, use the gnokey command from the quest page in the terminal instead and say:
  "The same works from the command line."

## After recording

- Trim to between 2:00 and 3:00. Check that no real name, email or other tab is visible.
- Upload, then put the video link and the transaction links in `README.md` (`grep -n TODO-DEPLOY README.md`).

## Short clip: QuestMaster with an AI agent (30 to 45 seconds)

A separate, short clip for social posts. It only reads the chain: no key, no
transaction. Record it once the realm is live on Onyx (check the
[package status page](https://gpas.onyx.testnets.gno.land/?path=gno.land/r/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/questmaster));
until then the agent gets a "parked" answer instead of the board.

Setup: a terminal with Claude Code (or another MCP client) and gnomcp registered
as in [docs/agents.md](agents.md); the web app open in a browser next to it.
Use a clean terminal profile: no real name, email, home folder path or other
tabs on screen.

| Time | Screen | Action | Voice-over or caption |
|---|---|---|---|
| 0:00 | Web app, `#/agents` | Click **Copy** on the first prompt. | "QuestMaster is a bounty board on gno.land. Agents can read it too." |
| 0:05 | Terminal | Paste the prompt and send it. | "This agent uses gnomcp, the gno.land MCP server." |
| 0:10 | Terminal | The agent calls `gno_render` on the realm; the board's Markdown scrolls by. | "It reads the realm straight from the chain. No key, no cost." |
| 0:20 | Terminal | The agent answers with the open quests sorted by reward. | "Open quests, highest reward first." |
| 0:27 | Terminal | Type: "Eval GetQuest on the top one and tell me how long the builder has." The agent calls `gno_eval`. | "Exact values come from eval." |
| 0:35 | Web app | Open the same quest; show the stepper and the deadline bar. | "Same quest, same numbers, in the web app." |
| 0:40 | Web app | Hold on the quest page. | "QuestMaster: small tasks, paid in GNOT. Testnet only." |

Do not show or run any write in this clip (`gno_call`, keys, faucet,
sessions). If the agent offers to post or take a quest, decline on screen or cut it.
