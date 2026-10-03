import json
import re
import sys
from pathlib import Path


FLOORS = Path(__file__).resolve().parent / 'release-floors.json'
IDENTIFIER = r'(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)'
VERSION = re.compile(rf'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-({IDENTIFIER}(?:\.{IDENTIFIER})*))?')


def parse(version):
    """Return (core, prerelease identifiers) for a semantic version without build metadata, or None."""
    match = VERSION.fullmatch(version) if isinstance(version, str) else None
    if not match:
        return None
    return tuple(int(part) for part in match.groups()[:3]), match.group(4).split('.') if match.group(4) else []


def _identifier_order(a, b):
    numeric = (a.isdigit(), b.isdigit())
    if all(numeric):
        return (int(a) > int(b)) - (int(a) < int(b))
    if numeric[0] != numeric[1]:
        return -1 if numeric[0] else 1
    return (a > b) - (a < b)


def compare(left, right):
    """Order two semantic versions by precedence: -1, 0 or 1. Raises ValueError on a malformed version."""
    parsed = [parse(version) for version in (left, right)]
    for version, result in zip((left, right), parsed):
        if result is None:
            raise ValueError(f'Not a semantic version: {version!r}')
    (core_a, pre_a), (core_b, pre_b) = parsed
    if core_a != core_b:
        return (core_a > core_b) - (core_a < core_b)
    if not pre_a or not pre_b:
        return (len(pre_b) > len(pre_a)) - (len(pre_b) < len(pre_a))
    for a, b in zip(pre_a, pre_b):
        order = _identifier_order(a, b)
        if order:
            return order
    return (len(pre_a) > len(pre_b)) - (len(pre_a) < len(pre_b))


def load(path=FLOORS):
    """Read and validate the recorded release floors."""
    floors = json.loads(Path(path).read_text())
    if floors.get('schema_version') != 1 or 'components' not in floors or 'trains' not in floors:
        raise ValueError(f'{path} is not a schema_version 1 release floor record')
    for name, component in floors['components'].items():
        if parse(component.get('floor')) is None or not component.get('tag_prefixes'):
            raise ValueError(f'{path}: component {name} needs a semantic-version floor and tag prefixes')
        for version in component.get('occupied_above_floor', {}):
            if parse(version) is None or compare(version, component['floor']) <= 0:
                raise ValueError(f'{path}: {name} lists {version} as occupied above its floor {component["floor"]}')
    for name, train in floors['trains'].items():
        if not train.get('tag_prefix') or not all(component in floors['components'] for component in train.get('components', [])):
            raise ValueError(f'{path}: train {name} needs a tag prefix and known components')
    return floors


def refuse_occupied(name, version, floors=None, tags=()):
    """Raise unless a new version of a component lies above its floor, outside its withdrawn versions and above every existing tag that carried it."""
    floors = floors or load()
    component = floors['components'].get(name)
    if component is None:
        raise ValueError(f'No release floor is recorded for {name}')
    if parse(version) is None:
        raise ValueError(f'{name.title()} release version {version!r} is not a semantic version')
    if compare(version, component['floor']) <= 0:
        raise ValueError(f'{name.title()} {version} is at or below its release floor {component["floor"]}; every version up to the floor is already published ({floors["evidence"]}).')
    occupied = component.get('occupied_above_floor', {}).get(version)
    if occupied:
        raise ValueError(f'{name.title()} {version} is already occupied and can never be published again: {occupied}')
    for tag in tags:
        prefix = next((candidate for candidate in component['tag_prefixes'] if tag.startswith(candidate)), None)
        existing = tag[len(prefix):] if prefix else None
        if existing and parse(existing) and compare(version, existing) <= 0:
            raise ValueError(f'{name.title()} {version} is at or below the existing tag {tag}; a release never reuses or goes below an existing version.')


def refuse_occupied_train(train, version, floors=None, tags=()):
    """Apply refuse_occupied to every component a release train versions."""
    floors = floors or load()
    definition = floors['trains'].get(train)
    if definition is None:
        raise ValueError(f'No release train {train} is recorded in the release floors')
    for component in definition['components']:
        refuse_occupied(component, version, floors, tags)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: release_floors.py <component> <version>')
    refuse_occupied(sys.argv[1], sys.argv[2])
    print(f'{sys.argv[1]} {sys.argv[2]} is above its recorded release floor')
