---
id: SPEC-0017
title: Consistent connectivity feedback for updates and pipeline
status: draft
owner: "@lucas7maciel"
approvers: []
issues: ["#934"]
prs: []
adr: ""
created: 2026-10-09
updated: 2026-10-12
---

Proposal for [issue #934: Implement global connection status detection and
user-friendly error handling](https://github.com/unicef/adt-studio/issues/934).
Number checked against the local index and all GitHub spec PR titles on
2026-10-10; the previous highest number was SPEC-0016. This draft does not
authorize production implementation or merge of the experiment.

## Problem and evidence

The issue's publishing example motivated consistent connection feedback, but
publishing is handled on its own branch. This proposal targets Auto Update and
pipeline/AI operations on develop:

- `apps/desktop/src/main/services/auto-updater.ts` represents all failures as
  `phase: "error"` with a raw message, without identifying check versus download.
  A failed background check can replace a previously available update.
- `apps/studio/src/components/app/screens/settings/AboutSection.tsx` can show
  "Up to date" after a failed check. In
  `apps/studio/src/components/updates/UpdateStateSurface.tsx`, every error says
  "Couldn't check for updates", exposes `status.message` as the subtitle and
  routes "Try again" to `onCheck`, including download failures.
- The reported pipeline failures expose
  `Cannot connect to API: getaddrinfo ENOTFOUND api.openai.com` in the page-error
  dialog and book-level run-error toast. Quiz and style-guide generation instead
  show "Internal server error". The API error middleware's generic fallback
  discards the distinction needed for friendly connection feedback.
- `apps/studio/src/main.tsx` sets no `networkMode` for queries or mutations.
  Browser offline events can therefore pause requests to the reachable local API
  and defer mutations until the browser becomes online again.

## Goals

Warn and explain: show a non-blocking offline hint, give localized explanations
for connection-related operation failures, preserve inspectable technical details,
keep the local API usable offline and correct updater state/retry behavior.

## Non-goals

- Cloudflare publishing, sharing and account creation are outside this proposal.
- No external connectivity probes, polling, verified restoration checks or
  guarantee that an OS online signal proves access to an external service.
- No blanket disabling of pipeline or AI actions, provider capability policy or
  `modelDefault` heuristic. Cached reruns and local providers must remain usable.
- No automatic replay, retry or resume on restoration, and no change to existing
  provider retry policies or pipeline execution/page-decision semantics.
- Page Retry/Skip/Stop belongs to SPEC-0013
  ([PR #889](https://github.com/unicef/adt-studio/pull/889)); this spec changes
  error presentation only and introduces no "retry all" action.
- No book storage, entity versioning, cache-key or pipeline graph changes.

## Proposed design

### OS connectivity hint and local API

Use Electron `net.isOnline()` for the initial desktop hint, relay it through
preload IPC, and observe renderer online/offline events for subsequent changes.
In the browser, initialize from `navigator.onLine` and observe the same events.
Treat these signals as hints, not proof of external reachability. A DNS failure
or timeout against one provider must not change global connectivity state.

A single root connectivity provider supplies an accessible, localized,
non-blocking offline hint. On an offline-to-online transition, clear the hint
and show one "Back online" toast without initiating an operation. Deduplicate
repeated signals and remove listeners/subscriptions on unmount. Make no external
requests to determine connectivity.

Set `networkMode: "always"` for both queries and mutations targeting the local
ADT API, including overrides that would otherwise pause them. Do not queue a
local API mutation for later execution merely because the OS reports offline.
Preserve existing retry settings; this change does not add automatic retries.
A local API connection failure remains distinct from external internet failure.

### Operation error presentation

Centralize classification at the process making the external request. Inspect
structured codes and nested causes; legacy wrappers may require a narrowly
scoped compatibility adapter. Distinguish connection failures from authentication,
cancellation, service errors and local API unavailability. A service-specific DNS
failure or timeout warrants "Unable to connect to the online service. Check your
connection and try again", rather than claiming confirmed global internet loss.

Define shared transport error fields as Zod schemas in `packages/types` and
carry classification through HTTP responses, asynchronous run/page error events
and updater IPC. Studio translates error codes. Apply the same presentation to
page-error dialogs, book-level run-error toasts, quiz and style-guide generation,
and other single AI actions using these error paths.

Show a friendly translated explanation in the main error surface. Preserve the
raw error under a collapsed, user-opened "Technical details" disclosure; a toast
may link to that disclosure. Keep credential-safe diagnostics in internal logs.
Do not expose DNS codes or endpoints in the primary message, subtitle or toast.
Preserve inputs and completed work. Do not infer a connection failure from every
500 response or label authentication failures as offline.

Book-level "Run again" and failed single AI actions offer user-initiated retry
through their existing execution paths, preserving inputs and ordinary validation.
Restoration never triggers these actions. Page failures keep the same decision
controls and behavior owned by SPEC-0013.

### Updater state and controls

Retain the failed operation (check or download), its diagnostic/classification,
and the update target needed to retry. A failed check must not imply "Up to date";
that claim requires a successful check with no available update. Preserve a
previously available update and its metadata when a background check fails, and
show the failure without replacing known availability with a false result.

A failed check offers a check retry. A failed download says that the download
failed and offers a download retry for the same target, including a selected beta
release, without running a new check. Keep technical details out of the subtitle.
Retry is always user-initiated; no automatic resume is introduced.

Disable offline only update check, update download, beta install actions that
require a download, and Codex CLI sign-in. Apply guards to all entry points,
including keyboard submission, and provide the translated reason "Internet
connection required". An online signal removes only the offline guard; other
existing disabled conditions still apply. Installation of an already downloaded
update, cancel, close, configuration and local editing remain available.

Keep all pipeline and AI buttons enabled subject to their ordinary conditions,
with the offline hint visible. Do not use `modelDefault` or probes to decide
whether these actions can run.

### Alternatives and review decisions

Per-feature error strings cost less initially but duplicate classification and
produce inconsistent feedback. Probe-based verification and broad button guards
add request policy and incorrectly block caches/local providers or networks that
block probe hosts. Choose shared classification/presentation and OS hints with
the narrow updater/sign-in guards above. The previous 15–25-file estimate is
withdrawn; size each implementation slice from its actual diff.

## Impact map

- Shared types: operation error schemas and connectivity/updater IPC contracts.
- API and LLM boundary: classification before generic errors discard causes,
  HTTP and asynchronous pipeline error adapters, quiz/style-guide error paths.
- Studio: local API QueryClient defaults, root hint, shared error presentation,
  existing retry controls, About/update surfaces and supported locales.
- Electron: initial OS hint, preload IPC and updater failure/state handling.
- Preserve the HTTP frontend layer rule, credential redaction and all registered
  entity/cache/pipeline invariants in `docs/INVARIANTS.md`.
- Existing issue: #934. No new issue, number or PR is needed for this revision.

## Acceptance criteria

Each implementation test title must begin with its associated AC tag.

- [ ] AC-1: Initialize the offline hint from OS/browser signals and update it on
  online/offline events, without external probes or blocking the application.
- [ ] AC-2: Classify nested connection failures consistently while preserving
  authentication, cancellation, service and local API failure distinctions;
  service-specific DNS failures/timeouts do not assert a global outage.
- [ ] AC-3: Show friendly localized connection messages in HTTP, asynchronous
  pipeline and updater error surfaces; retain raw errors only under "Technical
  details" and credential-safe logs.
- [ ] AC-4: Cover updater check/download failures, pipeline page-error dialogs,
  book-level run-error toasts, and single AI failures including quiz and style-guide
  generation. Failed checks never imply "Up to date"; background check failures
  preserve known available updates; download failures identify the download.
- [ ] AC-5: Clear the hint and show one "Back online" toast on restoration signals
  without replay/resume. Offer user-initiated check/download, book-level "Run again"
  and single AI retries, preserving inputs and the download target. Page decisions
  remain unchanged; no "retry all" is introduced.
- [ ] AC-6: Use `networkMode: "always"` for local API queries and mutations;
  reachable local book operations execute while offline, without connectivity-held
  mutations executing later on restoration.
- [ ] AC-7: Translate all new text in `en`, `pt-BR`, `es`, `fr` and `sq`; pass
  extraction, catalog completeness checks and Studio lint.
- [ ] AC-8: Deduplicate connectivity hints/restoration notices, clean up event/IPC
  subscriptions and make no monitoring probes or polling requests.
- [ ] AC-9: Guard offline only update checks/downloads, beta actions requiring
  download and Codex CLI sign-in. Remove the guard on online signals while
  preserving existing disabled conditions and preventing keyboard bypass.
- [ ] AC-10: Keep pipeline/AI controls, cached reruns, local providers, local book
  actions and installation of downloaded updates available under their ordinary
  conditions. Explain the narrow offline guards with localized accessible text.

## Test plan

All rows below are planned requirements, not claims of completed verification.
Test paths are proposed; extend existing suites when available. Mock OS/events,
provider failures and updater calls; use a fixture book for integration tests.

| AC | Level | Proposed test area | Required test titles / scenarios |
|----|-------|--------------------|----------------------------------|
| AC-1 | desktop/UI | Connectivity provider and preload | `AC-1: initializes from net.isOnline and follows offline/online events without probes`; browser fallback and non-blocking hint |
| AC-2 | unit/API | Shared classifier and error middleware | `AC-2: classifies nested transport causes without asserting global outage`; auth, cancellation, timeout, service errors and local API refusal |
| AC-3 | API/UI/IPC | Error adapters and shared disclosure | `AC-3: keeps DNS codes and endpoints in Technical details only`; HTTP, async page/run events, updater subtitle/toast and credential redaction |
| AC-4 | desktop/UI | Auto updater, About and UpdateStateSurface | `AC-4: failed check does not show Up to date`; `AC-4: background check failure preserves available update`; `AC-4: download error identifies the failed download` |
| AC-4 | API/UI integration | PageErrorDecisionDialog, run toast, quiz/style-guide routes | `AC-4: explains connection failures in page and book run surfaces`; `AC-4: quiz and style-guide failures retain connection classification` |
| AC-5 | UI | Connectivity provider | `AC-5: restoration clears hint and shows Back online without starting operations` |
| AC-5 | desktop/UI | Updater and AI retry handlers | `AC-5: check retry checks and download retry downloads the same stable or beta target`; `AC-5: Run again and single AI retry preserve inputs and require user action`; `AC-5: page decision actions remain unchanged` |
| AC-6 | QueryClient integration | Local API query/mutation defaults | `AC-6: offline local queries and mutations execute immediately`; `AC-6: restoration does not release connectivity-held local mutations`; exercise explicit overrides |
| AC-7 | catalogs/lint | Studio locales | `AC-7: connection messages resolve in every supported locale`; extraction, completeness and lint commands |
| AC-8 | UI | Connectivity subscriptions | `AC-8: repeated events deduplicate notices and subscriptions are removed on unmount`; assert no probe/polling calls |
| AC-9 | UI | Update/beta controls and Codex sign-in | `AC-9: narrow offline guards block click and keyboard initiation and preserve other disabled conditions on restoration` |
| AC-10 | integration/UI | Pipeline, local providers and downloaded updates | `AC-10: cached reruns and local providers remain usable offline`; `AC-10: local actions and downloaded installation remain enabled and offline guard reasons are accessible` |

Also verify a packaged desktop build with internet disconnected at startup and
during check, download, pipeline and single AI operations. Confirm local books
remain usable, inputs/completed work survive, and restoration starts no retry.
Release verification remains separate from implementation test results.

## Experimental implementation evidence

The earlier experiment used external HEAD probes, polling, verified recovery and
broad `modelDefault`-based control disabling. Those design choices are withdrawn
from this proposal and must not be promoted as its implementation. Historical
experiment tests and successful checks do not prove the revised ACs. No revised
criterion is marked complete, and no production implementation is authorized.

The revised local experiment on `exp/934-connectivity-feedback` is documented in
[the #934 finding and manual test checklist](../experiments/934-connectivity-feedback.md).
Its OS hints, error feedback and updater regression tests are review evidence;
they do not authorize production merge or replace packaged release verification.

## Rollout and verification

After non-author maintainer review and product sign-off, merge the approved spec
to develop. Implement independently reviewable slices: OS hint and local API
network mode; classification/HTTP/async feedback; updater state and retries;
narrow updater/Codex guards. Include relevant translations and AC-tagged tests in
each slice. Keep each PR near the 400 changed-line review budget, link #934 and
its ACs, and record checks actually run. Run appropriate Vitest suites,
`pnpm typecheck`, Studio lint and locale extraction/completeness checks. Verify
a packaged desktop build and record release verification separately. Revert in
reverse dependency order; no data migration is required.

## Future work

Verified restoration checks and supported resumability may be proposed separately.
Retries of failed pages inside a run and grouping page failures into a shared
"connection lost" decision require coordination with SPEC-0013, which owns page
Retry/Skip/Stop and rules out "retry all". They are not Phase 1 acceptance criteria
and this spec does not authorize changing that contract.

## Open questions

No technical scope question remains from the earlier probe/control proposal.
Non-author maintainer review and product sign-off are still required before
approval. Keep `status: draft` and record approvers/PR links only from actual
review evidence; this revision does not infer approval from the supplied comment.
