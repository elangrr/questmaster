# Testing the web app with Adena (by hand)

The wallet steps cannot be tested on the build server (no keys, and Adena is a
browser extension). Do it on Onyx, where the realm is live since 2026-11-24,
in your own browser. It takes about 15 minutes.

## You need

- Chrome or Brave with the [Adena](https://adena.app) extension.
- Two **test-only** accounts in Adena: **Poster** and **Builder**.
- Test GNOT on both from https://faucet.gno.land ("Onyx Faucet"): Poster at
  least 10, Builder at least 2.
- The web app open: the hosted URL, or `cd web && npm ci && npm run dev`
  (http://localhost:5173).

Write down each account's balance before you start.

## Checklist

Tick each line. If something looks wrong, note the step, what you saw, and the
transaction link the app showed.

**Connecting**
- [ ] Without Adena (or in a private window), the header says "Get Adena". On a
      quest page one bar above the actions offers "Get Adena" and "Other ways to
      sign"; each action has its own "Other ways to sign" with a gnokey command
      and a gnoweb link (no wallet button repeated per action).
- [ ] Click **Connect wallet** and approve in Adena: your short address appears
      top right.
- [ ] Reload the page: you stay connected, with no Adena popup and no click.
      While it reconnects the header shows a small spinner, not "Connect
      wallet".
- [ ] Lock Adena and reload: the header quietly shows "Connect wallet" (no
      popup). Unlock Adena and reload: connected again.
- [ ] Click the disconnect icon next to your address, then reload: "Connect
      wallet" shows and stays.
- [ ] Switch Adena to another network: the header and the quest page's bar show
      "Switch to onyx-1".
      Click it and approve: the button goes back to your address.
- [ ] The header label says "Onyx testnet · test GNOT".

**Posting (as Poster)**
- [ ] Open **Post**. The "What leaves your wallet" cost card and the amber
      warning about the 7-day review window sit in the right column on wide
      screens (and below the form, above the sign button, on phones).
- [ ] Type an 81-character title: the error shows and the button is disabled.
- [ ] Fill a real title, details, reward 2, work window 1 day. The "What leaves
      your wallet" card updates with the reward, storage deposit and fee.
- [ ] Click **Post and lock the reward**, check Adena shows a call to
      `PostQuest` with 2 GNOT sent, and sign.
- [ ] Right after signing, the steps show a spinner with "Updating status…".
      Then the app shows "Sent: your quest" with a GnoScan link that opens,
      and an **Open quest N** button that opens the new quest.
- [ ] On the board the quest appears with 2 GNOT; the totals bar below the hero
      shows 2 more GNOT locked and one more open quest.

**Claiming and submitting (as Builder)**
- [ ] Switch Adena to Builder. Open the quest. "Take this quest" is a button
      of its own (no "Do this" step); "Cancel quest" is greyed out with "Only
      the poster can do this."
- [ ] Click **Take this quest** once: Adena opens straight away. Sign. The
      steps show "Updating status…" with a spinner, then the page shows "In
      progress" and the "Sent" notice by itself, without a reload.
- [ ] The link field sits in the Submit work row. Type `http://x` first: the
      **Submit work** button stays disabled with the reason under the field.
      Then type a real `https://` link, click **Submit work** and sign. State:
      "Waiting for review".

**Reviewing (as Poster)**
- [ ] Live status: keep the quest open as Poster in a second browser profile
      (or a second browser with Adena) while Builder submits. Within a few
      seconds the Poster's page shows "Waiting for review" with **Approve and
      pay** and **Reject the work**, without a reload.
- [ ] Switch to Poster. The quest shows the review warning and the review
      deadline (about 7 days).
- [ ] Try **Take this quest** on your own open quest (post another one first):
      its button is disabled and the line under it says "You posted this
      quest; someone else must take it."
- [ ] On the submitted quest, click **Approve and pay**, sign.
- [ ] Builder's balance went up by exactly 2 GNOT (Adena, or GnoScan).
      The quest shows "Paid" and appears on the **Paid** page.

**Reject, close and cancel**
- [ ] Post a quest, take it as Builder, submit, then as Poster click **Reject
      the work**: the reason field opens under it and the same button signs
      once there is a reason. Use a reason that has a line break. The quest is Open again, "Times rejected 1",
      and the reason shows with its line break.
- [ ] Take it again as Builder. As Poster, **Close quest**: the state badge
      shows "In progress · closing" and the closing note says "Closing. The
      reward returns to the poster…".
- [ ] As Builder, **Give the quest back**: the quest becomes Cancelled and the
      Poster gets the reward back.
- [ ] Post one more and **Cancel** it while open: refund arrives at once.

**Errors**
- [ ] Start any action and click Reject in Adena: the app says "You cancelled
      this in Adena. Nothing was sent."
- [ ] Lock Adena and try an action: the app says Adena is locked.

**Looks**
- [ ] On a phone (or a narrow window), the board, a quest and the post form are
      readable without sideways scrolling.
- [ ] The theme button in the header cycles through system (auto), light (sun)
      and dark (moon).
- [ ] The footer shows "Built on gno.land", the source link, the realm path and
      "Not an official Gno.land product. Testnet only".

## Not testable before launch

**Release** and **Claim the reward** need a deadline to pass on the real chain
(the shortest work window is about 1 hour; the review window about 7 days).
Check the first one by posting a quest with a 1-hour window, taking it and not
submitting: after the deadline anyone can release it.
