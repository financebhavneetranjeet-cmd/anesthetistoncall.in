import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sync', Path(__file__).with_name('sync.py'))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source, self.repo, self.remote = [self.root / p for p in ('source', 'repo', 'remote.git')]
        subprocess.run(['git', 'init', '-q', '-b', 'main', str(self.source)], check=True)
        self.write(self.source, '.openai/hosting.json', json.dumps({'project_id': sync.PROJECT, 'd1': 'DB', 'r2': 'BUCKET'}))
        self.write(self.source, 'lib/release.ts', 'export const RELEASES = [{version: "1.14"}];')
        self.write(self.source, 'public/sw.js', 'const CACHE_NAME = `${CACHE_PREFIX}1.14`;')
        self.write(self.source, 'scripts/verify-example.mjs', 'console.log("passed");')
        self.write(self.source, 'app.txt', 'baseline')
        self.commit(self.source, 'initial')
        self.initial = sync.git(self.source, 'rev-parse', 'HEAD')
        subprocess.run(['git', 'clone', '-q', '--bare', str(self.source), str(self.remote)], check=True)
        subprocess.run(['git', 'clone', '-q', str(self.remote), str(self.repo)], check=True)
        self.state = {'project_id': sync.PROJECT, 'sites_version': 122, 'sites_commit': self.initial,
                      'files': sync.tree(self.source, self.initial)}
        self.write(self.repo, sync.STATE, json.dumps(self.state))
        self.commit(self.repo, 'seed state')
        sync.git(self.repo, 'push', 'origin', 'main')
        self.base = sync.git(self.repo, 'rev-parse', 'HEAD')
        self.write(self.source, 'app.txt', 'new published source')
        self.commit(self.source, 'publish')
        self.sha = sync.git(self.source, 'rev-parse', 'HEAD')
        self.receipt = self.root / 'receipt.json'
        self.set_receipt()
        self.args = SimpleNamespace(repo=str(self.repo), source=str(self.source), receipt=str(self.receipt), push=True)
        self.origin_patch = patch.object(sync, 'REMOTE', str(self.remote))
        self.origin_patch.start()

    def tearDown(self):
        self.origin_patch.stop()
        self.temp.cleanup()

    def write(self, root, name, content):
        p = root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)

    def commit(self, repo, message):
        sync.git(repo, 'add', '-A')
        sync.git(repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', message)

    def set_receipt(self, status='succeeded', version=123, sha=None):
        self.receipt.write_text(json.dumps({'deployment': {'project_id': sync.PROJECT, 'status': status,
            'type': 'publish', 'id': 'deployment', 'version_id': 'version', 'url': 'https://example.test',
            'updated_at': '2026-10-15T13:36:25+00:00'}, 'version': {'project_id': sync.PROJECT,
            'id': 'version', 'deployment_id': 'deployment', 'version_number': version,
            'source': {'commit_sha': sha or self.sha}}}))

    def invoke(self, fail=False):
        real_run = subprocess.run
        def commands(*args, **kwargs):
            if args[0][0] not in ('npm', 'node'):
                return real_run(*args, **kwargs)
            if fail:
                raise subprocess.CalledProcessError(1, args[0])
            return subprocess.CompletedProcess(args[0], 0)
        with patch.object(sync.subprocess, 'run', side_effect=commands), contextlib.redirect_stdout(io.StringIO()) as out:
            sync.execute(self.args)
        return json.loads(out.getvalue().splitlines()[-1])

    def head(self):
        return sync.git(self.remote, 'rev-parse', 'main')

    def test_success_recovery_and_duplicate(self):
        result = self.invoke()
        self.assertEqual(result['status'], 'synced')
        self.assertEqual(self.head(), result['github_commit'])
        self.assertEqual(sync.git(self.remote, 'rev-parse', result['recovery_branch']), self.base)
        self.assertEqual(sync.git(self.remote, 'show', 'main:app.txt'), 'new published source')
        self.assertEqual(self.invoke()['status'], 'already_synced')
        self.assertEqual(self.head(), result['github_commit'])

    def test_dry_run_does_not_push(self):
        self.args.push = False
        self.assertEqual(self.invoke()['status'], 'dry_run_passed')
        self.assertEqual(self.head(), self.base)

    def test_failed_publication_rejected(self):
        self.set_receipt(status='failed')
        with self.assertRaises(ValueError): self.invoke()
        self.assertEqual(self.head(), self.base)

    def test_existing_github_edit_stops(self):
        self.write(self.repo, 'app.txt', 'independent GitHub work')
        self.commit(self.repo, 'GitHub edit')
        sync.git(self.repo, 'push', 'origin', 'main')
        before = self.head()
        with self.assertRaisesRegex(ValueError, 'GitHub source changed'): self.invoke()
        self.assertEqual(self.head(), before)

    def test_failed_regressions_stop(self):
        with self.assertRaises(subprocess.CalledProcessError): self.invoke(fail=True)
        self.assertEqual(self.head(), self.base)

    def test_secret_rejected(self):
        with self.assertRaises(ValueError): sync.scan('config.ts', b'api_key="' + b'a' * 32 + b'"')
        with self.assertRaises(ValueError): sync.scan('.env.production', b'anything')

    def test_source_mismatch_rejected(self):
        self.set_receipt(version=122)
        with self.assertRaises(ValueError): self.invoke()

    def test_unrelated_github_file_preserved(self):
        self.write(self.repo, 'CONTRIBUTING.md', 'GitHub-only notes')
        self.commit(self.repo, 'notes')
        sync.git(self.repo, 'push', 'origin', 'main')
        self.invoke()
        self.assertEqual(sync.git(self.remote, 'show', 'main:CONTRIBUTING.md'), 'GitHub-only notes')

    def test_new_path_collision_stops(self):
        self.assertEqual(sync.conflicts({}, {'new': {'blob': 'a'}}, {'new': {'blob': 'b'}}), ['new'])

    def test_concurrent_advance_rejected(self):
        original = sync.git
        advanced = []
        def race(repo, *args):
            if args[:2] == ('ls-remote', 'origin') and not advanced:
                self.write(self.repo, 'CONTRIBUTING.md', 'concurrent')
                self.commit(self.repo, 'concurrent')
                original(self.repo, 'push', 'origin', 'main')
                advanced.append(self.head())
            return original(repo, *args)
        with patch.object(sync, 'git', side_effect=race):
            with self.assertRaisesRegex(ValueError, 'advanced during testing'): self.invoke()
        self.assertEqual(self.head(), advanced[0])


if __name__ == '__main__':
    unittest.main()
