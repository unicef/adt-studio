# SPEC-0013 platform acceptance

Verified 2026-10-12 against production runtime commit `ff07bf60`, including bounded compressed-error
decoding and explicit no-retry guidance. All tests use disposable copies of the SPEC-0012
representative acceptance books. Original books and preserved historical drafts
are not modified. No paid provider request is made.

## Packaged Desktop and Docker

Both environments passed the committed `exercisePackagedRecovery` probe:

- All 20 source pages remain present, with durable qualified Meaningfulness and
  captioning Skip on page 005; these outputs are not current.
- Startup reports interrupted Meaningfulness honestly, no active run or pending
  decision, and performs no automatic restart of paid work.
- API/process/container restart retains the same warning, page data and current versions.
- The complete page 005 read response and all 43 referenced media hashes remain
  unchanged. Packaged resources/read-only prompt and template mounts are retained.

Desktop uses an unpacked macOS-arm64 package (target Electron 41.1.1), the actual
production Desktop API adapter, and workspace Electron 41.2.0 utility-process host.
The bundled API starts, stops and restarts from read-only resources. All 2,399
resource-file hashes remain unchanged. This is not a signed/notarized installer,
full Desktop renderer acceptance, Windows/Linux Desktop or release certification.

Docker builds the actual combined `app` target from a clean Git archive of
`ff07bf60`. Nginx serves the Studio root and
`/assets/index-BMm_nP6x.js`; both return 200. The container is removed/recreated
against the same disposable book volume. Image:
`sha256:b20b4802fbb44eb1c17242bdb8efaa38da90d5b62412e8df901ee78daf4a4952`.
No credentials were explicitly supplied and no provider work was requested. The
Desktop adapter inherits the launching environment; credential isolation is not
a claim of this packaged-runtime probe. Full historical-row preservation is
verified separately by the real SQLite recovery tests.

## Browser and CLI

The Chrome probe uses repository Playwright, the compiled Studio SPA, production
API routes/decision broker and synthetic page decisions. Its fixture runner
refuses provider execution and rejects other HTTP writes. Real runner/SQLite
recovery is covered separately by the pipeline integration tests; the browser
fixture does not pretend to execute paid recovery.

It covers eligible Retry, additional-call explanation, disabled Retry+apply-all,
rejected submission retaining the dialog, refresh and retry, SSE loss/poll recovery,
reload, two tabs resolving one decision, and absent Retry for captioning. Dialog
buttons are checked against panel bounds. Durable caption warnings survive reload;
debug logs expose classification, request identity and no provider call. The book
SQLite bytes are compared before and after browser interaction.

Compiled CLI acceptance is a real Node subprocess over a three-page SQLite book,
with its fetch transport replaced by isolated loopback-equivalent responses. One
page receives 503 three times for maxRetries 2; the process exits 1, never waits for
a dialog and makes zero dependent segmentation/cropping calls. Already successful
siblings and committed data remain. The independent reviewer reran this case.
Archive/import uses the real ZIP and SQLite services and preserves source IDs,
manual filtering history, durable Skip and image bytes.

## Reproduction

Build packages/Studio, then seed a **new** disposable recovery book directory from
the completed SPEC-0012 representative fixture containing `momograde1`:

```sh
node scripts/probes/spec-0013-seed-recovery.mjs /path/to/acceptance/books /new/recovery-books
pnpm exec tsx scripts/probes/spec-0013-browser-fixture.mts /new/recovery-books
# Separate terminal; uses installed Google Chrome on macOS:
node scripts/probes/spec-0013-browser-smoke.mjs /new/recovery-books /new/browser-evidence
```

Use the build/unpack commands in
[SPEC-0012 platform acceptance](spec-0012-platform-acceptance.md), then add
`--recovery` to the existing Desktop/Docker probe calls:

```sh
pnpm --filter @adt/desktop exec electron /path/to/desktop-smoke.cjs \
  /path/to/unpacked/Contents/Resources /new/recovery-books /new/desktop-profile --recovery
node scripts/probes/spec-0012-docker-smoke.mjs adt-spec0013:final \
  /new/recovery-books /new/docker-evidence --recovery
```

The probe dispatch preserves the original SPEC-0012 synchronization checks when
`--recovery` is absent. Never reuse a real Desktop profile or production book.
Logs/screenshots are retained under the implementation worktree's
`tmp/spec0013-oct12/`; committed probes provide reproduction rather than embedding
private book content or machine-specific binary evidence in the PR.
