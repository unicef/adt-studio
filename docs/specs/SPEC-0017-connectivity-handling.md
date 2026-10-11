---
id: SPEC-0017
title: Consistent connectivity detection and recovery
status: draft
owner: "@lucas7maciel"
approvers: []
issues: ["#934"]
prs: []
adr: ""
created: 2026-10-09
updated: 2026-10-10
---

Proposal for [issue #934: Implement global connection status detection and
user-friendly error handling](https://github.com/unicef/adt-studio/issues/934).
Number checked against the local index and all GitHub spec PR titles on
2026-10-10; the previous highest number was SPEC-0016. This draft does not
authorize production implementation or merge of the experiment.

## Problem and evidence

The reported Cloudflare upload failure exposes `ENOTFOUND` and an external
hostname. `apps/studio/src/api/client.ts` forwards API error strings directly;
`apps/api/src/middleware/error-handler.ts` forwards HTTPException messages;
`apps/desktop/src/main/services/auto-updater.ts` emits raw updater error messages.
There is no approved connectivity spec in the local spec index.

## Goals

Provide consistent localized connectivity feedback, restoration detection and
safe retry across online features. Disable controls that initiate internet-dependent
operations while connectivity is unavailable. Preserve offline access to local books.

## Non-goals

Do not automatically repeat mutations, create accounts, publish books or change
entity versions. Resume only where an existing operation supports safe resume.

## Proposed design

Centralize structured network error classification at the process performing
the external request. Inspect error codes and nested causes; do not depend on
matching arbitrary message strings. Distinguish network failures, service
unavailability, authentication errors, cancellation and local API unavailability.
A single-host DNS failure or timeout alone must not assert global internet loss.

Define the transport error contract as Zod schemas in `packages/types`. Expose
sanitized codes through API responses, asynchronous operation events and updater
IPC. Keep diagnostic causes in internal logs with credentials redacted. Translate
codes in Studio rather than sending English display text from the server.

Use a global Studio connectivity component backed by TanStack Query. Browser
online/offline events are hints; successful access to localhost does not prove
internet availability. Connectivity verification must run from the process that
needs internet (API for publishing, Electron for updates). Use bounded requests,
deduplicate probes, apply backoff, and clean up listeners and timers. A successful
external operation can provide restoration evidence. Probe targets, intervals
and privacy implications require review before implementation.

Display one accessible global connection warning and friendly operation-level
messages. Preserve form inputs and completed work. After verified restoration,
announce availability and enable the operation's retry action. Do not replay
mutations automatically; reconcile remote status before retrying an upload that
may already have completed. Existing safe query retry behavior may continue.

### Internet-dependent controls

A single root `ConnectivityProvider`, backed by the existing TanStack Query cache,
supplies connectivity state to the banner and controls. Buttons must not each
start independent probes. The shared `Button` accepts `requiresInternet`; native
buttons and input controls use `useConnectivity` for equivalent behavior.

When offline, affected controls expose native `disabled`, accessible disabled
state where applicable and the localized reason “Internet connection required”.
Existing disabled conditions remain in effect after recovery. Disable only
actions initiating an external request; keep local editing, saving, exports,
cancellation, history navigation and installation of already downloaded updates
available. Verify restoration before re-enabling online actions; never execute
their handlers automatically. An unknown initial result or local API check failure
alone must not assert a global outage or newly block controls. A previously known
offline state remains blocked until successful verification.

The mapped experimental controls are:

| Surface | Controls disabled offline | Local controls preserved |
|---|---|---|
| Pipeline | Run/retry in stage cards and landing views for stages whose `PIPELINE` steps declare `modelDefault`; Save & Re-run | Save, cancel, navigation and standalone exports |
| Book parts | Regenerate summary | Local part import/export and editing |
| Storyboard | Generate/edit images, activities, activity feedback, AI instructions, AI activity re-extraction, layout mirroring, style-guide generation and font analysis | Upload local images/fonts, edit and save content, inspect history |
| Quizzes / Easy Read | Generate quiz and regenerate Easy Read | Manual editing and saving |
| Languages | Generate missing Gemini audio | Inspect existing audio |
| Providers | CLI online sign-in | Local configuration and cancellation/logout |
| Updates | Retry update checks, download and beta install/download controls | Cancel download, close dialog and install an already downloaded update |

Stages and their grouping must remain derived from `PIPELINE`, not from a
separate hardcoded stage list. `modelDefault` is the prototype's conservative
proxy for online processing, not a guarantee that every run needs internet:
cached calls and local providers require a reviewed capability policy before
production rollout. Audit remaining independent controls and alternate keyboard
submission paths as part of feature adapter implementation. Cloudflare/sharing
controls must join this policy when their sources are available.

Alternatives: per-feature patches are smaller individually but duplicate policy
and omit global recovery. A browser-only listener is small but misses loss of
internet in server-side requests. Choose centralized classification with process
adapters. The original 15–25-file estimate is withdrawn: mapping individual
controls across existing screens exceeded it. Split implementation into the
reviewable slices below and size each from its actual diff.

## Impact map

- Shared types: network error and connectivity response/event schemas.
- API: classifier, error handler, connectivity verification and online operation
  adapters, including errors delivered outside ordinary HTTP responses.
- Studio: API client, root connectivity UI, operation retry controls and locales
  `en`, `pt-BR`, `es`, `fr`, `sq`.
- Electron: updater errors, connectivity verification and preload IPC.
- No book schema or storage migration. Preserve the HTTP frontend layer rule,
  entity versioning and credential redaction invariants.
- Cloudflare/sharing integration was not located in tracked application sources
  during preliminary inspection. The working tree includes an untracked
  `apps/publish-service/`; its ownership and intended integration need triage.
- Existing request: #934, assigned to @lucas7maciel. GitHub's REST API was used
  because `gh` is unavailable locally; all 13 matching spec PR titles were
  checked for numbering. Review overlap with draft SPEC-0006 (publishing) before
  implementation. No additional issue or PR was created.

## Acceptance criteria

Each implementation test title must begin with its associated AC tag.

- [ ] AC-1: Detect initial offline state and loss during an online operation.
- [ ] AC-2: Classify nested transport errors consistently; distinguish authentication,
  cancellation, service-specific failure and unverified timeout from global outage.
- [ ] AC-3: Hide technical connection details in HTTP, asynchronous and updater UI
  feedback; preserve credential-safe internal diagnostics.
- [ ] AC-4: Apply this behavior to Cloudflare publishing/account creation, online
  sharing and Auto Update, including interruption during each operation.
- [ ] AC-5: Detect restoration, preserve user inputs and offer safe retry/resume;
  reconcile uncertain remote outcomes and never replay mutations automatically.
- [ ] AC-6: Keep local book operations usable when the local API is reachable but
  internet access is unavailable.
- [ ] AC-7: Translate new user-visible text in all supported locales and pass
  extraction, completeness checks and Studio lint.
- [ ] AC-8: Bound monitoring, deduplicate notices/checks, apply backoff, ignore stale
  probe results and clean up listeners/timers.
- [ ] AC-9: Disable mapped internet-dependent controls offline; re-enable only after
  verification while preserving existing disabled conditions and preventing replay.
- [ ] AC-10: Keep local controls enabled; expose translated disabled reasons and
  prevent alternate keyboard submission from bypassing offline guards.

## Test plan

Rows marked planned are required future tests, not verification already performed.
Existing tests provide partial evidence; no criterion is checked off in this draft.
Network tests use mocked fetch/errors and fake timers. Feature integration tests
must use a fixture book, isolated credentials/accounts and controlled connection
interruption; credentials and book data must not appear in diagnostics.

| AC | Level | Test file | Test title | State |
|----|-------|-----------|------------|-------|
| AC-1 | unit/API | `apps/api/src/services/connectivity.test.ts` | `AC-1: reports unavailable when both bounded probes fail` | Existing; initial UI and mid-operation verification still planned |
| AC-2 | unit | `apps/api/src/services/connectivity.test.ts` | `AC-2: finds a nested DNS failure without requiring technical message matching` | Existing |
| AC-2 | unit | `apps/api/src/services/connectivity.test.ts` | `AC-2: preserves authentication, cancellation and unknown errors` | Existing; timeout/global-outage distinction still planned |
| AC-2 | unit | `apps/api/src/services/connectivity.test.ts` | `AC-2: one reachable host prevents a service-only failure from asserting global outage` | Existing |
| AC-3 | API | `apps/api/src/services/connectivity.test.ts` | `AC-3: API hides nested network details and leaves authentication unchanged` | Existing |
| AC-3 | unit/UI | `apps/studio/src/lib/connectivity.test.ts` | `AC-3: replaces the reported Cloudflare error without exposing endpoint or DNS code` | Existing; async/IPC and credential-safe diagnostics tests still planned |
| AC-4 | integration | `apps/api/src/routes/publishing-connectivity.test.ts` | `AC-4: handles connection loss during Cloudflare publishing and account creation` | Planned; source integration must be located first |
| AC-4 | integration | `apps/api/src/routes/sharing-connectivity.test.ts` | `AC-4: handles connection loss during online sharing` | Planned; source integration must be located first |
| AC-4 | desktop integration | `apps/desktop/src/main/services/auto-updater-connectivity.test.ts` | `AC-4: handles connection loss during update checks and downloads` | Planned; packaged-build manual verification also required |
| AC-5 | UI | `apps/studio/src/components/ConnectivityBanner.test.tsx` | `AC-5: checks restoration without replaying an interrupted operation` | Existing |
| AC-5 | integration | `apps/api/src/routes/publishing-connectivity.test.ts` | `AC-5: reconciles uncertain upload completion before offering retry` | Planned |
| AC-6 | desktop integration | `apps/desktop/src/main/api/connectivity.test.ts` | `AC-6: keeps local books accessible while internet is unavailable` | Planned; local API and fixture book required |
| AC-7 | catalog validation | `apps/studio/src/i18n/connectivity.test.ts` | `AC-7: resolves connection messages in every supported locale` | Planned; extraction/compile/lint already run manually |
| AC-8 | UI | `apps/studio/src/components/ConnectivityBanner.test.tsx` | `AC-8: removes browser listeners on unmount` | Existing |
| AC-8 | API/UI | `apps/api/src/routes/connectivity.test.ts` | `AC-8: deduplicates bounded probes and ignores stale results with backoff` | Planned; fake timers required |
| AC-9 | UI | `apps/studio/src/components/ui/button-connectivity.test.tsx` | `AC-9: disables only online actions offline and restores them after verified recovery` | Existing |
| AC-9 | UI | `apps/studio/src/components/ui/button-connectivity.test.tsx` | `AC-9: blocks immediately on a browser offline event and does not trust online without verification` | Existing |
| AC-10 | UI | `apps/studio/src/components/ui/button-connectivity.test.tsx` | `AC-10: preserves local actions and exposes translated offline reasons without keyboard bypass` | Planned; current AC-9 tests provide partial local-action evidence |

## Experimental implementation evidence

This draft remains unapproved. The experiment on `exp/connectivity-handling`
provides evidence for review, not completion of the acceptance criteria.

- `GET /api/connectivity`: fixed Cloudflare and Microsoft HEAD probes with
  four-second timeouts, five-second server-side caching and concurrent-request
  deduplication. Any response proves reachability; a single failing target does
  not imply global loss. Studio polls every 60 seconds normally and every 10
  seconds after failure, with manual checks and browser event listeners.
- Zod schemas `ConnectivityStatus` and `ConnectivityFailure` live in
  `packages/types/src/connectivity.ts`. The API classifies nested error causes
  before HTTP exceptions and returns a sanitized `network-unavailable` code.
  Studio handles this code and legacy technical messages. Updater and beta
  release feedback currently normalize legacy messages in the renderer.
- `use-connectivity.tsx`, `ConnectivityBanner.tsx` and `ui/button.tsx` share the
  verified connectivity state across explicitly mapped controls. All added UI
  text is translated in `en`, `pt-BR`, `es`, `fr` and `sq`.
- Tests in `apps/api/src/services/connectivity.test.ts`,
  `apps/studio/src/lib/connectivity.test.ts`,
  `apps/studio/src/components/ConnectivityBanner.test.tsx` and
  `apps/studio/src/components/ui/button-connectivity.test.tsx` exercise error
  classification, friendly feedback, recovery, listener cleanup, selective
  disablement and preservation of existing disabled conditions.
- Typecheck, Studio lint, locale extraction/compilation and a Studio production
  build passed during the experiment. Lint reports eight existing suppression
  warnings. No packaged-update download or real Cloudflare interruption was tested.

Still required: process-specific Electron verification and structured IPC codes,
async error adapters, backoff, complete control inventory, Cloudflare/account/
sharing integration, remote outcome reconciliation and safe resumability. Probe
targets can be blocked by firewalls or affected by captive portals; their policy
needs review. These limitations prevent declaring full task acceptance.

## Rollout and verification

After non-author maintainer review and product sign-off, merge the numbered spec
to develop. Implement separately reviewable slices: classification/contracts;
global detection/UI; internet-dependent control mapping; online operation/updater
adapters and recovery. Each PR
links its issue and ACs, stays near the 400 changed-line review budget and records
checks actually run. Run appropriate Vitest suites, `pnpm typecheck`, Studio lint
and extraction; verify desktop behavior on a packaged build. Revert slices in
reverse dependency order; no data migration is required.

## Open questions

The following proposed triage deadline is 2026-10-14 (three working days after
this draft update). Assignment follows the issue's existing owner; these are
blocking decisions, with no assumption that elapsed time supplies approval.

| Question | Owner | Target date | Default if unresolved |
|---|---|---|---|
| Locate the Cloudflare/sharing source used by the reported build and determine whether untracked publishing work belongs to #934 | @lucas7maciel | 2026-10-14 | Keep affected adapters pending and retain draft status |
| Obtain non-author maintainer review and product sign-off; record approvers only after actual approval | @lucas7maciel | 2026-10-14 | Retain draft status; no production merge |
| Approve probe targets, request limits, intervals/backoff and captive-portal policy | @lucas7maciel | 2026-10-14 | Keep experimental parameters provisional |
| Define safe retry/resume and status reconciliation for uncertain remote outcomes | @lucas7maciel | 2026-10-14 | Offer no automatic replay or unsupported resume |
| Define online requirements for cached calls/local providers before extending the `modelDefault` heuristic | @lucas7maciel | 2026-10-14 | Keep control mapping experimental |

Resolve all blocking questions before approval. `approvers`, `prs` and `adr`
remain empty because no approval, spec PR or standing-decision ADR exists yet.
