#!/usr/bin/env bash
# Replace the placeholder namespace "questmaster_dev" with the real one, in
# the code, tests and scripts, then run the tests.
#
#   scripts/set-namespace.sh g1abc...xyz        # your address (40 characters)
#   scripts/set-namespace.sh nym-fluxen123      # a name registered to that address
#
# After it: p/escrow    -> gno.land/p/<namespace>/escrow
#           r/questmaster -> gno.land/r/<namespace>/questmaster
#
# It only edits files in this repository. It does not call gnokey, touch any
# key or talk to any network. The docs keep "questmaster_dev" where they talk
# about the placeholder itself.
set -euo pipefail

NS="${1:-}"
if [ -z "$NS" ]; then
	echo "usage: $0 <namespace>   (a g1 address, or a registered name such as nym-fluxen123)" >&2
	exit 2
fi
if [[ "$NS" =~ ^g1[02-9ac-hj-np-z]{38}$ ]]; then
	kind="address"
elif [[ "$NS" =~ ^nym-[a-z]{5,13}[0-9]{3}$ ]]; then
	kind="registered name"
else
	echo "not a valid namespace: '$NS'" >&2
	echo "use a g1 address (40 characters) or a name in the form nym-<5 to 13 letters><3 digits>" >&2
	exit 2
fi

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

# Code, tests, filetest goldens and the local flow script. Not docs/ or README.
mapfile -t files < <(grep -rl --exclude-dir=.git "questmaster_dev" p r scripts/local-flow.sh || true)
if [ "${#files[@]}" -eq 0 ]; then
	echo "no placeholder left in p/, r/ or scripts/local-flow.sh; nothing to do" >&2
	exit 1
fi
echo "namespace: $NS ($kind)"
for f in "${files[@]}"; do
	sed -i "s/questmaster_dev/$NS/g" "$f"
	echo "  updated $f"
done

left="$(grep -rn --exclude-dir=.git "questmaster_dev" p r scripts/local-flow.sh || true)"
if [ -n "$left" ]; then
	echo "placeholder still present:" >&2
	echo "$left" >&2
	exit 1
fi
echo "ok: no 'questmaster_dev' left in p/, r/ or scripts/local-flow.sh"

echo "running gno test ./... (GNOHOME is a throwaway folder)"
GNOHOME="$(mktemp -d)"
export GNOHOME
trap 'rm -rf "$GNOHOME"' EXIT
gno test ./...
gno lint ./...
echo "done: module paths are gno.land/p/$NS/escrow and gno.land/r/$NS/questmaster"
