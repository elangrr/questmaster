# Demo video script (2 to 3 minutes)

A screen recording of the real deployment on the Onyx test network, with two wallets: **Poster** and **Builder**.
Words to say are in quotes. Keep sentences short and calm; it is fine to pause while a transaction confirms and cut
the wait out afterwards.

## Preparation checklist

- [ ] Realm and escrow live on Onyx (`docs/deploy.md`); note the realm URL.
- [ ] Two test-only wallets in Adena, named **Poster** and **Builder** (not your real name). Switched to Onyx.
- [ ] Both funded from the Onyx Faucet: Poster at least 30 test GNOT, Builder at least 5.
- [ ] One quest already **paid** before recording (post, claim, submit, approve), so the Paid page is not empty.
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
| 0:00 | Board home page | Scroll slowly from the title to the totals. | "This is QuestMaster, a bounty board on Gno.land. You post a small task and lock the reward in GNOT. A builder does the work, and the realm pays them when you approve. It runs on the Onyx testnet with test GNOT." |
| 0:20 | Home page, "Post a quest" links | Switch Adena to **Poster**. Click "5 GNOT". | "Let's post a quest with a 5 GNOT reward." |
| 0:25 | gnoweb form for PostQuest | Type the title and details, work window `20000`. Turn on the switch that adds the 5 GNOT. Sign in Adena. | "The form already holds the reward. I confirm sending it, fill in the task, and sign. The 5 GNOT is now locked in the realm, not with me and not with anyone else." |
| 0:45 | Home page | Reload; point at the new row and "GNOT locked". | "The quest is open, and the board shows the locked reward." |
| 0:50 | Quest page | Open the quest. Point at "What can happen next". | "Every quest page shows only the moves that are possible now, and who may make them." |
| 0:55 | Quest page | Switch Adena to **Builder**. Click "Open in gnoweb" next to Claim, sign. | "Now I'm the builder. I claim the quest. The work window starts now." |
| 1:05 | Quest page | Reload. Click "Open in gnoweb" next to Submit work, paste the link, sign. | "I've done the work, so I submit a link to it." |
| 1:15 | Quest page | Reload. Point at State "Submitted" and the review deadline. | "The poster now has about 3 days to approve or reject. If they never answer, the builder can claim the reward after that." |
| 1:20 | Quest page | Switch Adena to **Poster**. Click Approve, sign. | "Back as the poster. The work is good, so I approve." |
| 1:30 | Adena, Builder account | Show the Builder's balance. | "The builder received exactly 5 GNOT, paid by the realm." |
| 1:40 | Paid page | Open "Paid quests". | "The Paid page lists every quest the board has paid, as public proof." |
| 1:50 | Home page, then a second open quest | As **Poster**, open the other open quest, click Cancel, sign. | "A poster can also cancel an open quest. The reward comes straight back." |
| 2:00 | Help page, "Claim a timeout payout" | Scroll to the rules. | "Two deadlines keep things fair: if a builder stalls, anyone can release the quest; if a poster stays silent, the builder gets paid." |
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
