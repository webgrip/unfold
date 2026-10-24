#!/usr/bin/env sh
set -eu

release_commit='^chore(release): '

newest_tag() {
  git describe --tags --abbrev=0 --first-parent --match "$1[0-9]*" HEAD 2>/dev/null || true
}

unreleased_commits() {
  tag=$(newest_tag "$1")
  shift
  git rev-list --count --invert-grep --grep="$release_commit" "${tag:+$tag..}HEAD" -- "$@"
}

emit() {
  printf '%s=%s\n' "$1" "$2"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"; fi
}

pending() {
  application=$(unreleased_commits unfold-v apps ':(exclude)apps/site')
  site=$(unreleased_commits unfold-site-v apps/site)
  echo "Commits since the last release: $application for Unfold, $site for the site."
  emit sha "$(git rev-parse HEAD)"
  if [ "$application" -gt 0 ] || [ "$site" -gt 0 ]; then emit unreleased true; else emit unreleased false; fi
}

current() {
  checked=${1:?usage: scripts/release-train.sh current <the commit the checks passed>}
  if git merge-base --is-ancestor "$checked" HEAD \
    && [ "$(git rev-list --count --invert-grep --grep="$release_commit" "$checked..HEAD")" -eq 0 ]; then
    emit current true
  else
    echo "development moved past $checked, the commit the checks passed. The next release train releases the newer head."
    emit current false
  fi
}

case "${1:-}" in
  pending) pending ;;
  current) shift; current "$@" ;;
  *) echo "usage: scripts/release-train.sh pending | current <commit>" >&2; exit 2 ;;
esac
