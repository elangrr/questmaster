#!/usr/bin/env bash
# QuestMaster: full flow on a LOCAL gnodev chain (chain id "dev").
#
# What it proves, on a real node (bank module, storage deposits, tx revert),
# not under the test harness:
#   1. post, claim, submit, approve: builder +reward, realm -reward
#   2. post, cancel: the poster gets the reward back
#   3. calls that must fail (poster claims own quest; coins sent to ClaimQuest)
#      change nothing but the caller's gas fee
#   4. the realm balance equals Totals.Locked; storage deposits sit elsewhere
#
# How: gnodev replays a file of genesis transactions at boot, through the same
# Deliver path as normal transactions. Genesis transactions need no signature,
# so NO KEY is created, imported or used. Each stage reboots gnodev with the
# transactions so far and reads balances, totals and pages.
#
# Needs: gnodev and gno (v1.8.0) on PATH, python3, curl. Run from anywhere:
#   scripts/local-flow.sh            # output on stdout, pages in $OUT
#
# Safety: this script only talks to the local gnodev it starts, on 127.0.0.1.
# It refuses to run if CHAIN_ID is anything but the local "dev" chain, and it
# uses a throwaway GNOHOME so no existing key store is ever read or written.
set -euo pipefail

CHAIN_ID="${CHAIN_ID:-dev}"
if [ "$CHAIN_ID" != "dev" ]; then
	echo "refusing to run: this script is for the local gnodev chain (dev) only, not $CHAIN_ID" >&2
	exit 1
fi

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${OUT:-$(mktemp -d)}"
mkdir -p "$OUT"
export GNOHOME="$(mktemp -d)" # throwaway: gnodev keeps its built-in test key here
RPC_PORT=36657
WEB_PORT=38888
REALM="gno.land/r/questmaster_dev/questmaster"
WEB="http://127.0.0.1:$WEB_PORT/r/questmaster_dev/questmaster"
GNODEV_PID=""

cleanup() {
	[ -n "$GNODEV_PID" ] && kill "$GNODEV_PID" 2>/dev/null || true
	wait 2>/dev/null || true
	rm -rf "$GNOHOME"
}
trap cleanup EXIT

command -v gnodev >/dev/null || { echo "gnodev not found on PATH" >&2; exit 1; }
if curl -s --max-time 1 "http://127.0.0.1:$RPC_PORT/status" >/dev/null 2>&1; then
	echo "port $RPC_PORT is busy; stop the other node first" >&2
	exit 1
fi

# Standard gnodev test accounts (public keys only; genesis txs are unsigned).
POSTER=g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5   # test1
BUILDER=g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj  # test2
STRANGER=g1u7y667z64x2h7vc6fmpcprgey4ck233jaww9zq # test account from the gno repo
export POSTER BUILDER STRANGER REALM

# tx <caller> <func> <send> <args...>  -> one genesis tx line
tx() {
	python3 - "$@" <<'PY'
import json, sys
pub = {
    "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5": "A+FhNtsXHjLfSJk1lB8FbiL4mGPjc50Kt81J7EKDnJ2y",
    "g1us8428u2a5satrlxzagqqa5m6vmuze025anjlj": "AmG6kzznyo1uNqWPAYU6wDpsmzQKDaEOrVRaZ08vOyX0",
    "g1u7y667z64x2h7vc6fmpcprgey4ck233jaww9zq": "AnK+a6mcFDjY6b/v6p7r8QFW1M1PgIoQxBgrwOoyY7v3",
}
caller, fn, send, args = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
import os
print(json.dumps({"tx": {
    "msg": [{"@type": "/vm.m_call", "caller": caller, "send": send,
             "pkg_path": os.environ["REALM"], "func": fn, "args": args}],
    "fee": {"gas_wanted": "50000000", "gas_fee": "50000ugnot"},
    "signatures": [{"pub_key": {"@type": "/tm.PubKeySecp256k1", "value": pub[caller]}, "signature": ""}],
    "memo": ""}}))
PY
}

TXS="$OUT/txs.jsonl"
: >"$TXS"

boot() {
	local log="$OUT/gnodev-$1.log"
	(cd "$REPO" && exec gnodev local -chain-id "$CHAIN_ID" -no-watch -interactive=false \
		-txs-file "$TXS" -node-rpc-listener "127.0.0.1:$RPC_PORT" \
		-web-listener "127.0.0.1:$WEB_PORT" . >"$log" 2>&1) &
	GNODEV_PID=$!
	for _ in $(seq 1 60); do
		grep -q "node is ready" "$log" 2>/dev/null && break
		sleep 1
	done
	grep -q "node is ready" "$log" || { echo "gnodev did not start; see $log" >&2; exit 1; }
}

stop() {
	kill "$GNODEV_PID" 2>/dev/null || true
	wait "$GNODEV_PID" 2>/dev/null || true
	GNODEV_PID=""
	for _ in $(seq 1 30); do
		curl -s --max-time 1 "http://127.0.0.1:$RPC_PORT/status" >/dev/null 2>&1 || return 0
		sleep 1
	done
	echo "gnodev did not stop" >&2
	exit 1
}

# state <stage>: print failed genesis txs, balances, totals, storage deposit
state() {
	echo "--- failed transactions in this boot (gnodev log):"
	grep -o 'unable to deliver tx err="[^"]*"' "$OUT/gnodev-$1.log" || echo "(none)"
	python3 - "$1" "$OUT" <<'PY'
import json, os, sys, urllib.parse, urllib.request, base64, hashlib
stage, out = sys.argv[1], sys.argv[2]
def q(path, data=""):
    u = "http://127.0.0.1:36657/abci_query?path=%s&data=0x%s" % (
        urllib.parse.quote('"%s"' % path), data.encode().hex())
    r = json.load(urllib.request.urlopen(u))["result"]["response"]["ResponseBase"]
    if r["Error"]:
        return "ERROR " + json.dumps(r["Error"])[:200]
    return base64.b64decode(r["Data"]).decode() if r["Data"] else ""
CH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
def bech(hrp, data):
    def pm(v):
        g = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; c = 1
        for x in v:
            b = c >> 25; c = (c & 0x1ffffff) << 5 ^ x
            for i in range(5):
                c ^= g[i] if (b >> i) & 1 else 0
        return c
    acc = bits = 0; o = []
    for x in data:
        acc = (acc << 8) | x; bits += 8
        while bits >= 5:
            bits -= 5; o.append((acc >> bits) & 31)
    if bits:
        o.append((acc << (5 - bits)) & 31)
    hx = [ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp]
    p = pm(hx + o + [0] * 6) ^ 1
    return hrp + "1" + "".join(CH[d] for d in o + [(p >> 5 * (5 - i)) & 31 for i in range(6)])
def addr(pre): return bech("g", hashlib.sha256(pre.encode()).digest()[:20])
realm = os.environ["REALM"]
accts = {"poster": os.environ["POSTER"], "builder": os.environ["BUILDER"], "stranger": os.environ["STRANGER"],
         "realm": addr("pkgPath:" + realm), "storage deposit": addr("pkgPath:" + realm + ".storageDeposit")}
bal = {}
for k, a in accts.items():
    s = q("bank/balances/" + a).strip('"')
    bal[k] = int(s[:-5]) if s.endswith("ugnot") else 0
    print("balance %-16s %s %d ugnot" % (k, a, bal[k]))
print("GetTotals():", q("vm/qeval", realm + ".GetTotals()"))
print("vm/qstorage:", q("vm/qstorage", realm))
json.dump(bal, open(os.path.join(out, "bal-%s.json" % stage), "w"))
PY
}

# delta <from> <to>: per-account balance change between two stages
delta() {
	python3 - "$OUT/bal-$1.json" "$OUT/bal-$2.json" <<'PY'
import json, sys
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
for k in a:
    print("change %-16s %+d ugnot" % (k, b[k] - a[k]))
PY
}

page() { # page <stage> <name> <render path>
	curl -s -H "Accept: text/markdown" "$WEB$3" >"$OUT/page-$1-$2.md"
	curl -s "$WEB$3" >"$OUT/page-$1-$2.html"
}

run_stage() { # run_stage <name>
	echo
	echo "===== stage $1: $(wc -l <"$TXS") transactions replayed"
	boot "$1"
	state "$1"
}

# ---- stage 0: nothing yet (balances before)
run_stage s0-start
page s0-start home ""
# the "Post a quest" link opens gnoweb's form with the send amount prefilled
page s0-start postform '$help&func=PostQuest&.send=1000000ugnot'
if grep -q '1000000ugnot' "$OUT/page-s0-start-postform.html"; then
	echo "ok   PostQuest form prefills the send amount (1000000ugnot)"
else
	echo "FAIL PostQuest form does not show the send amount"
	exit 1
fi
stop

# ---- stage 1: post quest 1 (5 GNOT), claim, submit
tx "$POSTER" PostQuest 5000000ugnot "Write a gnokey cheat sheet" "One page, ten commands." 1000 >>"$TXS"
tx "$BUILDER" ClaimQuest "" 1 >>"$TXS"
tx "$BUILDER" SubmitWork "" 1 "https://github.com/example/questmaster/pull/1" >>"$TXS"
run_stage s1-submitted
page s1-submitted quest1 ":quest/1"
stop

# ---- stage 2: approve (poster) -> builder +5 GNOT, realm -5 GNOT
tx "$POSTER" ApproveWork "" 1 >>"$TXS"
run_stage s2-approved
delta s1-submitted s2-approved
page s2-approved home ""
page s2-approved quest1 ":quest/1"
page s2-approved paid ":paid"
stop

# ---- stage 3: post quest 2 (3 GNOT)
tx "$POSTER" PostQuest 3000000ugnot "Old idea" "" 1000 >>"$TXS"
run_stage s3-posted2
delta s2-approved s3-posted2
stop

# ---- stage 4: cancel quest 2 -> refund to poster
tx "$POSTER" CancelQuest "" 2 >>"$TXS"
run_stage s4-cancelled
delta s3-posted2 s4-cancelled
stop

# ---- stage 5: post quest 3 (2 GNOT)
tx "$POSTER" PostQuest 2000000ugnot "Fix typos in the docs" "Any typo counts." 1000 >>"$TXS"
run_stage s5-posted3
stop

# ---- stage 6: two calls that must fail: poster claims own quest; builder
#      claims with 1 GNOT attached. Expected: only gas fees change.
tx "$POSTER" ClaimQuest "" 3 >>"$TXS"
tx "$BUILDER" ClaimQuest 1000000ugnot 3 >>"$TXS"
run_stage s6-failed-calls
delta s5-posted3 s6-failed-calls
page s6-failed-calls quest3 ":quest/3"
stop

# ---- stage 7: the stranger claims quest 3 (works)
tx "$STRANGER" ClaimQuest "" 3 >>"$TXS"
run_stage s7-claimed3
delta s6-failed-calls s7-claimed3
page s7-claimed3 home ""
page s7-claimed3 quest3 ":quest/3"
page s7-claimed3 notfound ":quest/999"
stop

# ---- stage 8: hostile text through the real gnoweb renderer
tx "$POSTER" PostQuest 1000000ugnot '# A | `c` [x](https://e.vil) ![i](https://e.vil/i.png) <script>' \
	$'Line\n# h\n| a | b |\n|---|---|\n<script>alert(1)</script>\n![img](https://e.vil/i.png) [link](https://e.vil)\nsee g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5 and @moul' 1000 >>"$TXS"
tx "$BUILDER" ClaimQuest "" 4 >>"$TXS"
tx "$BUILDER" SubmitWork "" 4 'https://e.vil/a_(b)<c>`d`|e' >>"$TXS"
run_stage s8-injection
page s8-injection quest4 ":quest/4"
python3 - "$OUT/page-s8-injection-quest4.html" <<'PY'
import re, sys
html = open(sys.argv[1]).read()
# the realm's rendered content is gnoweb's <md-renderer id="main-content">
m = re.search(r'<md-renderer[^>]*id="main-content"[^>]*>(.*?)</md-renderer>', html, re.S)
if not m:
    print("FAIL rendered content not found in the page"); sys.exit(1)
body = m.group(1)
checks = {
    "<script in rendered content": "<script" in body,
    "<img in rendered content": "<img" in body,
    "link to e.vil other than the escaped work link": len(re.findall(r'href="https://e\.vil(?!/a_%28b%29%3Cc%3E%60d%60%7Ce)', body)) > 0,
    "work link href percent-encoded": 'href="https://e.vil/a_%28b%29%3Cc%3E%60d%60%7Ce"' not in body,
    "mention link to /u/moul": "/u/moul" in body,
    "extra <h1>/<h2> from user text": len(re.findall(r"<h[12][ >]", body)) != 3,
    "table built from user text (more than 1 table)": body.count("<table") != 1,
}
bad = [k for k, v in checks.items() if v]
for k, v in checks.items():
    print(("FAIL " if v else "ok   ") + k)
d = body.find('id="details"')
print("rendered details:", re.sub(r"\s+", " ", body[d:d + 900]))
sys.exit(1 if bad else 0)
PY
stop

echo
echo "pages and logs: $OUT"
