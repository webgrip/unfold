import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('docs_configuration', Path(__file__).with_name('docs-configuration.py'))
configuration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configuration)

DAEMON = '''package main

import (
\t"os"
\t"time"

\t"example.com/ploeg/pkg/store"
)

func run() error {
\tdb := os.Getenv("PLOEG_DATABASE_URL")
\tif db == "" {
\t\treturn errors.New("PLOEG_DATABASE_URL is required")
\t}
\t_ = envOr("PLOEG_LISTEN", ":8080")
\t_ = durationOr("PLOEG_LEASE_TTL", 60*time.Second)
\t_ = envOr("PLOEG_TARGET_FORGE", store.DefaultForge)
\treturn store.Open()
}

func envOr(key, def string) string {
\tif v := os.Getenv(key); v != "" {
\t\treturn v
\t}
\treturn def
}

func durationOr(key string, def time.Duration) time.Duration {
\tif v := envOr(key, ""); v != "" {
\t\td, _ := time.ParseDuration(v)
\t\treturn d
\t}
\treturn def
}
'''

STORE = '''package store

import "os"

const (
\tDefaultForge = "forgejo"
)

func Open() error {
\tif _, ok := os.LookupEnv("PGSSLMODE"); ok {
\t\treturn nil
\t}
\treturn nil
}
'''

WORKER = '''package main

import (
\t"fmt"
\t"os"
\t"time"
)

const defaultTimeout = 100 * time.Minute

func run() error {
\t_ = requireEnv("PLOEG_TEAM")
\t_ = boundEnv("PLOEG_HARNESS_TIMEOUT", defaultTimeout)
\t_ = envOr("PLOEG_WORKER_ID", os.Getenv("POD_UID"))
\tfor _, key := range []string{"LITELLM_MASTER_KEY", "KUBECONFIG"} {
\t\tif os.Getenv(key) != "" {
\t\t\treturn fmt.Errorf("%s must not be set", key)
\t\t}
\t}
\treturn nil
}

func requireEnv(key string) string {
\tv := os.Getenv(key)
\tif v == "" {
\t\tfmt.Fprintf(os.Stderr, "%s is required", key)
\t\tos.Exit(1)
\t}
\treturn v
}

func envOr(key, def string) string {
\tif v := os.Getenv(key); v != "" {
\t\treturn v
\t}
\treturn def
}

func boundEnv(key string, def time.Duration) time.Duration {
\tif os.Getenv(key) == "" {
\t\treturn def
\t}
\treturn 0
}
'''

WORKER_TEST = '''package main

import "os"

func setup() { _ = os.Getenv("ONLY_IN_TESTS") }
'''

VALUES = '''image:
  repository: example/ploegd
  tag: "" # empty = the chart version

# Plain env for the deployment.
env:
  PLOEG_LISTEN: ":9090"

tracker:
  # tokenSecret: {name: token, key: TOKEN}
  tokenSecret: {}
  # The ClickUp tracker. Ingest and write-backs are
  # independent: either alone degrades.
  clickup:
    url: ""

executor:
  harness:
    name: openhands # adapter name
  teams: []
'''

SCHEMA = {
    'type': 'object',
    'properties': {
        'tracker': {'type': 'object', 'properties': {
            'tokenSecret': {'$ref': '#/definitions/secretRef', 'description': 'Vikunja | token Secret.'},
            'clickup': {'type': ['object', 'null'], 'properties': {'url': {'type': 'string'}}},
        }},
        'executor': {'type': 'object', 'properties': {
            'harness': {'$ref': '#/definitions/harness'},
            'teams': {'type': 'array', 'items': {'type': 'object', 'properties': {
                'name': {'type': 'string'},
                'targetSource': {'enum': ['claim', 'env']},
            }}},
        }},
    },
    'definitions': {
        'harness': {'type': 'object', 'properties': {'name': {'enum': ['openhands', 'exec']}}},
        'secretRef': {'type': 'object', 'properties': {'name': {'type': 'string'}, 'key': {'type': 'string'}}},
    },
}

DESCRIPTIONS = '''env:
  PLOEG_LISTEN: Address ploegd listens on.
  LITELLM_MASTER_KEY:
    ploeg-worker: Controller-only.
helm:
  executor.teams[].name: Team name.
  harness.name: Adapter.
'''


class ConfigurationReference(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        app = self.base / configuration.APP
        files = {
            'go.mod': 'module example.com/ploeg\n\ngo 1.25\n',
            'cmd/ploegd/main.go': DAEMON,
            'cmd/ploeg-worker/main.go': WORKER,
            'cmd/ploeg-worker/main_test.go': WORKER_TEST,
            'pkg/store/store.go': STORE,
            'pkg/unused/unused.go': 'package unused\n\nimport "os"\n\nvar _ = os.Getenv("NOT_COMPILED")\n',
            'ops/helm/ploeg/values.yaml': VALUES,
            'ops/helm/ploeg/values.schema.json': json.dumps(SCHEMA),
            'docs/reference/configuration-descriptions.yaml': DESCRIPTIONS,
        }
        for name, text in files.items():
            (app / name).parent.mkdir(parents=True, exist_ok=True)
            (app / name).write_text(text)
        self.descriptions = app / 'docs/reference/configuration-descriptions.yaml'

    def variables(self):
        return {(entry['name'], entry['binary']): entry for entry in configuration.scan(self.base)}

    def test_scan_follows_helpers_imports_and_loops(self):
        found = self.variables()
        self.assertEqual(found[('PLOEG_DATABASE_URL', 'ploegd')]['default'], 'required')
        self.assertEqual(found[('PLOEG_LISTEN', 'ploegd')]['default'], ':8080')
        self.assertEqual(found[('PLOEG_LEASE_TTL', 'ploegd')]['default'], '60s')
        self.assertEqual(found[('PLOEG_TARGET_FORGE', 'ploegd')]['default'], 'forgejo')
        self.assertEqual(found[('PGSSLMODE', 'ploegd')]['files'], ['apps/ploeg/pkg/store/store.go'])
        self.assertEqual(found[('PLOEG_TEAM', 'ploeg-worker')]['default'], 'required')
        self.assertEqual(found[('PLOEG_HARNESS_TIMEOUT', 'ploeg-worker')]['default'], '100m')
        self.assertEqual(found[('PLOEG_WORKER_ID', 'ploeg-worker')]['default'], '$POD_UID')
        self.assertEqual(found[('POD_UID', 'ploeg-worker')]['default'], '')
        self.assertIn(('LITELLM_MASTER_KEY', 'ploeg-worker'), found)
        self.assertIn(('KUBECONFIG', 'ploeg-worker'), found)
        names = {name for name, _ in found}
        self.assertNotIn('ONLY_IN_TESTS', names)
        self.assertNotIn('NOT_COMPILED', names)
        self.assertNotIn('PGSSLMODE', {name for name, binary in found if binary == 'ploeg-worker'})
        self.assertNotIn('key', names)

    def test_values_comments_skip_commented_examples(self):
        comments = configuration.values_comments(VALUES)
        self.assertEqual(comments['image.tag'], 'empty = the chart version')
        self.assertEqual(comments['env'], 'Plain env for the deployment.')
        self.assertNotIn('tracker.tokenSecret', comments)
        self.assertEqual(comments['tracker.clickup'], 'The ClickUp tracker. Ingest and write-backs are independent: either alone degrades.')
        self.assertEqual(comments['executor.harness.name'], 'adapter name')

    def test_page_lists_variables_values_and_shapes(self):
        page = configuration.render(self.base)
        self.assertIn('mise run docs-configuration', page.split('## Environment variables')[0])
        self.assertIn('Do not edit by hand', page)
        self.assertIn('| `PLOEG_LISTEN` | ploegd | `:8080` | Address ploegd listens on. | [main.go](../../cmd/ploegd/main.go) |', page)
        self.assertIn('| `LITELLM_MASTER_KEY` | ploeg-worker |  | Controller-only. | [main.go](../../cmd/ploeg-worker/main.go) |', page)
        self.assertIn('| `PLOEG_DATABASE_URL` | ploegd | required |  | [main.go](../../cmd/ploegd/main.go) |', page)
        self.assertIn('| `env.PLOEG_LISTEN` |  | `:9090` | Address ploegd listens on. | values.yaml |', page)
        self.assertIn('| `tracker.tokenSecret` | [secretRef](#secretref) | `{}` | Vikunja \\| token Secret. | values.yaml, values.schema.json |', page)
        self.assertIn('| `executor.teams[].name` | string |  | Team name. | values.schema.json |', page)
        self.assertIn('| `executor.teams[].targetSource` | one of `"claim"`, `"env"` |  |  | values.schema.json |', page)
        self.assertIn('| `executor.harness.name` |  | `openhands` | adapter name | values.yaml |', page)
        self.assertNotIn('`executor` |', page)
        self.assertIn('### harness', page)
        self.assertIn('| `name` | one of `"openhands"`, `"exec"` | Adapter. |', page)

    def test_gaps_list_undocumented_entries(self):
        gaps = configuration.gaps(self.base)
        self.assertIn('PLOEG_TEAM (ploeg-worker)', gaps)
        self.assertIn('executor.teams[].targetSource', gaps)
        self.assertIn('secretRef.key', gaps)
        self.assertNotIn('PLOEG_LISTEN (ploegd)', gaps)

    def test_descriptions_must_name_a_read_variable_or_chart_value(self):
        self.assertEqual(configuration.unknown_descriptions(self.base), [])
        self.descriptions.write_text('env:\n  GONE: x\n  PLOEG_LISTEN:\n    ploeg-worker: x\nhelm:\n  missing.key: x\n')
        problems = configuration.unknown_descriptions(self.base)
        self.assertIn('env GONE: no binary reads it', problems)
        self.assertIn('env PLOEG_LISTEN: ploeg-worker does not read it', problems)
        self.assertIn('helm missing.key: not a chart value', problems)


if __name__ == '__main__':
    unittest.main()
