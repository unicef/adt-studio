# Finding — Connectivity feedback (issue #934, branch exp/934-connectivity-feedback)

**Question:** can OS hints and shared error presentation explain offline failures
without blocking cached/local AI work or changing page decisions?
**Time box:** 2026-10-12 → 2026-10-12 (one local implementation session).
**Demo:** unsigned Windows build at
`apps/desktop/release/win-unpacked/ADT-Studio-Beta.exe`.

## What we tried

- Electron `net.isOnline()` initialization and browser online/offline events,
  a non-blocking offline hint and a deduplicated restoration toast. No probes.
- `networkMode: "always"` for local API queries and mutations, preserving retry
  settings and avoiding connectivity-held local mutations.
- Nested transport classification and credential redaction before the API's
  generic 500 response, additive error fields on asynchronous events and shared
  localized error presentation with collapsed Technical details.
- Friendly page/run, quiz/style-guide and asynchronous AI feedback. Page decision
  actions and pipeline execution/versioning/cache behavior remain unchanged.
- Updater errors retain check/download context, known availability and download
  targets. Download retries do not check again, including beta releases. A failed
  beta selection cannot silently download the previously available release.
- Offline guards apply only to updater network actions and Codex sign-in; local
  actions, pipeline/AI controls and already downloaded installation stay usable.

## What we learned

- 40 tests passed across nine selected suites, covering classifier/HTTP and async
  feedback, page-decision regressions, stage-service/event-bus regressions,
  local API query/mutation execution, hint lifecycle, guards, provider UI and
  updater/beta retry behavior. Run the four new test areas plus existing suites:

  ```powershell
  pnpm exec vitest run apps/api/src/services/connection-errors.test.ts apps/desktop/src/main/services/auto-updater-connectivity.test.ts apps/studio/src/components/ConnectionError.test.tsx apps/studio/src/lib/query-client.test.ts apps/studio/src/hooks/use-beta-update-versions.test.tsx apps/api/src/services/page-error-decisions.test.ts apps/api/src/services/book-event-bus.test.ts apps/api/src/services/stage-service.test.ts apps/studio/src/components/app/screens/settings/providers/ProvidersList.test.tsx
  ```

- `pnpm typecheck` and `pnpm --filter @adt/desktop typecheck:node` passed.
- Studio lint passed with eight existing unused-suppression warnings.
- Locale extraction reported zero missing translations in all supported locales;
  `pnpm --filter @adt/studio compile --strict` passed.
- Studio and Electron builds passed. Default `build:unpack` requires `AZ_TOKEN`
  for signing; local packaging succeeded with signing disabled for this invocation.
  Release signing configuration was not changed.
- A Node-mode check using the packaged executable resolved all 23 non-Electron
  literal main-process module imports. `electron-updater` is bundled into the
  main entry; it is not expected as a separate runtime package. This check does
  not exercise the GUI or real update requests.

  To rebuild the local unsigned copy from the repository root:

  ```powershell
  pnpm --filter @adt/desktop build
  Push-Location apps/desktop
  node node_modules/electron-builder/cli.js --dir --config.win.signAndEditExecutable=false
  Pop-Location
  ```

**Not verified:** the full monorepo test suite, real connection interruption in a
running packaged app, real stable/beta downloads, OS-specific accessibility and
cached reruns/Ollama against a fixture book. Mocked updater tests do not substitute
for release verification. No acceptance criterion is marked complete.

## Manual test checklist

For a false positive without disconnecting the computer, run `pnpm dev` and open
`http://localhost:5173/?connectivityTest=1`. The development-only test toolbar
offers Simulate offline and Restore connection. Restart `pnpm dev` after this
revision: the dev launcher enables `ADT_CONNECTIVITY_TEST=1` in the API process.
The offline override now injects ENOTFOUND into external HTTP calls made by the
API, aborting active calls and streamed response bodies as well as rejecting new
calls. Start an uncached cloud-provider operation, then click Simulate offline
while it runs to exercise the real failure-handling path. Cached reruns and
localhost/private-network providers remain available; CLI subprocesses and the
Electron updater's separate network process are not intercepted by this test.
Restore removes the backend fault and returns the hint to the latest real
OS/browser state, without replaying operations. The override survives a browser
refresh and resets on API restart. These controls/routes are absent from default
production operation and from the previously generated executable.

The revised injection checks cover external rejection, local/private-network
bypass, interruption before headers and during body streaming, restoration,
route validation and the production guard. They complement the earlier checks;
they do not constitute a real physical network-interruption test.

1. Open the unsigned executable with internet disconnected. Confirm the offline
   hint, accessible local books and disabled update check/Codex sign-in controls.
   Confirm pipeline and AI controls retain their normal enabled conditions.
2. With a fixture book and internet disconnected, run a cached operation and a
   configured local provider. Confirm they still work through the reachable API.
3. Generate a quiz or style-guide using an online provider while disconnected,
   or disconnect during generation. Expect a friendly connection explanation,
   collapsed Technical details and preserved selections. Reconnect and retry
   explicitly using Try again.
4. Interrupt an online per-page pipeline operation. Expect friendly page error
   presentation with the existing Skip/Stop decisions. Interrupt a book-level
   operation; inspect the run toast's Technical details and use the existing
   run/re-run control after reconnecting.
5. Interrupt an update check. About must not claim Up to date after failure.
   If an update was previously known, its version and availability must remain.
6. Interrupt a download. Expect a download failure message; Try again must
   download the same stable/beta target without checking again. Installation
   of an already downloaded update must remain available offline.
7. Reconnect. The hint clears and one Back online toast appears. No generation,
   mutation, failed update check or download starts merely because of restoration.

## Recommendation

Continue non-author human review of [SPEC-0017](../specs/SPEC-0017-connectivity-handling.md)
using the local test results. Keep this implementation experimental; split future
production implementation into reviewable slices after spec approval. Do not
merge the experiment as an implementation PR.
