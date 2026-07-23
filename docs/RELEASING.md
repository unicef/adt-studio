# Releasing

ADT Studio builds signed staging artifacts on demand from any open pull request
into `develop`, then publishes beta releases from `develop` and stable releases
from `main`.

## Branch and release flow

```text
open PR into develop  (#123)
        |
        | manually run "Staging" from develop, entering the PR number
        v
merge PR head into develop (fails if it conflicts)
        |
        v
staging/pr-123
version: X.Y.Z-beta-pr-123
        |
        | signed desktop artifacts + pre-release for QA
        v
merge PR -> beta release -> merge to main -> stable release
```

| Branch              | Purpose                          | Version example       |
| ------------------- | -------------------------------- | --------------------- |
| `feature/*`, `fix/*`| Development                      | Existing package version |
| `staging/pr-123`    | Test PR #123 merged into develop | `0.7.5-beta-pr-123`   |
| `develop`           | Beta releases                    | `0.7.5-beta.1`        |
| `main`              | Stable releases                  | `0.7.5`               |

## Staging

[`staging.yml`](../.github/workflows/staging.yml) is triggered manually from
**Actions -> Staging -> Run workflow**. Always run it **from `develop`** (the
default ref) and enter the **pull request number** to stage as the single input.
The workflow is intentionally decoupled from the branch under test: it never
reads `github.ref_name`, so the feature branch does not need to contain the
workflow file or be in sync with `develop`. The version of `staging.yml` that
runs is always develop's.

Staging is opt-in because it signs installers with the production certificates:
it never runs on its own, only a user with write access can dispatch it, and it
validates the target PR before building. The PR must be **open**, must target
**`develop`**, and must **not come from a fork** — otherwise the run fails with a
clear error before any signing happens.

The workflow checks out `develop`, fetches the PR head via
`refs/pull/<n>/head`, merges it into `develop`, and fails with a clear error if
the merge conflicts — surfacing the conflict before any staging branch is
created. The build therefore always reflects the PR as it would land on the
current `develop`.

The slug is the PR number: PR #123 maps to branch `staging/pr-123`. After the
merge, the workflow updates `apps/desktop/package.json` and creates one
staging-only version commit on top:

```text
branch:  staging/pr-123
version: 0.7.5-beta-pr-123
package: apps/desktop/package.json
```

The staging branch is deterministic per PR and force-pushed on every run, so
re-running staging for a PR that already has a staging branch simply rebuilds it
against the current `develop`. The build job then produces signed Windows,
macOS, and Linux installers plus their updater metadata (`beta*.yml`,
`*.blockmap`), retained as workflow artifacts for 14 days.

A final `publish` job creates a GitHub **pre-release** from those artifacts so QA
can install the exact candidate through the in-app beta version browser. The
release body is composed by
[`scripts/compose-release-notes.mjs`](../scripts/compose-release-notes.mjs),
which receives the PR number directly and renders the `### Release source`
section the app parses for provenance — no PR discovery heuristics are needed.

The pre-release is tagged with the version itself — `0.7.5-beta-pr-<n>`, **with
no `v` prefix**. This matters for two reasons:

- The `v*` tag namespace is protected (only the release automation's
  `RELEASE_PAT` may create `v*` tags), and staging runs with the default
  `GITHUB_TOKEN`. A bare, unprefixed tag stays outside that ruleset.
- Version calculation ignores it: `betaNumberOf` only counts numbered
  `beta.N` tags and stable calculation skips any prerelease, so a
  `-beta-pr-<n>` tag never shifts a future release version.

The `publish` job is idempotent per PR: before creating the release it deletes
any existing release (and its tag) ending in `-beta-pr-<n>`, then recreates it
from the current build. Staging does not create a `v*` tag or a Docker image.

> Because the pre-release is a real GitHub Release, every beta-channel install
> sees it in the version browser. Stale staging releases are torn down
> automatically (see below); delete them by hand only if you skip that path.

## Staging cleanup

[`staging-cleanup.yml`](../.github/workflows/staging-cleanup.yml) tears down a
PR's staging footprint automatically when the pull request closes (merged or
not). It keys off the PR number (`pr-<n>`), deletes any pre-release ending in
`-beta-pr-<n>` (with its tag), and deletes the `staging/pr-<n>` branch. The
automatic teardown only fires for PRs whose base is `develop`, mirroring the
staging contract, so closing a same-branch PR that targets another base never
removes the staging build.

The trigger is **`pull_request_target`**, not `pull_request`. A `pull_request`
workflow runs the copy of the file that lives on the PR *head* branch, which
would re-couple cleanup to the branch under test — a stale copy on an old
feature branch would compute the wrong slug and delete the wrong release.
`pull_request_target` always runs `develop`'s copy of this workflow with a write
token, so cleanup behaviour is defined in exactly one place. It never checks out
or executes PR code — it only calls the GitHub API by PR number — so it carries
none of the untrusted-code risk that normally makes `pull_request_target`
dangerous.

Every deletion is idempotent and silent: if the pre-release, tag, or branch is
already gone, the step logs that it is skipping and exits successfully. It never
fails a run because there was nothing left to remove.

It can also be run manually from **Actions -> Staging cleanup -> Run workflow**,
entering the PR number to clean up — useful when a PR has already been deleted
or was closed before the workflow existed.

GitHub requires manually dispatched workflows to exist on the repository's
default branch. Both `staging.yml` and `staging-cleanup.yml` must be present on
`develop`; because staging is always dispatched from `develop`, the branch under
test never needs a copy of either file.

## Version calculation

Version numbers are calculated by
[`scripts/calculate-release-version.mjs`](../scripts/calculate-release-version.mjs)
from the repository tags. The user never types a complete version.

| Selected type | Base                                   | Example when the latest stable is `v0.7.4` |
| ------------- | -------------------------------------- | ------------------------------------------ |
| `major`       | Latest stable tag                      | `v1.0.0`                                   |
| `minor`       | Latest stable tag                      | `v0.8.0`                                   |
| `patch`       | Latest stable tag                      | `v0.7.5`                                   |
| `beta`        | Active beta line, or next stable patch | `v0.7.5-beta.1`                            |
| `beta-minor`  | Active beta line, or next stable minor | `v0.8.0-beta.1`                            |
| `beta-major`  | Active beta line, or next stable major | `v1.0.0-beta.1`                            |

If `v0.7.5-beta.2` already exists and is ahead of the latest stable tag, the
next beta is `v0.7.5-beta.3`. Once `v0.7.5` is stable, the next beta line starts
at `v0.7.6-beta.1`. A beta bump only starts a new line when it lands above the
active one: after `v0.8.0-beta.1`, plain `beta` continues with `v0.8.0-beta.2`,
while `beta-major` starts `v1.0.0-beta.1`.

Staging uses the same next-beta core but substitutes the beta increment with the
PR slug. For example, PR #123 becomes `0.7.5-beta-pr-123`. Staging versions are
never used as release tags.

## Tag protection

Because every future version is derived from the existing `v*` tags, a tag
created by hand — or an accidental `git push --tags` — permanently shifts all
later calculations. **Never create a `v*` tag manually.** The release pipeline
is the only thing that creates them, in the `finalize` job, authenticated with
the `RELEASE_PAT` secret.

The `v*` tag namespace is locked with a repository ruleset so only the release
automation can create, update, or delete those tags. The ruleset is checked in
at [`.github/rulesets/protect-release-tags.json`](../.github/rulesets/protect-release-tags.json)
and blocks creation/update/deletion of `refs/tags/v*` for everyone except the
**Repository admin** role (`actor_id: 5`).

To apply it:

- **UI** — Settings → Rules → Rulesets → **New ruleset → Import a ruleset**,
  select the JSON file, and enable it.
- **API** —
  ```bash
  gh api --method POST repos/unicef/adt-studio/rulesets \
    --input .github/rulesets/protect-release-tags.json
  ```

For the pipeline to keep tagging, the account that owns `RELEASE_PAT` must be
able to bypass the ruleset — keep it a **repository admin** (the bypass actor in
the JSON). If you move release automation to a GitHub App or a non-admin machine
account instead, replace the bypass actor accordingly (e.g. an `Integration`
actor for an App) and re-import.

## Triggering a release

### GitHub UI

Open **Actions -> Release -> Run workflow**, select the release branch, and
choose `beta`, `beta-minor`, `beta-major`, `patch`, `minor`, or `major` from
the **Version increment** list.

The branch contract is enforced:

- `develop` accepts only `beta`, `beta-minor`, or `beta-major`;
- `main` accepts `patch`, `minor`, or `major`.

Releases from `develop` and `main` share one concurrency group, so two runs
never calculate versions from the same tag state.

### Release commit

Automation may alternatively push a commit whose complete subject is a release
type:

```bash
# On develop
git commit --allow-empty -m "RELEASE: beta"
git push origin develop

# On main
git commit --allow-empty -m "RELEASE: patch"
git push origin main
```

`RELEASE: minor` and `RELEASE: major` are also accepted on `main`, and
`RELEASE: beta-minor` and `RELEASE: beta-major` on `develop`. Matching is
case-insensitive, and only the head commit of the push is inspected.

## Release pipeline

[`release.yml`](../.github/workflows/release.yml) has four stages:

1. `prepare` calculates the next version, validates the branch contract, bumps
   `apps/desktop/package.json`, and updates issue-template versions.
2. `desktop` builds and signs installers for Windows, macOS, and Linux.
3. `docker` builds and publishes the combined application image to GHCR.
4. `finalize` commits release metadata, creates the tag, and publishes the
   GitHub Release only after all builds succeed.

Stable Docker releases update both their version tag and `latest`. Beta images
publish only their version tag and cannot overwrite `latest`.

### Beta release provenance

For beta prereleases only, `finalize` generates release notes for the exact
commit built by the desktop and Docker jobs, then appends a machine-readable,
human-friendly final section with this grammar:

```markdown
### Release source

- Branch: `develop`
- Built from: [`<sha>`](https://github.com/unicef/adt-studio/commit/<sha>) <subject>
- Last change: [`<sha>`](https://github.com/unicef/adt-studio/commit/<sha>) <subject>
- PR [#<number>](https://github.com/unicef/adt-studio/pull/<number>) `<head>` → `<base>` by @<author> — <title>
- Compare: [<previous-tag>...<tag>](https://github.com/unicef/adt-studio/compare/<previous-tag>...<tag>)
```

Missing values are omitted. The previous tag must be an ancestor of the build
commit; numbered beta tags are preferred, with an ancestral stable tag as the
fallback. The PR list is capped, while the Compare link covers the complete
range.

Do not edit `### Release source` by hand. It is a parsing contract and must
remain the last section of the release body. Newer apps remove it from the
ordinary release notes and show its fields in the Beta versions source card;
older apps display it as normal Markdown. The updater also strips the HTML form
rendered by GitHub's feed before showing update notes.

If composition or provenance lookup fails, the workflow discards the temporary
file and lets `gh release create --generate-notes` produce the release normally.
Stable releases do not run the composer and retain their existing generated-note
behavior.

## Desktop channels

Beta and stable are separate desktop products and can be installed together.
Any version containing `-beta` uses the beta product identity and updater
channel, including staging versions such as `0.7.5-beta-pr-123`.

| Installed build                | Updater channel | Receives        |
| ------------------------------ | --------------- | --------------- |
| Stable (`X.Y.Z`)               | `latest`        | Stable releases |
| Beta (`X.Y.Z-beta.N`)          | `beta`          | Beta releases   |
| Staging (`X.Y.Z-beta-pr-<n>`)  | `beta`          | Beta releases   |

The version browser accepts numbered beta releases and PR-qualified staging
builds. Staging artifacts themselves are not listed remotely because they are
workflow artifacts rather than GitHub Releases.
