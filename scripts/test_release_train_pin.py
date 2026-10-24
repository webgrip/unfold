import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import release_train_pin  # noqa: E402

REPOSITORY = 'webgrip/unfold'
BOT = 'ploeg-release'


def pull(number, ref, author=BOT, base='development', repository=REPOSITORY, mergeable=True):
    return {'number': number, 'head': {'ref': ref, 'sha': f'sha{number}', 'repo': {'full_name': repository}}, 'base': {'ref': base}, 'user': {'login': author}, 'mergeable': mergeable}


class FakeForge:
    def __init__(self, pulls, answers):
        self.pulls = pulls
        self.answers = answers
        self.merges = []
        self.closed = []

    def open_pulls(self):
        return self.pulls

    def merge(self, number, head):
        self.merges.append((number, head))
        return self.answers.get(number, (405, 'not all required status checks successful'))

    def close(self, number, comment):
        self.closed.append((number, comment))


def run(forge):
    return release_train_pin.merge_newest_green_pin(forge, REPOSITORY, 'development', BOT, log=lambda _: None)


class PinOrdering(unittest.TestCase):
    def test_versions_order_by_semantic_precedence(self):
        versions = ['0.2.0-rc.9', '0.2.0', '0.2.0-rc.10', '0.3.0-rc.1', '0.2.0-beta.2', '0.10.0-rc.1']
        self.assertEqual(sorted(versions, key=release_train_pin.precedence), ['0.2.0-beta.2', '0.2.0-rc.9', '0.2.0-rc.10', '0.2.0', '0.3.0-rc.1', '0.10.0-rc.1'])

    def test_only_the_bots_pin_branches_into_the_base_from_this_repository_count(self):
        pulls = [
            pull(1, 'ploeg/0.2.0-rc.63'),
            pull(2, 'ploeg/0.2.0-rc.64', author='someone'),
            pull(3, 'ploeg/0.2.0-rc.64', base='main'),
            pull(4, 'ploeg/0.2.0-rc.64', repository='someone/unfold'),
            pull(5, 'feat/ploeg/0.2.0-rc.64'),
            pull(6, 'ploeg/by-hand'),
            pull(7, 'ploeg/0.2.0-rc.64'),
        ]
        self.assertEqual([item['number'] for _, item in release_train_pin.pin_pulls(pulls, REPOSITORY, 'development', BOT)], [7, 1])


class MergeNewestGreenPin(unittest.TestCase):
    def test_nothing_waiting_merges_nothing(self):
        forge = FakeForge([pull(2, 'ploeg/0.2.0-rc.64', author='someone')], {})
        self.assertIsNone(run(forge))
        self.assertEqual(forge.merges, [])
        self.assertEqual(forge.closed, [])

    def test_the_newest_green_pin_merges_at_its_checked_head_and_older_pins_close(self):
        forge = FakeForge([pull(10, 'ploeg/0.2.0-rc.9'), pull(12, 'ploeg/0.2.0-rc.10'), pull(11, 'ploeg/0.2.0-rc.8'), pull(13, 'ploeg/0.2.0-rc.11', author='someone')], {12: (200, None)})
        self.assertEqual(run(forge), 12)
        self.assertEqual(forge.merges, [(12, 'sha12')])
        self.assertEqual(forge.closed, [
            (10, 'Superseded by #12 (Ploeg 0.2.0-rc.10), which the release train merged.'),
            (11, 'Superseded by #12 (Ploeg 0.2.0-rc.10), which the release train merged.'),
        ])

    def test_a_newer_pin_that_is_not_green_stays_open_while_an_older_green_one_merges(self):
        forge = FakeForge([pull(20, 'ploeg/0.2.0-rc.64'), pull(19, 'ploeg/0.2.0-rc.63'), pull(18, 'ploeg/0.2.0-rc.62')], {20: (405, 'Not all required status checks successful'), 19: (200, None)})
        self.assertEqual(run(forge), 19)
        self.assertEqual(forge.merges, [(20, 'sha20'), (19, 'sha19')])
        self.assertEqual([number for number, _ in forge.closed], [18])

    def test_a_pin_with_conflicts_is_not_asked_to_merge(self):
        forge = FakeForge([pull(30, 'ploeg/0.2.0-rc.64', mergeable=False), pull(29, 'ploeg/0.2.0-rc.63')], {29: (200, None)})
        self.assertEqual(run(forge), 29)
        self.assertEqual(forge.merges, [(29, 'sha29')])
        self.assertEqual(forge.closed, [])

    def test_no_green_pin_leaves_every_pin_open_and_the_train_unchanged(self):
        forge = FakeForge([pull(40, 'ploeg/0.2.0-rc.64'), pull(39, 'ploeg/0.2.0-rc.63')], {40: (405, 'checks pending'), 39: (409, 'head out of date')})
        self.assertIsNone(run(forge))
        self.assertEqual(forge.merges, [(40, 'sha40'), (39, 'sha39')])
        self.assertEqual(forge.closed, [])

    def test_an_unexpected_answer_fails_instead_of_reading_as_not_green(self):
        for status in (401, 403, 404, 500):
            with self.subTest(status=status):
                forge = FakeForge([pull(50, 'ploeg/0.2.0-rc.64')], {50: (status, 'nope')})
                with self.assertRaisesRegex(release_train_pin.PinMergeError, f'HTTP {status}'):
                    run(forge)
                self.assertEqual(forge.closed, [])

    def test_a_refusal_aimed_at_the_train_itself_fails_instead_of_reading_as_not_green(self):
        for payload in ('{"message":"User not allowed to merge PR"}', '{"message":"Protected branch development requires signed commits but this merge would not be signed"}', '{"message":"merge is not an allowed merge style for this repository"}'):
            with self.subTest(payload=payload):
                forge = FakeForge([pull(60, 'ploeg/0.2.0-rc.64'), pull(59, 'ploeg/0.2.0-rc.63')], {60: (405, payload), 59: (200, None)})
                with self.assertRaisesRegex(release_train_pin.PinMergeError, 'HTTP 405'):
                    run(forge)
                self.assertEqual(forge.merges, [(60, 'sha60')])


class ForgejoClient(unittest.TestCase):
    def setUp(self):
        self.requests = []
        state = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def answer(self, method):
                length = int(self.headers.get('Content-Length') or 0)
                body = json.loads(self.rfile.read(length)) if length else None
                state.requests.append((method, self.path, self.headers.get('Authorization'), body))
                if method == 'GET':
                    page = int(self.path.rsplit('page=', 1)[1])
                    payload = [pull(n, f'ploeg/0.2.0-rc.{n}') for n in range(1, 51)] if page == 1 else [pull(51, 'ploeg/0.2.0-rc.51')]
                    status = 200
                elif self.path.endswith('/merge'):
                    status, payload = 405, {'message': 'Not all required status checks successful'}
                else:
                    status, payload = 201, {}
                data = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                self.answer('GET')

            def do_POST(self):
                self.answer('POST')

            def do_PATCH(self):
                self.answer('PATCH')

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.forge = release_train_pin.Forgejo(f'http://127.0.0.1:{self.server.server_address[1]}/api/v1/repos/{REPOSITORY}/', 'ci-token')

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def test_the_client_pages_open_pulls_and_sends_the_token(self):
        self.assertEqual(len(self.forge.open_pulls()), 51)
        self.assertEqual([path for _, path, _, _ in self.requests], [f'/api/v1/repos/{REPOSITORY}/pulls?state=open&limit=50&page=1', f'/api/v1/repos/{REPOSITORY}/pulls?state=open&limit=50&page=2'])
        self.assertTrue(all(token == 'token ci-token' for _, _, token, _ in self.requests))

    def test_the_client_merges_with_a_merge_commit_at_the_inspected_head_and_reports_a_refusal(self):
        self.assertEqual(self.forge.merge(7, 'abc')[0], 405)
        self.assertEqual(self.requests[-1][1:], (f'/api/v1/repos/{REPOSITORY}/pulls/7/merge', 'token ci-token', {'Do': 'merge', 'head_commit_id': 'abc', 'delete_branch_after_merge': True}))

    def test_the_client_comments_before_it_closes(self):
        self.forge.close(8, 'Superseded by #9.')
        self.assertEqual([(method, path, body) for method, path, _, body in self.requests], [
            ('POST', f'/api/v1/repos/{REPOSITORY}/issues/8/comments', {'body': 'Superseded by #9.'}),
            ('PATCH', f'/api/v1/repos/{REPOSITORY}/pulls/8', {'state': 'closed'}),
        ])


if __name__ == '__main__':
    unittest.main()
