#!/usr/bin/env python3
"""Operator-invoked export after a verified Sites publication; never deploys."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

PROJECT = 'appgprj_6aa15e229eb8819183ce0683ef0a4d8c'
REMOTE = 'https://github.com/financebhavneetranjeet-cmd/anesthetistoncall.in.git'
STATE = 'tools/sites-sync/state.json'
RESERVED = ('.gitignore', 'GITHUB_EXPORT.md')


def run(*args, cwd=None):
    return subprocess.check_output(args, cwd=cwd, stderr=subprocess.PIPE).decode().strip()


def git(repo, *args):
    return run('git', '-C', str(repo), *args)


def included(name):
    return not (name in RESERVED or name.startswith('tools/sites-sync/')
                or re.fullmatch(r'site-version-\d+\.tar\.gz', name)
                or name.endswith('.tsbuildinfo'))


def tree(repo, commit):
    result = {}
    for row in subprocess.check_output(['git', '-C', str(repo), 'ls-tree', '-rz', commit]).split(b'\0'):
        if not row:
            continue
        meta, raw_name = row.split(b'\t', 1)
        mode, kind, blob = meta.decode().split()
        name = raw_name.decode()
        if included(name):
            if kind != 'blob' or mode not in ('100644', '100755'):
                raise ValueError('Unsupported symlink/submodule: ' + name)
            result[name] = {'mode': mode, 'blob': blob}
    return result


def blob(repo, oid):
    return subprocess.check_output(['git', '-C', str(repo), 'cat-file', 'blob', oid])


def publication(receipt):
    d, v = receipt['deployment'], receipt['version']
    if not (d['project_id'] == v['project_id'] == PROJECT and d['status'] == 'succeeded'
            and d['type'] == 'publish' and d['version_id'] == v['id']
            and v['deployment_id'] == d['id'] and d.get('url')):
        raise ValueError('Receipt must identify one successful publication for this project')
    sha = v['source']['commit_sha']
    if not re.fullmatch('[0-9a-f]{40}', sha) or type(v['version_number']) is not int:
        raise ValueError('Invalid source SHA or version')
    datetime.datetime.fromisoformat(d['updated_at'].replace('Z', '+00:00'))
    return sha, v['version_number'], d['updated_at']


def conflicts(previous, current, incoming):
    # Stop even if incoming happens to match a GitHub edit: no silent reconciliation.
    return sorted(p for p in previous.keys() | incoming.keys()
                  if (p in previous and current.get(p) != previous[p])
                  or (p not in previous and p in current))


def scan(name, data):
    parts = Path(name).parts
    if any(p in ('.git', '.github', '.vercel', 'node_modules', 'dist', '.wrangler', '.sites-runtime')
           or p.startswith('.env') for p in parts):
        raise ValueError('Excluded runtime/automation path requires review: ' + name)
    if re.search(r'\.(pem|key|p12|pfx|sqlite|sqlite3|db|tar|gz|zip)$', name, re.I):
        raise ValueError('Potential credentials/runtime archive: ' + name)
    patterns = [rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
                rb'gh[pousr]_[A-Za-z0-9]{30,}', rb'github_pat_[A-Za-z0-9_]{40,}',
                rb'AKIA[0-9A-Z]{16}',
                rb'(?i)(?:api[_-]?key|auth[_-]?token|client[_-]?secret|password|private[_-]?key)\s*[:=]\s*[\x22\x27][A-Za-z0-9_+/=-]{20,}[\x22\x27]']
    if any(re.search(p, data) for p in patterns):
        raise ValueError('Potential embedded credential; review required: ' + name)


def execute(args):
    repo, source = Path(args.repo).resolve(), Path(args.source).resolve()
    if git(repo, 'remote', 'get-url', 'origin') != REMOTE:
        raise ValueError('Unexpected origin; refusing to push')
    sha, version, date = publication(json.loads(Path(args.receipt).read_text()))
    git(repo, 'fetch', 'origin', 'refs/heads/main:refs/remotes/origin/main')
    base = git(repo, 'rev-parse', 'refs/remotes/origin/main')
    old = json.loads(git(repo, 'show', base + ':' + STATE))
    if old['project_id'] != PROJECT:
        raise ValueError('Unexpected project in sync state')
    incoming, current = tree(source, sha), tree(repo, base)
    collision = conflicts(old['files'], current, incoming)
    if collision:
        raise ValueError('GitHub source changed; reconcile manually: ' + ', '.join(collision))
    if version < old['sites_version']:
        raise ValueError('Refusing older Sites version')
    if version == old['sites_version']:
        if sha != old['sites_commit'] or incoming != old['files']:
            raise ValueError('Previously synced version has inconsistent source')
        print(json.dumps({'status': 'already_synced', 'sites_version': version, 'github_commit': base}))
        return
    # Read only the exact published Git tree, never working-tree files or environment variables.
    data = {p: blob(source, value['blob']) for p, value in incoming.items()}
    for p, contents in data.items():
        scan(p, contents)
    hosting = json.loads(data['.openai/hosting.json'])
    if hosting != json.loads(blob(repo, current['.openai/hosting.json']['blob'])):
        raise ValueError('Hosting configuration changed; explicit review required')
    releases = re.findall(rb'version:\s*"([^"]+)"', data['lib/release.ts'])
    pwa = releases[-1].decode()
    if ('${CACHE_PREFIX}' + pwa).encode() not in data['public/sw.js']:
        raise ValueError('PWA release/cache mismatch')
    # Preserve the existing regression suite; deleted checks require human review.
    checks = sorted(p for p in incoming if re.fullmatch(r'scripts/verify-.*\.mjs', p))
    if not checks or any(p not in incoming for p in old['files']
                         if re.fullmatch(r'scripts/verify-.*\.mjs', p)):
        raise ValueError('Regression checks missing or removed')
    with tempfile.TemporaryDirectory(prefix='sites-export-') as temp:
        checkout = Path(temp) / 'checkout'
        git(repo, 'worktree', 'add', '--detach', str(checkout), base)
        try:
            for p in old['files'].keys() - incoming.keys():
                (checkout / p).unlink()
            for p, contents in data.items():
                target = checkout / p
                # No existing directory symlink may redirect source writes.
                if any(parent.is_symlink() for parent in target.parents):
                    raise ValueError('Symlink in destination path: ' + p)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(contents)
                target.chmod(0o755 if incoming[p]['mode'] == '100755' else 0o644)
            state = {'project_id': PROJECT, 'sites_version': version, 'sites_commit': sha,
                     'pwa_version': pwa, 'deployment_id': json.loads(Path(args.receipt).read_text())['deployment']['id'],
                     'published_at': date, 'files': incoming}
            (checkout / STATE).write_text(json.dumps(state, indent=2, sort_keys=True) + '\n')
            (checkout / 'GITHUB_EXPORT.md').write_text(
                f'# Anesthetist on Call\n\nPublished Sites version {version}, PWA {pwa}.\n\n'
                f'Source: `{sha}`\n\nPublication: {date}\n\n'
                'Website: https://anesthetistoncall.in\n\n'
                'Runtime secrets/data remain in Sites. Export excludes historical archives and build caches.\n'
                'GitHub pushes do not deploy the website. See tools/sites-sync/README.md.\n')
            subprocess.run(['npm', 'run', 'install:ci'], cwd=checkout, check=True)
            for check in checks:
                subprocess.run(['node', check], cwd=checkout, check=True)
            git(checkout, 'add', '-A')
            git(checkout, 'diff', '--cached', '--check')
            # Build tools must not silently alter tracked application source.
            expected = {p: value for p, value in current.items() if p not in old['files']} | incoming
            if tree(checkout, git(checkout, 'write-tree')) != expected:
                raise ValueError('Validated source differs from the published tree')
            message = f'Sync Sites v{version} / PWA {pwa} published {date}\n\nSites-Source: {sha}'
            git(checkout, '-c', 'user.name=Sites source sync', '-c',
                'user.email=sites-sync@users.noreply.github.com', 'commit', '-m', message)
            commit = git(checkout, 'rev-parse', 'HEAD')
            if not args.push:
                print(json.dumps({'status': 'dry_run_passed', 'candidate_commit': commit, 'base': base}))
                return
            # Recheck before recovery creation and before the ordinary fast-forward update.
            if git(repo, 'ls-remote', 'origin', 'refs/heads/main').split()[0] != base:
                raise ValueError('GitHub main advanced during testing; rerun after review')
            recovery = f'recovery/before-sites-v{version}-{base[:12]}'
            git(repo, 'push', 'origin', f'{base}:refs/heads/{recovery}')
            candidate = f'sync/sites-v{version}-{sha[:12]}'
            git(repo, 'push', 'origin', f'{commit}:refs/heads/{candidate}')
            # Never force: a concurrent GitHub commit rejects this push.
            git(repo, 'push', 'origin', f'{commit}:refs/heads/main')
            remote = git(repo, 'ls-remote', 'origin', 'refs/heads/main').split()[0]
            if remote != commit:
                raise ValueError('Remote advanced after push; inspect commit ancestry')
            print(json.dumps({'status': 'synced', 'github_commit': commit,
                              'sites_version': version, 'recovery_branch': recovery}))
        finally:
            git(repo, 'worktree', 'remove', '--force', str(checkout))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default='.')
    parser.add_argument('--source', required=True, help='Trusted local Sites Git repository')
    parser.add_argument('--receipt', required=True, help='Fresh native Sites tool results; see README')
    parser.add_argument('--push', action='store_true', help='Update GitHub; default is dry-run')
    try:
        execute(parser.parse_args())
    except (ValueError, KeyError, subprocess.CalledProcessError) as error:
        # Avoid dumping command output that might contain credential values.
        print(json.dumps({'status': 'failed', 'reason': str(error)}))
        raise SystemExit(1)
