// PKGPATH: gno.land/r/questmaster_dev/questmaster/filetests/z_pages_filetest

// Golden copy of the main pages on a small board with a quest in every
// state. Any change to what users see shows up as a diff here.
// Update with: gno test -update-golden-tests ./r/questmaster/
package z_pages_filetest

import (
	"chain"
	"testing"

	"gno.land/r/questmaster_dev/questmaster"
)

const (
	poster  = address("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5") // test1
	builder = address("g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj") // test2
)

func post(cur realm, reward int64, title, details string) uint64 {
	testing.SetRealm(testing.NewUserRealm(poster))
	testing.SetOriginSend(chain.Coins{{Denom: "ugnot", Amount: reward}})
	testing.IssueCoins(chain.PackageAddress("gno.land/r/questmaster_dev/questmaster"), chain.Coins{{Denom: "ugnot", Amount: reward}})
	id := questmaster.PostQuest(cross(cur), title, details, 20_000)
	testing.SetOriginSend(nil)
	return id
}

func main(cur realm) {
	paid := post(cur, 2_500_000, "Translate the README to Indonesian", "Keep the headings.\nUse plain words.")
	testing.SetRealm(testing.NewUserRealm(builder))
	questmaster.ClaimQuest(cross(cur), paid)
	questmaster.SubmitWork(cross(cur), paid, "https://github.com/example/questmaster/pull/7")
	testing.SetRealm(testing.NewUserRealm(poster))
	questmaster.ApproveWork(cross(cur), paid)

	cancelled := post(cur, 1_000_000, "Old idea", "")
	testing.SetRealm(testing.NewUserRealm(poster))
	questmaster.CancelQuest(cross(cur), cancelled)

	working := post(cur, 3_000_000, "Write a gnokey cheat sheet", "One page, the ten most used commands.")
	testing.SetRealm(testing.NewUserRealm(builder))
	questmaster.ClaimQuest(cross(cur), working)

	review := post(cur, 5_000_000, "Add a dark theme to the demo page", "")
	testing.SetRealm(testing.NewUserRealm(builder))
	questmaster.ClaimQuest(cross(cur), review)
	questmaster.SubmitWork(cross(cur), review, "https://github.com/example/questmaster/pull/9")

	post(cur, 1_200_000, "Fix typos in docs/plan.md", "Any typo counts.")

	println(questmaster.Render(""))
	println("=====")
	println(questmaster.Render("quest/4"))
	println("=====")
	println(questmaster.Render("paid"))
	println("=====")
	println(questmaster.Render("builder/" + builder.String()))
}

// Output:
// # QuestMaster
//
// A bounty board for small tasks, paid in GNOT. A poster describes a task and locks the reward in this realm. A builder takes the task, does the work and sends a link to it. When the poster approves, the realm pays the builder. If the poster never answers, the builder can collect the reward after the review window. Nobody else, not even the authors, can move the locked GNOT.
//
// _Runs on the Onyx test network with test GNOT._
//
// [Post a quest](/r/questmaster_dev/questmaster$help&func=PostQuest&.send=1000000ugnot) · [How it works](#how-it-works) · [Help and commands](/r/questmaster_dev/questmaster:help) · [Paid quests](/r/questmaster_dev/questmaster:paid)
//
// ## Board
//
// | Open quests | GNOT locked | GNOT paid out | Quests paid |
// |---|---|---|---|
// | 1 | 9.2 | 2.5 | 1 |
//
// ## Open quests
//
// | # | Quest | Reward | Work window | Rejected |
// |---|---|---|---|---|
// | 5 | [Fix typos in docs/plan\.md](/r/questmaster_dev/questmaster:quest/5) | 1.2 GNOT | 20,000 (about 19 hours) | 0 |
//
// ## How it works
//
// 1. **Post.** The poster writes a title, details and a work window, and sends the reward (at least 1 GNOT) with the call. The GNOT is locked here.
// 2. **Claim.** Anyone except the poster takes the quest. Only one builder works on a quest at a time.
// 3. **Submit.** The builder sends a link to the work (it must start with `https://`) before the work window ends.
// 4. **Review.** The poster approves (the builder is paid at once) or rejects with a reason (the quest opens again, and the reject count goes up for everyone to see).
// 5. **Paid.** The reward goes to the builder. A poster can also cancel an open quest and get the reward back.
//
// Two deadlines keep things moving:
//
// - **Work window** (set by the poster, 1,000 to 2,200,000 blocks): if the builder has not submitted by then, anyone can release the quest so someone else can take it.
// - **Review window** (75,000 blocks, about 3 days): if the poster has not approved or rejected by then, the builder can claim the reward.
//
// _Times are approximate, at about 3.5 seconds per block; deadlines are exact block heights._
//
// =====
// # Quest 4: Add a dark theme to the demo page
//
// [Board](/r/questmaster_dev/questmaster) · [Help](/r/questmaster_dev/questmaster:help)
//
// | | |
// |---|---|
// | State | **Submitted (waiting for review)** |
// | Reward | 5 GNOT |
// | Poster | [g1jg8mtu…sqf5](/r/questmaster_dev/questmaster:poster/g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5) |
// | Builder | [g1us8428…njlj](/r/questmaster_dev/questmaster:builder/g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj) |
// | Work window | 20,000 blocks (about 19 hours) |
// | Posted at block | 123 |
// | Submitted at block | 123 |
// | Review deadline | block 75,123 (about 3 days left) |
// | Work | [https://github\.com/example/questmaster/pull/9](https://github.com/example/questmaster/pull/9) |
// | Times rejected | 0 |
// | Current block | 123 |
//
// ## Details
//
// _No details given._
//
// ## What can happen next
//
// If the poster does not answer by block 75,123, the builder can claim the reward from block 75,124.
//
// - **Approve**: the poster accepts the work and the builder is paid 5 GNOT. [Open in gnoweb](/r/questmaster_dev/questmaster$help&func=ApproveWork&id=4)
// - **Reject**: the poster refuses the work with a reason, until block 75,123. The quest opens again. [Open in gnoweb](/r/questmaster_dev/questmaster$help&func=RejectWork&id=4)
//
// With gnokey on Onyx (replace `KEY` with your key name):
//
// ```
// gnokey maketx call -pkgpath "gno.land/r/questmaster_dev/questmaster" -func "ApproveWork" -args "4" -gas-fee 1000000ugnot -gas-wanted 20000000 -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 KEY
// gnokey maketx call -pkgpath "gno.land/r/questmaster_dev/questmaster" -func "RejectWork" -args "4" -args "What is missing" -gas-fee 1000000ugnot -gas-wanted 20000000 -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 KEY
// ```
//
// _Times are approximate, at about 3.5 seconds per block; deadlines are exact block heights._
//
// =====
// # Paid quests
//
// [Board](/r/questmaster_dev/questmaster)
//
// Every quest below was paid by this realm to its builder: 1 quest, 2.5 GNOT in total.
//
// | # | Quest | Reward | Builder | Times rejected |
// |---|---|---|---|---|
// | 1 | [Translate the README to Indonesian](/r/questmaster_dev/questmaster:quest/1) | 2.5 GNOT | [g1us8428…njlj](/r/questmaster_dev/questmaster:builder/g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj) | 0 |
//
//
// =====
// # Builder g1us8428…njlj
//
// [Board](/r/questmaster_dev/questmaster) · [Same address as poster](/r/questmaster_dev/questmaster:poster/g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj)
//
// Address: `g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj`
//
// Quests this address has claimed, with their current state. A quest stays here after the builder gives it up or is rejected.
//
// | # | Quest | Reward | State | Poster |
// |---|---|---|---|---|
// | 4 | [Add a dark theme to the demo page](/r/questmaster_dev/questmaster:quest/4) | 5 GNOT | Submitted (waiting for review) | [g1jg8mtu…sqf5](/r/questmaster_dev/questmaster:poster/g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5) |
// | 3 | [Write a gnokey cheat sheet](/r/questmaster_dev/questmaster:quest/3) | 3 GNOT | Claimed (work in progress) | [g1jg8mtu…sqf5](/r/questmaster_dev/questmaster:poster/g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5) |
// | 1 | [Translate the README to Indonesian](/r/questmaster_dev/questmaster:quest/1) | 2.5 GNOT | Paid | [g1jg8mtu…sqf5](/r/questmaster_dev/questmaster:poster/g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5) |
