# Unfold insight dashboards

[`unfold-insight.json`](unfold-insight.json) is the Grafana dashboard for the product events [RFC-0001](../../../../docs/design/rfc-0001-product-events-and-confusion-signals.md) exports from Unfold. It carries the stat panels and tables of the RFC's illustration (`docs/design/img/insight-tables.png`): median time to resolve, tabs per decision, undo rate, regret rate, a per-path table and confusion signals per screen, plus a table of the daily rollup. It shows stat panels and tables rather than time series, because each question has one current value.

## Import

The homelab provisions dashboards; this repository only supplies the JSON for it to import. In Grafana, open **Dashboards → New → Import**, upload the file, and pick the VictoriaLogs datasource for `logsDatasource`. The dashboard uid is `unfold-insight`, so a provisioning job can pin it. Do not provision it from here: production desired state lives in `webgrip/homelab-cluster`.

## Variables

| Variable | What it does |
| --- | --- |
| `logsDatasource` | The VictoriaLogs datasource. |
| `sink` | How the events reached VictoriaLogs. Alloy's `faro.receiver` stores the attributes as `event_data_*` keys in a logfmt message; an OTLP collector stores them as `attributes.*` fields. Each choice renames them to the same names, so every query works with either sink. |
| `min_people` | The fewest distinct people a cell needs before it is shown. It is a hidden constant, 5 by default. |

## Data

`UNFOLD_INSIGHT_EXPORT_LEVEL=events` fills the Needs-you row: each event carries `actor`, `work_item.id`, `screen`, its catalogue properties and `at_ms`. The median time to resolve is computed from `at_ms`, because Faro events get the time they arrived at VictoriaLogs as `_time`. `aggregate`, the default, sends only finished days to the domain `unfold.insight.daily`, with `count` and `actors` and no actor hash; only the **Events per day** table reads them.

The queries were checked against Alloy 1.20 `faro.receiver`, an OTLP receiver and VictoriaLogs 1.53, using the homelab's `alloy-gateway` pipeline and 7 synthetic people. VictoriaLogs keeps 30 days on the homelab, so the dashboard's window is the last 30 days.

## Suppression

A cell or table row is empty unless at least `min_people` distinct people contributed to it. Each query does this with a `filter people:>=${min_people}` stage after counting distinct actors, the way the other DevEx dashboards do, so a small team's events never identify a person. On an instance with a single user every cell stays empty at the default. Lower `min_people` only where the instance's users have agreed to it.
