import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory

root=Path('/Users/ryangrippeling/projects/webgrip/de-vloer')
spec=importlib.util.spec_from_file_location('hook', root/'scripts/techdocs.py')
hook=importlib.util.module_from_spec(spec); spec.loader.exec_module(hook)
base='https://forgejo.webgrip.dev/webgrip/de-vloer'
docs=root/'docs'
sample='[engine](../src/engine.ts#L20)\n`[literal](../src/engine.ts)`\n```md\n[example](../src/engine.ts)\n```\n[guide](operations/demo.md)\n[remote](https://example.org/a)\n[source]: ../src/engine.ts\n[abs](/elsewhere)\n'
rewritten=hook.rewrite_links(sample,docs/'architecture.md',docs,base)
assert '[engine]('+base+'/src/branch/development/src/engine.ts#L20)' in rewritten
assert '`[literal](../src/engine.ts)`' in rewritten
assert '```md\n[example](../src/engine.ts)\n```' in rewritten
assert '[guide](operations/demo.md)' in rewritten
assert '[remote](https://example.org/a)' in rewritten
assert '[source]: '+base+'/src/branch/development/src/engine.ts' in rewritten
assert '[abs](/elsewhere)' in rewritten
assert hook.source_url('../src/runtime/',docs/'architecture.md',docs,base)==base+'/src/branch/development/src/runtime'
assert hook.source_url('../../ploeg/README.md',docs/'architecture.md',docs,base)=='../../ploeg/README.md'
site=Path('/tmp/ploeg-vloer-second-pass.rwW0Ip/site')
index=json.loads((site/'search/search_index.json').read_text())
locations={item['location'].split('#')[0] for item in index['docs']}
assert 'architecture/' in locations
assert 'operations/release/' in locations
assert 'domain/rules/' in locations
assert not any(location.startswith(('adrs/','design/','research/')) for location in locations)
assert 'PRODUCT-DESIGN/' not in locations
assert (site/'research/2026-09-12-documentation-audit/index.html').is_file()
assert (site/'adrs/0002-native-node-and-single-writer-storage/index.html').is_file()
assert base+'/src/branch/development/src/engine.ts' in (site/'architecture/index.html').read_text()
assert not (site/'landscape/explorer.template.html').exists()
print(json.dumps({'checks':18,'result':'pass','searchDocuments':len(locations),'searchEntries':len(index['docs']),'sourceLinks':'resolved to Forgejo','historicalPages':'retained and omitted from local search','limits':'Backstage ingestion and external crawling are not covered'},indent=2))
