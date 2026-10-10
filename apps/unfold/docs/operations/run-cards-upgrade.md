# Move Run cards from Ploeg to Unfold

Since Unfold v0.4.0-rc.52 Unfold computes Run cards itself from Ploeg's delivery facts. It keeps cracks, frozen rarities and the card comment in its own store ([root ADR-0030](../../../../docs/adr/adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts.md)). Ploeg's card code went away in two Ploeg releases: v0.2.0-rc.10 added the facts, and v0.2.0-rc.12 removed every card route, the export and the card tables ([Ploeg ADR-0080](../../../ploeg/docs/adrs/0080-ploeg-keeps-no-run-card-code-and-removes-it-in-one-release.md)). This page gives the order of the move, the configuration to move, and how to check each step.

## Which Unfold release imports

Unfold v0.4.0-rc.52 and v0.4.0-rc.53 copied Ploeg's card state once, from Ploeg's `card-legacy-export`. Later Unfold releases no longer call the export, because Ploeg v0.2.0-rc.12 removed it. They keep the imported rows and the recorded result.

* **Upgrading Ploeg to v0.2.0-rc.12 requires the import to have finished** on Unfold v0.4.0-rc.53 or earlier. Migration 0044 drops Ploeg's card tables, so cracks, frozen rarities, card comment records and play shapes that were never imported are lost.
* **An installation that has not imported yet** runs steps 1 to 7 below with Unfold v0.4.0-rc.53, then upgrades Unfold, and only then Ploeg.
* **An installation whose Ploeg never recorded card state** can skip the import and steps 3 and 7.
* The homelab has imported (marker `done`).

## Before you start

* Unfold's Ploeg credential (`ploeg.tokenEnv`) needs **execute** permission. Unfold writes the card comment through Ploeg's keyed comment as the actor `unfold-cards`.
* Back up Unfold's data directory. The import writes into its SQLite store.
* Keep a copy of Ploeg's configuration file. The card settings below come from it.

## Order of the upgrade

Steps 3 and 7 are history: they ran once, on Unfold v0.4.0-rc.52 or v0.4.0-rc.53.

1. **Upgrade Ploeg to the release that supplies delivery facts** (Ploeg ADR-0079, ploeg-hq/ploeg#91). Leave its `cards` setting alone, so Ploeg keeps posting its card comment for now.
2. **Move the card configuration into Unfold** (see [Configuration to move](#configuration-to-move)), then upgrade Unfold to this release. Unfold checks the settings at start-up and refuses an invalid pattern, calendar or status list with Ploeg's own message.
3. **Wait for the import (done once, history).** About 30 seconds after start-up Unfold sees that Ploeg serves facts and copies Ploeg's card state once:
   * cracks in every state, under Ploeg's ids;
   * frozen rarities;
   * the card comment records;
   * the play shapes Ploeg measured from diffs it no longer has.

   Unfold then reads Ploeg's facts list once to index earlier changes.
   * **Where to see it.** The Status page shows the result under Ploeg, in **Details**, for example "Run cards: Imported 12 cracks, 40 frozen rarities, 9 card comments and 75 play shapes from Ploeg." The log line is `cards.imported`. Later releases keep showing the recorded result, and show nothing when no import was recorded.
   * **If it fails.** The line says why, the log has `cards.import_failed`, and Unfold retries every five minutes from the page where it stopped. Running it again never duplicates a row.
   * **Until it finishes.** Unfold refuses crack steps with "Unfold is still importing the cracks Ploeg recorded", so no attribution lands in both places.
4. **Check a few cards.** Open the Work Item page of a card with a crack and one with a revealed rarity. They show the same grade, rarity and condition as before.
5. **Turn Ploeg's card switch off.** Set this in Ploeg's configuration file and restart `ploegd`:

   ```yaml
   cards:
     enabled: false
   ```

   This stops Ploeg's card comment, rarity and mend sweeps and the comment it posts at a merge. Its card routes keep answering.
6. **Turn Unfold's comment publisher on**, only after step 5. Set `cards.publishPullRequestComment: true`. For each Team whose Ploeg configuration had `cards.prComment: true`, set `cards.rules.teams.<team>.pullRequestComment: true`. Then restart Unfold.
   * The first comment Unfold publishes on a pull request takes over the comment Ploeg posted there (`adoptCommentId`), so no second card appears.
   * If Ploeg's switch were still on, Ploeg's sweep would post a new card next to Unfold's.
7. **Only then upgrade Ploeg to v0.2.0-rc.12, which removes its card code.** That release no longer offers the export. Upgrade only once the Status page says the import is done. After it, upgrade Unfold to a release later than v0.4.0-rc.53.

Without Ploeg's delivery facts there are no cards. Unfold no longer reads Ploeg's card endpoints in their place: the card, card list and crack routes answer 503 `cards_facts_unavailable` and say why, and the Work Item page shows no card.

## Configuration to move

Every Unfold setting is optional and defaults to what Ploeg did without one.

| Ploeg setting | Unfold setting |
| --- | --- |
| A Work Target's or project's `cardStyle: {skin, theme}` | `cards.rules.repositories."owner/name".style: {skin, theme}` |
| `release: {environment}` | `cards.rules.repositories."owner/name".releaseEnvironment` (default `production`) |
| `rarity: {sensitivePaths, attentionPaths, sizeExclude}` | `cards.rules.repositories."owner/name".rarity` with the same three lists |
| `cardShape: {testPaths, docPaths}` | `cards.rules.repositories."owner/name".shape` with the same two lists |
| A project's `statusKinds: {active, waiting, blocked, done}` | `cards.rules.boards."<provider>:<board id>".statusKinds`. The board id is the Work Item's `externalScope` in Ploeg's facts. `"<provider>:*"` covers every board without its own entry, and the facts of a Ploeg release that sends no board |
| A project's `gates` | Stays in Ploeg, which records the gate moves. Add a copy under `cards.rules.boards."<provider>:<board id>".gates` only to label statuses Ploeg recorded without a gate. |
| A Team's `workingHours: {timezone, days, start, end, holidays}` | `cards.rules.teams.<team>.workingHours` (default Monday to Friday, 09:00 to 17:00, Europe/Amsterdam) |
| A Team's `cards.referees` | `cards.rules.teams.<team>.referees`, as forge logins |
| A Team's `cards.hotfixLabels` | `cards.rules.teams.<team>.hotfixLabels` (default `hotfix`) |
| A Team's `cards.prComment` | `cards.rules.teams.<team>.pullRequestComment`, together with `cards.publishPullRequestComment` (step 6) |
| Ploeg's forge bot logins | Read from the facts (`botLogins`); add others under `cards.rules.bots` |

* **Repository keys** are `owner/name` and compare without case.
* **Board ids** are the tracker's project id, the same id Ploeg resolved for the project and sends as `workItem.externalScope`.
* **Flow figures and rarity** can be turned off with `cards.rules.flow: false` and `cards.rules.rarity: false`.

Example:

```json
"cards": {
  "publishPullRequestComment": false,
  "rules": {
    "repositories": { "webgrip/unfold": { "style": { "skin": "forge" }, "rarity": { "attentionPaths": ["apps/unfold/src/auth.ts"] } } },
    "boards": { "vikunja:10": { "statusKinds": { "active": ["UAT"] } } },
    "teams": { "delivery": { "referees": ["anna"], "workingHours": { "timezone": "Europe/Amsterdam", "holidays": ["2026-12-25"] } } }
  }
}
```

## Who acts on a crack

Crack steps use Unfold's sign-in. Each person needs a forge login under `ploeg.forgeLogins`, set by an administrator ([Unfold ADR 0030](../adrs/0030-unfold-traces-bugs-under-an-administrator-mapped-forge-login.md)).

* A viewer reads and never acts.
* Every step is checked against the person's Teams and recorded in Unfold's crack audit trail.

## Rolling back

* **Before step 5,** going back to the Unfold release before v0.4.0-rc.52 restores the old proxy of Ploeg's cards. Cracks recorded in Unfold after the import exist only in Unfold's store.
* **After step 5,** set Ploeg's `cards.enabled` back to true first, then turn Unfold's publisher off.
* **After step 7,** there is no way back to Ploeg's cards: migration 0044 dropped them. Going back to Unfold v0.4.0-rc.53 is safe, because its import is already marked done.
