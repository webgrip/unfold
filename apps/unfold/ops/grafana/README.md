# Unfold insight dashboards

[`unfold-insight.json`](unfold-insight.json) is the Grafana dashboard for the product events [RFC-0001](../../../../docs/design/rfc-0001-product-events-and-confusion-signals.md) exports from Unfold. It carries the stat panels and tables of the RFC's illustration (`docs/design/img/insight-tables.png`): median time to resolve, tabs per decision, undo rate, regret rate, a per-path table and confusion signals per screen. It shows stat panels and tables rather than time series, because each question has one current value.

## Import

The homelab provisions dashboards; this repository only supplies the JSON for it to import. In Grafana, open **Dashboards → New → Import**, upload the file, and pick the VictoriaLogs datasource the `logsDatasource` template variable asks for. The dashboard uid is `unfold-insight`, so a provisioning job can pin it. Do not provision it from here: production desired state lives in `webgrip/homelab-cluster`.

## Data

The panels read the fields Unfold's insight export writes as log attributes: `event.name`, `screen`, `tenant.id`, `actor`, `work_item.id`, `path`, `count`, `actors` and `day`. The queries are LogsQL against VictoriaLogs and are proposed with RFC-0001; adjust them to the homelab's field mapping when the export first lands. Set `UNFOLD_INSIGHT_EXPORT_LEVEL=events` so the per-event panels have an `actor` to count distinct people with; `aggregate` sends only the daily rollup, which has `count` and `actors` but no actor hash.

## Suppression

Every group with fewer than 5 distinct people is suppressed. The tables do it with a `filterByValue` transformation on the `actors` column, and the stat queries with a `filter actors:>=5` stage. That matches the other DevEx dashboards and keeps a small team's events from identifying a person.
