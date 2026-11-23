# Testing the web app with Adena (by hand)

The wallet steps cannot be tested on the build server (no keys, and Adena is a
browser extension). Do this once the realm is **live** on Onyx, in your own
browser. It takes about 15 minutes.

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
- [ ] Switch Adena to another network: the header and the quest page's bar show
      "Switch to onyx-1".
      Click it and approve: the button goes back to your address.
- [ ] The header label says "Onyx testnet · test GNOT".

**Posting (as Poster)**
- [ ] Open **Post**. The yellow warning about the 7-day review window is there.
- [ ] Type an 81-character title: the error shows and the button is disabled.
- [ ] Fill a real title, details, reward 2, work window 1 day. The box shows
      what leaves your wallet (reward, storage deposit, fee).
- [ ] Click **Post and lock the reward**, check Adena shows a call to
      `PostQuest` with 2 GNOT sent, and sign.
- [ ] The app shows "Sent: your quest" with a GnoScan link that opens.
- [ ] On the board the quest appears with 2 GNOT; the totals line under the
      heading shows 2 more GNOT locked and one more open quest.

**Claiming and submitting (as Builder)**
- [ ] Switch Adena to Builder. Open the quest. "Take this quest" is enabled;
      "Cancel quest" is greyed out with "Only the poster can do this."
- [ ] Take the quest and sign. The state becomes "In progress".
- [ ] Submit work with `http://x` first: the app refuses it before signing.
      Then submit a real `https://` link and sign. State: "Waiting for review".

**Reviewing (as Poster)**
- [ ] Switch to Poster. The quest shows the review warning and the review
      deadline (about 7 days).
- [ ] Try **Take this quest** on your own open quest (post another one first):
      the button says "You posted this quest".
- [ ] On the submitted quest, click **Approve and pay**, sign.
- [ ] Builder's balance went up by exactly 2 GNOT (Adena, or GnoScan).
      The quest shows "Paid" and appears on the **Paid** page.

**Reject, close and cancel**
- [ ] Post a quest, take it as Builder, submit, then as Poster **Reject** with a
      reason that has a line break. The quest is Open again, "Times rejected 1",
      and the reason shows with its line break.
- [ ] Take it again as Builder. As Poster, **Close quest**: the quest shows
      "· closing" and the note "The reward returns to the poster…".
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
- [ ] The moon/sun button switches light and dark.
- [ ] The footer shows "Built on gno.land", the source link, the realm path and
      "Not an official Gno.land product. Testnet only".

## Not testable before launch

**Release** and **Claim the reward** need a deadline to pass on the real chain
(the shortest work window is about 1 hour; the review window about 7 days).
Check the first one by posting a quest with a 1-hour window, taking it and not
submitting: after the deadline anyone can release it.
