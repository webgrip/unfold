#!/usr/bin/env bash
# Imports agency-backlog.json into a Vikunja project.
#
# Usage:
#   VIKUNJA_URL=https://vikunja.example.com VIKUNJA_TOKEN=... ./import.sh [backlog.json]
#   PROJECT_ID=123 ...   import into an existing project instead of creating one
#   DRY_RUN=1 ...        print what would be created
set -euo pipefail

file=${1:-"$(dirname "$0")/agency-backlog.json"}
: "${VIKUNJA_URL:?set VIKUNJA_URL}"
api="${VIKUNJA_URL%/}/api/v1"

if [ -n "${DRY_RUN:-}" ]; then
  jq -r '.[].title' "$file"
  exit 0
fi

: "${VIKUNJA_TOKEN:?set VIKUNJA_TOKEN}"
auth=(-H "Authorization: Bearer $VIKUNJA_TOKEN" -H "Content-Type: application/json")

if [ -z "${PROJECT_ID:-}" ]; then
  PROJECT_ID=$(curl -fsS -X PUT "${auth[@]}" "$api/projects" \
    -d '{"title":"Glide: agency offering"}' | jq -r .id)
  echo "created project $PROJECT_ID"
fi

jq -c '.[] | {title, description: ("<p>" + .description + "</p>")}' "$file" |
  while read -r task; do
    curl -fsS -X PUT "${auth[@]}" "$api/projects/$PROJECT_ID/tasks" -d "$task" |
      jq -r '"#\(.id) \(.title)"'
  done
