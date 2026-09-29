# Vikunja backlog import

`agency-backlog.json` holds the work items for the agency offering decided in Glide ADR-0005 to ADR-0009 on 2026-09-29. `import.sh` creates them as tasks in Vikunja.

1. Create an API token in Vikunja with permission to create projects and tasks.
2. Preview the titles: `DRY_RUN=1 VIKUNJA_URL=https://vikunja.webgrip.dev ./import.sh`
3. Import into a new project named "Glide: agency offering":
   `VIKUNJA_URL=https://vikunja.webgrip.dev VIKUNJA_TOKEN=... ./import.sh`
4. To import into an existing project, set `PROJECT_ID`.

The script needs `curl` and `jq`. Running it twice creates duplicates.
