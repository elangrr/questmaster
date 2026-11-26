# Demo video script (2 to 3 minutes)

A screen recording of the real deployment on the Onyx test network, with two Adena accounts: **Poster** and
**Builder**. The whole flow runs in the web app, https://elangrr.github.io/questmaster/. gnoweb appears once, briefly,
to show that the same realm works without our site. Words to say are in quotes. Keep sentences short and calm; it is
fine to pause while a transaction confirms and cut the wait out afterwards.

The points to get across, in plain words:

- every step is one signature in the browser, and the reward is plain GNOT sent with the post: nothing to wrap or
  approve first;
- a silent poster cannot stall the builder, and the poster cannot take the reward back while work waits for review;
- the escrow rules are a small package with no admin, and other realms can use it;
- there is no arbiter on purpose: a person judges, and the app shows each poster's history.

## Preparation checklist

- [ ] Two test-only accounts in one Adena, named **Poster** and **Builder** (not your real name). Network: Onyx.
- [ ] Both funded from the Onyx Faucet: Poster at least 30 test GNOT, Builder at least 5.
- [ ] On the board before recording, all posted from the web app with real-looking titles:
  - [ ] one quest **paid** (post, take, submit, approve), so the Paid page and the poster's history are not empty;
  - [ ] one quest **cancelled**;
  - [ ] two quests **open**, for example "Translate the README to Indonesian" and "Test the Post page on a phone".
        The second one is cancelled on camera.
- [ ] A real-looking work link ready to paste, for example a public pull request URL.
- [ ] Title and details for the quest posted on camera, ready to paste, for example "Review my node setup guide by
      following it" with two lines of details.
- [ ] Browser: one window, zoom 125%, no other tabs, bookmarks bar hidden, no personal accounts or real names
      visible, notifications off. Connect Adena once on the web app before recording; it stays connected across
      reloads.
- [ ] Switching accounts: in Adena, switch to the other account; the address in the web app's header should follow
      within a moment. Check this in the dry run. If the header keeps the old address, click the disconnect icon
      next to the address, then **Connect wallet**, and cut that out in editing.
- [ ] Note the Builder's balance before recording (Adena shows it).
- [ ] Do a full dry run once; keep its transactions, they also fill the board.

## Shots

| Time | On screen | Do | Say |
|---|---|---|---|
| 0:00 | Web app, board | Scroll slowly from the hero to the totals bar and the open quests. | "This is QuestMaster, a bounty board on gno.land. You post a small task and lock the reward in GNOT. A builder does the work, and you pay when you approve. It runs on the Onyx testnet with test GNOT." |
| 0:15 | **Post** page | As **Poster**. Paste the title and details, reward 5, work window 1 day. Point at the "What leaves your wallet" card. | "Posting happens right here. The card shows exactly what leaves my wallet: the reward, a small storage deposit and the network fee." |
| 0:30 | Post page, then Adena | Click **Post and lock the reward**. Adena shows a call to `PostQuest` with 5 GNOT sent. Sign. | "One signature. The reward is plain GNOT sent with the call. There is no token to wrap and nothing to approve first." |
| 0:40 | Post page | "Updating status…", then "Sent: your quest". Click **Open quest N**. | "The 5 GNOT is now locked in the realm. Not with me, and not with anyone else." |
| 0:45 | Quest page | Point at "What can happen next", then at the poster's record line under Poster. | "Each quest shows only the moves that are possible now, and who may make them. It also shows the poster's history, so a builder can see how this poster treats work before starting." |
| 0:55 | Quest page | Switch Adena to **Builder**; the header address changes. Click **Take this quest** and sign. "Updating status…", then "In progress", with no reload. | "Now I'm the builder. I take the quest, and the work window starts. Only one builder works on a quest at a time." |
| 1:05 | Quest page | Paste the link in the field beside **Submit work**, click it, sign. The state becomes "Waiting for review". | "I've done the work, so I submit a link to it." |
| 1:12 | Quest page | Point at the review deadline. | "Now the poster has about seven days. If they say nothing, I can claim the reward myself. And from here the poster cannot take the money back quietly: the only way is to reject the work in public, with a reason everyone can read." |
| 1:30 | Quest page | Switch Adena to **Poster**. Click **Approve and pay**, sign. The state becomes "Paid" by itself. | "Back as the poster. The work is good, so I approve." |
| 1:40 | Adena, Builder account | Show the Builder's balance. | "The builder received exactly 5 GNOT, paid by the realm." |
| 1:45 | **Paid** page | Open "Paid". | "Every paid quest is listed here, as public proof." |
| 1:50 | Board, then the second open quest | As **Poster**, open "Test the Post page on a phone". Click **Cancel quest**, sign. The state becomes "Cancelled". | "Nobody has taken this one, so I can cancel it and the reward comes straight back. Once someone takes a quest, I can only close it: they keep their turn, and nobody can take it again after them." |
| 2:05 | Poster's address page | Click the poster's address. Show the "As poster" card. | "There is no arbiter. A person judges the work, and this page shows every poster's record: paid, rejected, refunded after a rejection." |
| 2:15 | gnoweb, the same quest | Open the realm on gnoweb and the quest just paid. | "Our site is optional. The same realm works from gnoweb and from the command line." |
| 2:25 | gnoweb, `p/escrow` | Show the package page and scroll its source briefly. | "The escrow rules are a small package that other realms can import. It has no admin, and the realm has none either: nobody can move locked GNOT except through these rules. All of it is tested." |
| 2:40 | Web app, board | End on the board. | "That's QuestMaster. The links are in the README. Thanks for watching." |

The terminal `gno test` shot from the earlier script is left out: a test run on screen proves little in a few
seconds, and the time is better spent on the package itself. The README and the repository show the tests.

## If a transaction is slow

- Wait up to 30 seconds with the page still; cut the wait in editing.
- If the row stays on "Updating status…" for long, reload once: the wallet stays connected and the quest shows its
  new state.
- If it fails (for example a fee error), say nothing, retry once, and cut the failed attempt.
- If Onyx is not producing blocks, stop and record later; use the dry-run transactions on GnoScan for the README
  links in the meantime.

## After recording

- Trim to between 2:00 and 3:00. Check that no real name, email or other tab is visible.
- Upload, then put the video link and the transaction links in `README.md` (`grep -n TODO-DEPLOY README.md`). The
  post, approve and cancel on camera are good candidates for the example transactions.

## Short clip: QuestMaster with an AI agent (30 to 45 seconds)

A separate, short clip for social posts. It only reads the chain: no key, no
transaction. Record it when at least one quest is open on Onyx, so the agent
has something to list (the main video's preparation leaves one open).

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
| 0:35 | Web app | Open the same quest; show the escrow strip, the stepper and the facts panel (work window, or the deadline bar once taken or submitted). | "Same quest, same numbers, in the web app." |
| 0:40 | Web app | Hold on the quest page. | "QuestMaster: small tasks, paid in GNOT. Testnet only." |

Do not show or run any write in this clip (`gno_call`, keys, faucet,
sessions). If the agent offers to post or take a quest, decline on screen or cut it.
