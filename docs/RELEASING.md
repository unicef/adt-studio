# Releasing

ADT Studio builds signed staging artifacts for mergeable PRs targeting
`develop` that carry the `staging` label, then publishes beta releases from
`develop` and stable releases from `main`.

## Branch and release flow

```text
feature/* or fix/*
        |
        | PR to develop
        v
CI: unit tests + typecheck + i18n + Docker
        |
        | all checks pass, the PR has no conflicts,
        | and the PR carries the `staging` label
        v
staging/pr-<pr>-<merge-hash>
version: X.Y.Z-beta-<pr>
        |
        | signed desktop artifacts for QA
        v
merge PR to develop -> beta release -> merge to main -> stable release
```

| Branch                    | Purpose                        | Version example          |
| ------------------------- | ------------------------------ | ------------------------ |
| `feature/*`, `fix/*`      | Development                    | Existing package version |
| `staging/pr-123-a1b2c3d4` | Test the exact candidate merge | `0.7.5-beta-123`         |
| `develop`                 | Beta releases                  | `0.7.5-beta.1`           |
| `main`                    | Stable releases                | `0.7.5`                  |

## PR staging

[`create-staging.yml`](../.github/workflows/create-staging.yml) observes the
completed [CI](../.github/workflows/ci.yml) run and continues only when:

- the PR targets `develop`;
- the PR is not a draft;
- its source branch belongs to this repository;
- the PR carries the `staging` label;
- the `test`, `i18n`, and `docker` jobs all succeeded.

Staging is opt-in because it signs installers with the production
certificates. Add the `staging` label to a PR that needs QA artifacts; if CI
already finished, re-run the CI workflow (or push a commit) so the staging
listener fires again.

GitHub creates a temporary merge commit for a mergeable PR. CI records and
tests that commit, and the staging branch is created from that exact SHA, so the
build contains the PR already merged with the current `develop`. The staging
workflow also confirms that the PR merge ref still points to the recorded SHA.
A conflicting PR does not receive a merge commit and therefore cannot reach
this job.

Before creating staging, CI also checks that the PR head has not changed while
the jobs were running. Commits that only touch the translation catalogs under
`apps/studio/src/locales/` — such as the auto-translate commit CI itself pushes
— are tolerated, and staging continues from the current merge commit. Any other
change stops staging until a CI run succeeds for the current head and base
commits. If GitHub has not reported the PR's mergeability by the time the
listener runs, the workflow fails visibly and can be re-run.

The branch name includes the PR number and the first eight characters of the
tested merge SHA. After checking out that merge, the workflow updates
`apps/desktop/package.json` and creates one staging-only version commit on top:

```text
branch:  staging/pr-123-a1b2c3d4
version: 0.7.5-beta-123
package: apps/desktop/package.json
```

After pushing the branch, CI explicitly dispatches
[`staging-build.yml`](../.github/workflows/staging-build.yml). That workflow
validates that the version and `package.json` contain the PR number and that the
parent of the version commit is the tested merge hash. It then produces signed
Windows, macOS, and Linux installers. Artifacts are retained for 14 days.
Staging does not create a tag, GitHub Release, or Docker image.

GitHub requires both `workflow_run` listeners and manually dispatched workflows
to exist on the repository's default branch. When this feature is deployed for
the first time, `create-staging.yml` and `staging-build.yml` must therefore be
promoted to the default branch before PR staging can run.

Old staging branches can be deleted after the PR is merged or closed.

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
PR number. For example, PR 123 becomes `0.7.5-beta-123`. Staging versions are
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
channel, including staging versions such as `0.7.5-beta-123`.

| Installed build             | Updater channel | Receives        |
| --------------------------- | --------------- | --------------- |
| Stable (`X.Y.Z`)            | `latest`        | Stable releases |
| Beta (`X.Y.Z-beta.N`)       | `beta`          | Beta releases   |
| Staging (`X.Y.Z-beta-<pr>`) | `beta`          | Beta releases   |

The version browser accepts numbered beta releases and PR-qualified staging
builds. Staging artifacts themselves are not listed remotely because they are
workflow artifacts rather than GitHub Releases.
