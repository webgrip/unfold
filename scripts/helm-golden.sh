#!/bin/sh
# Golden renders of the Helm chart.
#
# `check` (CI) fails when a rendered manifest differs from the committed
# golden; `update` regenerates them after an intended change.
#
# Why a chart has goldens at all: the worker pod is a security boundary. Its
# privileged DinD sidecar is waived by a Kyverno PolicyException in
# webgrip/homelab-cluster that matches the `ploeg.webgrip.dev/privileged-dind`
# label THIS chart emits. A template edit that put that label on a workload
# which takes no privilege — or dropped it from one that does — would widen or
# void a security waiver with nothing in the diff to review. The goldens make
# every rendered byte show up in the pull request.
#
# They also pin the property the Shift rollout depends on: a team with no plan
# renders exactly what it rendered before Roles existed.
set -eu

cd "$(dirname "$0")/.."
GOLDEN=ops/helm/ploeg/ci/golden
mode="${1:-check}"

render() { # <values-file-or-empty> <golden-name>
	if [ -n "$1" ]; then
		helm template ploeg ops/helm/ploeg -f "$1"
	else
		helm template ploeg ops/helm/ploeg
	fi
}

status=0
for case in ":default" \
	"ops/helm/ploeg/ci/executor-values.yaml:executor" \
	"ops/helm/ploeg/ci/executor-cronjob-values.yaml:executor-cronjob"; do
	values=${case%%:*}
	name=${case##*:}
	if [ "$mode" = "update" ]; then
		render "$values" >"$GOLDEN/$name.yaml"
		echo "updated $GOLDEN/$name.yaml"
		continue
	fi
	if ! render "$values" | diff -u "$GOLDEN/$name.yaml" - >/tmp/golden-$name.diff; then
		echo "chart render '$name' differs from its golden:"
		cat /tmp/golden-$name.diff
		status=1
	fi
done

if [ "$mode" = "check" ] && [ "$status" -ne 0 ]; then
	echo
	echo "If the change is intended, run ./scripts/helm-golden.sh update and"
	echo "commit the result — the diff is the review."
	echo
	echo "Read it carefully when it touches a securityContext, a privileged"
	echo "container, or the ploeg.webgrip.dev/privileged-dind label: that label"
	echo "is what the Kyverno PolicyException in webgrip/homelab-cluster waives."
fi
exit $status
