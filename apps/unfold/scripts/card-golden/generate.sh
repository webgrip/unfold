#!/usr/bin/env bash
# Regenerates test/fixtures/cards/assembly from a Ploeg checkout: every card its store tests assemble, with the delivery facts and card state it read.
# Run from the repository root: mise exec -- bash apps/unfold/scripts/card-golden/generate.sh
# It needs a Ploeg from v0.2.0-rc.10 to v0.2.0-rc.11 in PLOEG_DIR: rc.12 removed the card code (Ploeg ADR-0080), so the pinned submodule can no longer run it.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
unfold="$(cd "$here/../.." && pwd)"
ploeg="$(cd "${PLOEG_DIR:-$unfold/../ploeg}" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tar -C "$ploeg" --exclude=.git -cf - . | tar -C "$work" -xf -
sed -i 's/^func (s \*Store) OperatorCard(/func (s *Store) operatorCardInner(/' "$work/pkg/store/card.go"
sed -i 's/^func (s \*Store) OperatorCards(/func (s *Store) operatorCardsInner(/' "$work/pkg/store/card_list.go"
cp "$here/zz_golden_hook.go" "$here/zz_golden_test.go" "$work/pkg/store/"
mkdir -p "$work/out"
UNFOLD_GOLDEN_DIR="$work/out" go -C "$work" test ./pkg/store -run 'Card|Crack|Epic|Rarity|Mend|Revert|Set|Flow|Pipeline|Shape|Deploy' -count=1
rm -f "$unfold"/test/fixtures/cards/assembly/*.json
node -e 'const fs=require("fs");const [src,dst]=process.argv.slice(1);for(const f of fs.readdirSync(src))fs.writeFileSync(`${dst}/${f}`,JSON.stringify(JSON.parse(fs.readFileSync(`${src}/${f}`))));' "$work/out" "$unfold/test/fixtures/cards/assembly"
