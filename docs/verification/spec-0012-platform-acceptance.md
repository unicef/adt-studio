# SPEC-0012 packaged platform acceptance

Verified 2026-10-12 against the reviewed implementation, using **copies** of the
final representative-book fixture from `spec-0012-acceptance.mjs` (run 5).
The source books were not opened for writes. The probes require new destinations
and compare source/copy hashes before starting.

## Results

Both the macOS Electron utility-process API and Docker `app` image passed:

- Atomic Storyboard Save patches compatible activity text, preserving all other
  HTML bytes, generated control identities, answer mappings and escaping.
- Repeating the identical Save creates no additional source/rendering version.
- A Sectioning-only structural edit commits with persistent drift and leaves the
  saved activity rendering intact. Repeated GET and restart retain the same
  content, versions and authoritative drift.
- Genuine fixed-layout semantic Save retains positioned rendering and existing
  packaged output bytes. Its persistent limitation offers no semantic repair.
- The unrelated legacy page remains unchanged; all 43 media hashes are unchanged.
- Resource writes are rejected; packaged resources retain their original hashes.

Desktop: built and unpacked macOS arm64 resources, then exercised the production
Desktop adapter and bundled API in an actual **Electron 41.2.0 host**, including
utility-process shutdown/restart. All 2,399 resource-file hashes were unchanged.
The packaged Studio renderer index was readable. The unpacked package targets
Electron 41.1.1; this harness uses the workspace's installed Electron host and
selects the packaged resource adapter, following the existing SPEC-0011 pattern.
This is **not** a signed/notarized installer, full Desktop UI, or release test.

Docker: rebuilt the actual `app` target, exercised nginx/API and recreated the
container with the same disposable books volume. SPA `/` and its referenced
`/assets/index-B_OtGScT.js` returned 200. Read-only prompt/template mounts preserved their hashes; an attempted prompt
write was rejected. Image ID:
`sha256:4edb06fb0d61cb45596296dcd6d7a717f2f1c2b71fd23aacdb7fca8b26731fc2`.
The smoke checks do not make an external model request or certify provider,
signing, updater, installer, or other operating-system behavior.

## Reproduction

From the repository root, choose a stable completed acceptance fixture and a
fresh evidence root. Do not reuse a real Desktop profile. Each smoke output
directory must not already exist.

```sh
SPEC12_EVIDENCE=/absolute/path/to/fresh/platform-evidence
SPEC12_BOOKS=/absolute/path/to/completed/acceptance/books
mkdir -p "$SPEC12_EVIDENCE"
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
pnpm --filter @adt/desktop build
SKIP_NOTARIZE=ALL CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @adt/desktop exec electron-builder --dir --config.directories.output="$SPEC12_EVIDENCE/desktop-unpacked"
pnpm --filter @adt/pipeline exec esbuild ../../scripts/probes/spec-0012-desktop-smoke.ts --bundle --platform=node --external:electron --format=cjs --outfile="$SPEC12_EVIDENCE/desktop-smoke.cjs"
SPEC12_RESOURCES="$SPEC12_EVIDENCE/desktop-unpacked/mac-arm64/ADT-Studio-Beta.app/Contents/Resources"
chmod -R a-w "$SPEC12_RESOURCES"
pnpm --filter @adt/desktop exec electron "$SPEC12_EVIDENCE/desktop-smoke.cjs" "$SPEC12_RESOURCES" "$SPEC12_BOOKS" "$SPEC12_EVIDENCE/desktop-profile"
docker build --target app -t adt-spec0012:review .
node scripts/probes/spec-0012-docker-smoke.mjs adt-spec0012:review "$SPEC12_BOOKS" "$SPEC12_EVIDENCE/docker-smoke"
```

The Desktop build needs registry access for its existing runtime dependency
installer. The first sandboxed attempt failed DNS resolution; the host-access
retry passed. The initial harness needed a correction to hash raw `app.asar`
bytes with Electron archive interception temporarily disabled; the corrected
fresh-profile run passed all assertions. Neither was counted as a passing run.

Executed evidence remains outside the repository at
`../spec-0012-full-evidence/`: `desktop-build-reviewed-host.log`,
`desktop-package-reviewed.log`, `desktop-smoke-reviewed-2.log`,
`desktop-smoke-reviewed-2/report.json`, `docker-build-reviewed.log`,
`docker-smoke-reviewed.log`, and `docker-smoke-reviewed/report.json`.
The reusable probes are committed; generated books, application bundles and
container artifacts are not.
