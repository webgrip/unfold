import json
import os
import sys
from collections import Counter

import yaml

SEVERITIES = ['critical', 'high', 'medium', 'low']


def budget_for(budgets, image):
    budget = {**(budgets.get('defaults') or {}), **((budgets.get('images') or {}).get(image) or {})}
    if budget.get('mode') not in ('enforce', 'report'):
        raise ValueError(f'the CVE budget of {image} needs mode enforce or report, got {budget.get("mode")!r}')
    return budget


def counted(report):
    seen = {(match['vulnerability']['id'], match['artifact']['name'], match['artifact']['version']): match['vulnerability'].get('severity', '').lower() for match in report.get('matches', [])}
    return Counter(seen.values())


def verdict(budget, found):
    over = {severity: found.get(severity, 0) for severity in SEVERITIES if severity in budget and found.get(severity, 0) > int(budget[severity])}
    return over


def main(report_path, budgets_path, image, reference, output_path):
    with open(budgets_path, encoding='utf-8') as handle:
        budget = budget_for(yaml.safe_load(handle) or {}, image)
    with open(report_path, encoding='utf-8') as handle:
        report = json.load(handle)
    found = counted(report)
    over = verdict(budget, found)
    predicate = {
        'image': image,
        'reference': reference,
        'scanner': {'name': 'grype', 'version': (report.get('descriptor') or {}).get('version', '')},
        'budget': {key: budget[key] for key in ['mode', *SEVERITIES] if key in budget},
        'found': {severity: found.get(severity, 0) for severity in SEVERITIES},
        'suppressedByVex': len(report.get('ignoredMatches', [])),
        'met': not over,
    }
    with open(output_path, 'w', encoding='utf-8') as handle:
        json.dump(predicate, handle, indent=2)
    lines = [f'### CVE budget: {image}', '', '| Severity | Found | Budget |', '| --- | --- | --- |']
    lines += [f'| {severity} | {predicate["found"][severity]} | {budget.get(severity, "none")} |' for severity in SEVERITIES]
    lines += ['', f'{predicate["suppressedByVex"]} finding(s) left out by reviewed OpenVEX statements.', '']
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as handle:
            handle.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    if over and budget['mode'] == 'enforce':
        print(f'::error::{image} is over its CVE budget: ' + ', '.join(f'{count} {severity}' for severity, count in over.items()))
        return 1
    if over:
        print(f'::warning::{image} is over its CVE budget, which only reports: ' + ', '.join(f'{count} {severity}' for severity, count in over.items()))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main(*sys.argv[1:6]))
    except (OSError, ValueError, KeyError, json.JSONDecodeError, yaml.YAMLError) as error:
        print(f'::error::The CVE gate could not reach a verdict: {error}. This is not a pass.')
        sys.exit(2)
