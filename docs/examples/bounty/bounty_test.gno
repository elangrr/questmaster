package bounty

import (
	"chain"
	"chain/banker"
	"testing"

	"gno.land/p/g1llc3lq3zmjtjdk29dk52munrzxt5ne746cl7r8/escrow"
	"gno.land/p/nt/uassert/v0"
)

var (
	poster  = address("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5")
	builder = address("g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj")
)

func TestFlow(cur realm, t *testing.T) {
	reward := chain.Coins{{Denom: "ugnot", Amount: 2_000_000}}
	testing.IssueCoins(cur.Address(), reward) // what -send does on chain

	testing.SetRealm(testing.NewUserRealm(poster))
	testing.SetOriginSend(reward)
	id := Post(cross(cur), "Write a guide", escrow.MinWorkBlocks)
	testing.SetOriginSend(nil)

	testing.SetRealm(testing.NewUserRealm(builder))
	Claim(cross(cur), id)
	Submit(cross(cur), id, "https://example.com/guide")

	testing.SetRealm(testing.NewUserRealm(poster))
	Approve(cross(cur), id)

	bk := banker.NewReadonlyBanker()
	uassert.Equal(t, "Paid", State(id))
	uassert.Equal(t, int64(2_000_000), bk.GetCoin(builder, "ugnot"))
	uassert.Equal(t, int64(0), bk.GetCoin(cur.Address(), "ugnot"))
}

func TestRefusals(cur realm, t *testing.T) {
	testing.IssueCoins(cur.Address(), chain.Coins{{Denom: "ugnot", Amount: 1_000_000}}) // before SetRealm changes cur
	testing.SetRealm(testing.NewUserRealm(poster))
	testing.SetOriginSend(chain.Coins{{Denom: "ugnot", Amount: 1_000_000}})
	id := Post(cross(cur), "Another", escrow.MinWorkBlocks)

	// coins on a call that takes none
	testing.SetRealm(testing.NewUserRealm(builder))
	testing.SetOriginSend(chain.Coins{{Denom: "ugnot", Amount: 1}})
	uassert.AbortsContains(t, cur, "takes no coins", func() { Claim(cross(cur), id) })
	testing.SetOriginSend(nil)

	// another realm cannot act
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/evil/proxy"))
	uassert.AbortsContains(t, cur, "direct user calls only", func() { Claim(cross(cur), id) })

	// cancelling an open quest refunds it
	testing.SetRealm(testing.NewUserRealm(poster))
	before := banker.NewReadonlyBanker().GetCoin(poster, "ugnot")
	Cancel(cross(cur), id)
	uassert.Equal(t, before+1_000_000, banker.NewReadonlyBanker().GetCoin(poster, "ugnot"))
}

func TestKeysSortNumerically(t *testing.T) {
	uassert.Equal(t, "00000000000000000009", key(9))
	uassert.True(t, key(9) < key(10))
}
