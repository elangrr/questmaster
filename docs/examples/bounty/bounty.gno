// Package bounty is the example from the QuestMaster README: a minimal realm
// that uses p/escrow for its rules. It is compiled and tested with
// `gno test ./...` from the repository root. It is an example, not deployed.
//
// The four rules every realm using p/escrow should follow, all shown here:
//  1. Take the actor only from cur.Previous(), never from an argument.
//  2. Accept only direct user calls (cur.Previous().IsUserCall()) where coins
//     are checked, so unsafe.OriginSend() really landed in this realm; refuse
//     coins on calls that do not take any.
//  3. Never return a stored *escrow.Quest: its methods change state and trust
//     the actor they are given. Return plain values.
//  4. Key the tree with zero-padded ids, so "10" sorts after "9".
package bounty

import (
	"chain"
	"chain/banker"
	"chain/runtime"
	"chain/runtime/unsafe"
	"strconv"
	"strings"

	"gno.land/p/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/escrow"
	"gno.land/p/nt/avl/v0"
)

var (
	quests avl.Tree // key(id) -> *escrow.Quest
	lastID uint64
)

// Post locks the ugnot sent with the call as the reward.
func Post(cur realm, title string, workBlocks int64) uint64 {
	poster := userCall(cur)
	sent := unsafe.OriginSend()
	if len(sent) != 1 || sent[0].Denom != "ugnot" {
		panic("send the reward as one ugnot coin")
	}
	q, err := escrow.NewQuest(lastID+1, poster, title, "", sent[0].Amount, workBlocks, runtime.ChainHeight())
	check(err)
	lastID++
	quests.Set(key(lastID), q)
	return lastID
}

func Claim(cur realm, id uint64) {
	actor := userCall(cur)
	noCoins()
	check(get(id).Claim(actor, runtime.ChainHeight()))
}

func Submit(cur realm, id uint64, link string) {
	actor := userCall(cur)
	noCoins()
	check(get(id).Submit(actor, link, runtime.ChainHeight()))
}

// Approve applies the move first, then pays exactly what the escrow says.
func Approve(cur realm, id uint64) {
	actor := userCall(cur)
	noCoins()
	p, err := get(id).Approve(actor, runtime.ChainHeight())
	check(err)
	pay(p, cur)
}

// Cancel refunds an open quest at once; on a claimed quest it only closes it
// (p.Due() is false and nothing is paid yet).
func Cancel(cur realm, id uint64) {
	actor := userCall(cur)
	noCoins()
	p, err := get(id).Cancel(actor, runtime.ChainHeight())
	check(err)
	pay(p, cur)
}

// State returns a plain value, never the stored *escrow.Quest.
func State(id uint64) string { return get(id).State().String() }

// userCall refuses anything but a direct call from a wallet and returns the
// caller. The actor always comes from cur.Previous().
func userCall(cur realm) address {
	if !cur.Previous().IsUserCall() {
		panic("direct user calls only")
	}
	return cur.Previous().Address()
}

func noCoins() {
	if len(unsafe.OriginSend()) != 0 {
		panic("this call takes no coins")
	}
}

// pay sends a payout only when one is due.
func pay(p escrow.Payout, rlm realm) {
	if !p.Due() {
		return
	}
	b := banker.NewBanker(banker.BankerTypeRealmSend, rlm)
	b.SendCoins(rlm.Address(), p.To, chain.Coins{{Denom: "ugnot", Amount: p.Amount}})
}

func get(id uint64) *escrow.Quest {
	v := quests.Get(key(id))
	if v == nil {
		panic("unknown quest")
	}
	return v.(*escrow.Quest)
}

// key zero-pads the id to 20 digits so the tree's order is numeric order.
func key(id uint64) string {
	s := strconv.FormatUint(id, 10)
	return strings.Repeat("0", 20-len(s)) + s
}

func check(err error) {
	if err != nil {
		panic(err.Error())
	}
}
