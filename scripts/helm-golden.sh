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

# The chart version is substituted out before the diff. semantic-release rewrites
# Chart.yaml version/appVersion on every rc, and those strings land in three labels
# on every object plus the ploegd image tag — so a release nobody reviewed stales all
# three goldens, and the next pull request fails a check with nothing to say. That
# happened on rc.9→rc.10 and again on rc.10→rc.11. Substituting keeps the goldens
# about the templates, which is the only thing here anyone can get wrong. Nothing is
# given up: an image tag that stopped tracking .Chart.AppVersion no longer matches
# the substitution and still lands in the diff.
chart_version=$(sed -n 's/^version:[[:space:]]*//p' ops/helm/ploeg/Chart.yaml)
chart_app_version=$(sed -n 's/^appVersion:[[:space:]]*//p' ops/helm/ploeg/Chart.yaml)
if [ -z "$chart_version" ] || [ -z "$chart_app_version" ]; then
	echo "cannot read version/appVersion from ops/helm/ploeg/Chart.yaml" >&2
	exit 1
fi
# Escape the two regex metacharacters a semver can contain (`.` separators, `+`
# build metadata), so 0.2.0 does not also match 0x2y0.
escape() { printf '%s' "$1" | sed 's/[.+]/\\&/g'; }
version_re=$(escape "$chart_version")
app_version_re=$(escape "$chart_app_version")

render() { # <values-file-or-empty>
	if [ -n "$1" ]; then
		helm template ploeg ops/helm/ploeg -f "$1"
	else
		helm template ploeg ops/helm/ploeg
	fi | sed -e "s/$version_re/CHART-VERSION/g" -e "s/$app_version_re/CHART-VERSION/g"
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
	echo "FIRST: is the diff only blank lines around '---' separators, on a"
	echo "branch that changed nothing under ops/helm? Then this is your helm,"
	echo "not your change. The goldens are generated with the version CI pins"
	echo "(see .forgejo/workflows/on_pull_request.yml); helm 3 and helm 4"
	echo "disagree about the blank line before a document separator. Running"
	echo "'update' here commits whitespace churn that BREAKS the CI check."
	echo "  yours: $(helm version --short 2>/dev/null || echo 'helm not on PATH')"
	echo
	echo "Otherwise, if the change is intended, run ./scripts/helm-golden.sh"
	echo "update and commit the result — the diff is the review."
	echo
	echo "Read it carefully when it touches a securityContext, a privileged"
	echo "container, or the ploeg.webgrip.dev/privileged-dind label: that label"
	echo "is what the Kyverno PolicyException in webgrip/homelab-cluster waives."
fi
exit $status
