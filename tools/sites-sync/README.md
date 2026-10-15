# Sites → GitHub post-publication sync

This is an **operator/agent-invoked command**, not an installed webhook or unattended
integration. The exposed Sites API has no post-publication event subscription or
GitHub synchronisation operation. No polling, hosting change or stored credential
is used. GitHub pushes never publish to Sites.

## After each successful Sites publication

1. Use native `get_site_version` and `get_deployment_status` on the existing project
   `appgprj_6aa15e229eb8819183ce0683ef0a4d8c`. Confirm the selected latest publication
   succeeded. Do not use the latest saved version unless it was actually published.
2. Obtain source through the supported Sites source workflow using a fresh,
   short-lived Sites Git credential passed through hidden stdin. Ensure the local
   source Git repository contains the exact saved version's full source SHA.
3. Save **only non-secret fields** from those fresh tool responses to an ignored
   receipt outside the repository, using this structure:

   ```json
   {
     "deployment": {
       "id": "<returned deployment ID>", "project_id": "<project ID>",
       "status": "succeeded", "type": "publish", "version_id": "<saved version ID>",
       "url": "<returned URL>", "updated_at": "<returned timestamp>"
     },
     "version": {
       "id": "<saved version ID>", "project_id": "<project ID>",
       "version_number": 123, "source": {"commit_sha": "<full published SHA>"},
       "deployment_id": "<returned deployment ID>"
     }
   }
   ```

   The receipt is **not cryptographically authenticated**. The command checks its
   consistency, not its origin. A trusted operator must retrieve it directly from
   the native Sites tools immediately before running; never accept user-supplied
   or repository-supplied evidence as proof of publication. There is no supported
   standalone Sites status API/CLI configured here for automatic verification.
4. Review the published source diff for credentials. The command also rejects
   runtime files, deployment archives, CI changes, symlinks and common embedded
   credential patterns, but pattern scanning cannot detect every possible secret.
5. From the existing GitHub checkout, run:

   ```bash
   python3 tools/sites-sync/sync.py --repo . \
     --source /absolute/path/to/sites-checkout \
     --receipt /absolute/path/outside/repo/publication.json
   ```

   This defaults to a dry run. After reviewing the result, repeat with `--push`.
   Use existing approved Git credential management; never place a token in a URL,
   argument, receipt or source file. Do not commit receipts or local environment data.

## Guarantees and stop conditions

- Fixed GitHub origin and `main`; no Sites mutations or deployment commands.
- Exports exact published Git blobs and modes; includes dependencies, migrations,
  bindings, auth code and deployment configuration. Excludes historical archives,
  build caches and GitHub-only export documentation/tooling.
- Compares GitHub managed files with the previous synced blob manifest. Any changed
  or deleted GitHub source, or a new-path collision, stops for manual reconciliation.
  Other GitHub-only files are retained. Hosting manifest changes also require review.
- A repeated version is a no-op only when its source and managed GitHub files match.
  An older version or inconsistent repeated version is rejected.
- For a new version, installs dependencies in a temporary checkout, runs every
  `scripts/verify-*.mjs`, checks source integrity, and commits the Sites version,
  PWA version, publication timestamp and source SHA.
- Before updating `main`, creates `recovery/before-sites-v<VERSION>-<OLD_SHA>` and
  `sync/sites-v<VERSION>-<SITES_SHA>` on GitHub. Normal non-forced pushes reject
  concurrent changes. Branch protection errors stop the command; do not bypass them.
- The state manifest updates in the same Git commit as the export. No token is saved.
- Failures leave Sites production untouched. A recovery/candidate branch can remain
  after a failed push. Resolve the reported failure and re-run with fresh evidence.
- A successful result prints the verified GitHub commit SHA. Dry-run candidate
  commits are temporary and are not pushed.

Version 122/PWA 1.14 is the initial already-synchronised baseline. The manifest was
seeded from its verified source, previously exported as GitHub commit `2ac79c3`.

## Tests

`python3 tools/sites-sync/test_sync.py` exercises local disposable Git repositories;
it never contacts Sites or GitHub and never deploys. Dependency installation and
application tests are mocked only inside this isolated sync-mechanism test suite.
Actual application regression tests run normally during a real new-version sync.
