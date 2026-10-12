# SPEC-0013 implementation evidence

> Historical September checkpoint. The implementation and dependency gaps below
> are superseded by the [October continuation evidence](../verification/spec-0013-full-continuation.md)
> and [independent review](../verification/spec-0013-independent-review.md).
> The original findings and executed results are preserved unchanged below.

Implementation before human approval was explicitly authorized on 2026-09-25. The spec remains in-review, with no approvers. No release verification is claimed.

## Baseline and dependency decisions (before implementation)

- develop: `737d331418d13f930955504e8288ee26ec1b20ba`.
- Published #889: `2a5da50a9de1d58c2131ad1132f8bda22d9ba9e5`; documentation parent #888 is not an implementation prerequisite. Local branch rebased directly onto develop; backup `backup/spec-0013-before-implementation-20260925` preserves the original stack. Remote base must change only alongside later authorized publication.
- #712: `92ce4d19213b3406b09775a9c0c9227022a8e34c`, Kemal Sokolovic. Its classifier, diagnostic vocabulary and decision validation are the adaptation starting point. Its malformed-output review regression must stay fixed. The old monolithic client and runner are not copied over current provider ports.
- #879/SPEC-0001 and #880/SPEC-0002 contain documentation only; no shared filtering/output provenance, replacement authorization or freshness planner is implemented. #886 remote is documentation only; its local safe-extraction implementation has shared writer admission but explicitly refuses downstream resume. None provides the complete recovery prerequisite.
- Current stage reruns clear prior state before the runner; existing Meaningfulness writes filtering results without source/config/output version checks. Enabling the old #712 retry loop would violate AC-10. Use the published spec's fallback: unsupported replacement retains data and stops. This delivery must not claim interactive retry or safe whole-book reruns until those dependencies exist.
- Current AI SDK native-schema/json-mode/tool-call paths disable SDK retries. Parse-repair has a hidden two-call loop and multiplies the outer budget. CLI-backed providers run external executables whose internal request counts are not controlled by the facade; their wire budget cannot be claimed verified.

## Acceptance plan

Every criterion is mapped before code changes. The original pre-edit map is retained below; executed results follow it.

| AC | Current behavior / required change | Concrete verification planned |
|---|---|---|
| 1 | Outer bounded loop exists; typed transient classifier absent | Wire counts for DNS/reset/408/429/503; fake timer delay tests |
| 2 | Only local provider configuration errors fast-fail | Structured/nested quota 429, auth, permissions, model tests; one wire request |
| 3 | Unknown and semantic failures retry; malformed parse-repair has hidden loop | Unknown, invalid JSON/schema and feedback tests |
| 4 | Backoff abort exists; per-call signal masks model signal and admission ignores abort | Cancel before call, during rate wait/request/backoff; zero further transport calls |
| 5 | SDK retries disabled except parse-repair hidden round; CLI internals opaque | Real SDK over stub fetch; three calls for maxRetries=2 in each HTTP strategy; CLI limit explicitly unverified |
| 6 | Cache written before validation; schema not checked on disk hits | Real cache directory, corrupted/legacy cache, no failed entry, no unrelated eviction, usage/count evidence |
| 7 | No manual page retry on develop; dependency unavailable | Blocked until shared safe admission/protection integration; do not enable Retry |
| 8 | No Retry action today | Schema/broker reject retry-all without consumption; bounded rounds foundation tested; production page retry blocked |
| 9 | Existing skip keeps in-memory filtering, but upstream cleanup unsafe | Full persistence contract blocked by shared admission/protection; do not claim safe rerun |
| 10 | No output provenance or concurrency recheck; pre-run deletion | Blocked; retain existing unsupported-stage behavior and do not introduce unsafe replacement |
| 11 | Retry rejected by schema; no eligible retry server support | Strict schema + broker/API 400 without consuming; unsupported stages remain ineligible |
| 12 | Broker resolves globally by decision ID, missing book ownership | Bind book/run/step/page, duplicate and cancel API tests |
| 13 | Polling exists; grace only checked before first listener | SSE/poll equivalence, disconnect/reconnect, 30-second grace and ten-minute timeout |
| 14 | Policies keyed by label; restart loses decisions | Run-scoped lifetime, cancellation/new run, fresh broker rejects old IDs; existing persisted interrupted-state behavior audit |
| 15 | Headless default is stop | Existing runner/DAG/CLI failure regressions and shared transport exhaustion |
| 16 | Skip summary only has count; no shared freshness/protection | Durable page IDs can be retained in existing summaries; complete readiness/cardinality contract blocked |
| 17 | Logs have attempts/cache/usage but raw error descriptions and no classification | Additive shared diagnostic fields, bounded safe errors, log persistence and UI tests |
| 18 | Skip/Stop dialog optimistically disappears on submission | Await response, disable duplicates, retain/refetch on failure; all five locales; no Retry advertised without safety prerequisite |

## Contract boundaries

Preserve configured counts, exponential jitter/backoff and timeouts, valid cache identities, source page IDs and content. No new provider, queue, dependency, durable decision database or automatic paid-work restart. Additive diagnostics keep old logs readable. Unknown provider cost remains unknown. Broader editing safety is a prerequisite, not functionality to recreate here.


## Current acceptance evidence (2026-09-26)

**Safe partial implementation; the full spec is not implemented.** Passed entries
refer to the stated exercised scope, not release certification or approval of the
spec. In particular, HTTP wire verification does not prove external CLI request
or billing behavior. Acceptance checkboxes remain unchecked while human review
is pending.

| AC | Status | Executed evidence and remaining scope |
|---|---|---|
| 1 | Passed | `errors.test.ts` covers bounded nested transient classification; `client-retry-integration.test.ts` counts real SDK transport calls for socket/DNS, timeout and HTTP transient failures. `maxRetries: 2` permits three calls. |
| 2 | Passed | Structured/nested quota, auth, permission and model classification tests; permanent HTTP failures stop after one actual transport request, including quota inside 429. |
| 3 | Passed | Unknown errors, malformed JSON/schema/tool output and semantic rejection exhaust the shared budget. Parse repair now returns feedback to that budget; tests observe requests and feedback. |
| 4 | Passed | Tests cancel before admission, during transport, admission wait and backoff, and combine model/per-call signals. No subsequent HTTP request. Runner and broker tests prevent an actionable recovery decision; concurrent-page regressions prove step Stop dismisses sibling decisions and Skip does not reopen admission while another page waits. |
| 5 | Failed in external CLI scope | HTTP native-schema, JSON, tool and parse-repair strategies are tested over the actual SDK with stub fetch; hidden parse-repair multiplication is removed. Real Claude 2.1.260 acceptance now passes seven cases after disabling three internal retry paths, but token truncation sends 12 HTTP requests for a three-attempt budget. Codex now disables HTTP/stream retries, WebSocket fallback and unbounded connection recovery while retaining OpenAI auth. Ten executable cases pass, but an unexpected tool call makes two requests with a budget of one. See the latest CLI follow-up in the review report. |
| 6 | Blocked | Real filesystem cache tests pass for invalid/legacy output, valid hits, eviction, unrelated entries, semantic validation and cache publication failure without another provider call. HTTP usage/cache/control-row diagnostics pass. Review fixes now preserve unknown usage and explain incomplete totals in Studio, including CLI adapters. A measured Claude truncation case still makes 12 wire requests behind three facade attempts; Codex tool continuation makes two requests behind one facade attempt. Complete request/cost accounting is not satisfied. |
| 7 | Blocked | No interactive Retry loop is enabled. Shared non-destructive admission, protected output replacement and input-version rechecks are unavailable. Three-page isolated-retry integration is not run. |
| 8 | Blocked | Automatic rounds are bounded and retry-all is rejected without consumption, but granting a new manual page round is intentionally unavailable under the same safety prerequisite. |
| 9 | Blocked | Real SQLite decision-route tests retain both filtering versions byte-for-byte; this proves decisions do not mutate content, not protected runner Skip behavior. Missing-input downstream blocking and manual-prune preservation across reruns require shared mechanisms. |
| 10 | Blocked | No retry replacement is introduced. Existing pre-run clearing and unguarded Meaningfulness writes prevent a full preservation claim. Concurrent edit, protected output, media/history and failure-during-publication acceptance remain open. |
| 11 | Passed | Actual Hono routes return 400 for ineligible Retry/retry-all, retaining the same pending decision. Retry is unavailable for every stage until safe support exists. |
| 12 | Passed | API tests reject wrong book/run/step/page, strict invalid bodies, stale and cancelled decisions; concurrent duplicate submissions yield one 200 and one 409. Legacy clients may omit additive context: the opaque ID still binds to the URL book and active run. |
| 13 | Passed | Broker fake-time tests exercise initial/subsequent disconnect, reconnect, 30-second grace and ten-minute timeout. API polling matches SSE. Production Studio browser acceptance recovers after reload and removes a decision resolved in a second tab. |
| 14 | Passed at committed decision boundary | Broker lifecycle tests cover run-end/cancel and bulk-policy isolation. `page-error-restart.test.ts` kills a real process with a pending decision and open storage, then uses production startup cleanup and actual decision/status routes in a new process: old ID returns 409, step reports Interrupted, no worker resumes, committed node histories and referenced asset bytes are unchanged. This does not test a crash inside a write transaction; CLI step-run persistence remains outside this evidence. |
| 15 | Passed | Actual compiled CLI on a fresh one-page representative-book fixture exits 1 in 8.7 seconds after the review fixes with no dialog after six stubbed outbound requests: three metadata and three Meaningfulness. Existing DAG/runner failure tests pass. This is not a protected rerun or crash-recovery acceptance. |
| 16 | Blocked | Page-specific skipped-with-error diagnostic records now persist in the existing book log and appear in Studio Debug after reload. Durable qualified run summaries, downstream cardinality and freshness-qualified readiness remain unimplemented. Existing Skip/Stop behavior must not be described as satisfying this criterion. |
| 17 | Passed | Shared additive diagnostics expose request/attempt identity, class, terminal outcome, cache/provider-call flags and available usage. Typed errors do not expose raw provider bodies; Debug tests exclude no-call cancellation rows from provider totals while retaining inspectability. Real CLI SQLite logs show three correlated attempts per work unit. Review regressions retain invalid output while redacting server-resolved credentials, distinguish cancellation, and explain unknown token totals/cost. External CLI accounting limitation remains under AC-6. |
| 18 | Passed | New diagnostic/error labels and existing Skip/Stop dialog are translated in all five locales. Component tests cover accessible alert, duplicate disabling and rejection retention. Production Studio acceptance covers failed submission, refresh, Stop, reload and two tabs; no stage advertises Retry. Future Retry and qualified completion controls remain blocked under AC-7/16. |

Test paths above are under `packages/llm/src/__tests__/`. Decision coverage is in
`apps/api/src/routes/stages-decision.test.ts`,
`apps/api/src/services/page-error-decisions.test.ts`, and
`apps/api/src/services/stage-service.test.ts`; dialog coverage is in
`apps/studio/src/components/pipeline/components/PageErrorDecisionDialog.test.tsx`.
The SQLite tests verify the decision boundary, not a missing recovery transaction.

## Executed checks

| Check | Result |
|---|---|
| Untouched develop baseline: `pnpm test --maxWorkers=2 --testTimeout=30000` | 277 files, 3,604 tests passed before changes. |
| Current default `pnpm test --maxWorkers=2 --testTimeout=30000` | 283 files / 3,690 tests passed; two files / 19 opt-in CLI tests skipped (195.38 seconds). Pretest build passed. Earlier revisions passed 3,688 and 3,684 tests. |
| Real Claude CLI budget acceptance (explicit executable setting) | Seven passed / one failed on Claude 2.1.260: token truncation sends 12 requests against a budget of three. This known failure is not covered by the passing default suite. |
| Real Codex CLI budget acceptance (explicit executable setting) | Ten passed / one failed on 0.155.0-alpha.9.2: an unexpected tool call sends two requests against a budget of one. Auth selection, organization/project headers, transport retries and cancellation pass. |
| Focused retry/cache/classification/decision/Studio tests | 12 files, 257 tests passed during implementation review, including the reproduced concurrency and diagnostic failures. |
| `pnpm typecheck` | Passed. |
| `pnpm lint` | Passed with zero errors and eight unused-suppression warnings, matching a separately exercised untouched-develop baseline. |
| `pnpm --filter @adt/studio extract` and `pnpm --filter @adt/studio exec lingui compile --strict` | Passed after September 26 follow-up; 3,625 messages, zero missing translations in es/fr/pt-BR/sq. English source catalog updated too. |
| `pnpm --filter @adt/studio build` | Production build passed, with chunk-size warning. |
| `node apps/api/scripts/bundle-server.mjs` and `node apps/api/scripts/bundle-electron-server.mjs` | Bundles built; this does not prove packaged Desktop runtime or installer behavior. |
| `docker build --target app -t adt-studio-spec0013:local --progress plain .` | Earlier implementation revision only, not rerun for review fixes: combined release-target image built. Disposable loopback container served `/api/health` with status ok and Studio `/` with HTTP 200. No host books mounted. |
| Production Studio representative-book acceptance | Real built SPA, actual API decision routes/broker and disposable momograde1 copy. Provider execution disabled. Reload recovery, rejection alert, refresh/Stop and two-tab resolution passed without JavaScript errors. Book DB unchanged by decisions after the copy's initial schema migration. Original book untouched. |
| Fresh-book CLI acceptance | Actual compiled CLI, representative PDF first page, all provider traffic intercepted at fetch with 503. Exit 1, six actual transport calls total, one source page and filtering version retained. No credentials/live paid traffic used. |
| Final diff and document checks | `git diff origin/develop --check` passed; spec front matter, all 18 AC IDs, INDEX status/link, local documentation links and absence of conflict markers verified. Final review removed inherited INDEX entries and rebase markers. |
| `pnpm lint:invariants` | Not available in this repository. Added HTTP budget invariant is exercised by the full Vitest suite; no invented aggregate check is claimed. |

Logs and local browser/CLI harnesses are retained under the worktree's
`tmp/acceptance/`; they are local verification artifacts, not application code.
No hosted CI was run for unpublished commits. No signed installer, packaged
Desktop launch, Windows, paid-provider, release/upgrade or complete protected
three-page recovery flow was exercised. The Docker smoke is a development check,
not release verification. Browser verification uses an injected pending decision
with the real API broker: it does not exercise an enabled manual Retry worker.

## Prerequisites and outstanding decisions

- #879/SPEC-0001 inspected head: `375081fc3ba84b185861c7977623ae2d589eb34a`;
  #880/SPEC-0002 inspected head: `5eeaab68665f594f828dcf448b30e52dc109ba7a`.
  Both remain proposed documents. The inspected #886 local safe-extraction work
  has shared writer admission but refuses downstream resume; importing it alone
  would not make Meaningfulness retry safe.
- Integrate implemented and tested shared admission, source/config/filter/output
  version checks, manual/unknown-origin protection, non-destructive cleanup and
  qualified freshness before enabling page Retry. This is a dependency gap, not
  a request to ratify destructive behavior. Existing unsafe rerun paths are not
  repaired or represented as safe by this PR.
- Full provider-wire guarantees require a controllable/testable boundary for
  external CLI providers. If their executables cannot expose that boundary,
  explicitly review a spec amendment defining their supported guarantee; the
  current acceptance criterion has not been silently weakened.
- Product review of retained-result Skip/readiness semantics remains pending,
  as does human approval of the specification. No approvers were fabricated.
- The local branch contains only this spec and its implementation over develop,
  preserving its INDEX entry. The remote PR still has its original documentation
  head/base because pushing is prohibited. Retarget to develop alongside a later
  authorized publication; changing only its base now would expose unrelated
  inherited stack content. The original remote stack is recoverable from the
  backup ref above. PR #712 is unchanged and remains attributed as the starting
  point for classification, HTTP-budget tests and decision/UI adaptation.


## Additional confidence pass (2026-09-25)

The follow-up audit added ten transport cases using actual SDK adapters with
stubbed fetch. Anthropic and Google now each demonstrate bounded transient
exhaustion, permanent fast-fail and invalid-output repair followed by success
with correct accumulated usage. Additional tests observe the next request's
actual timing for normal and excessive Retry-After values (66-second ceiling),
reject a late successful response after cancellation without publishing cache,
and isolate budgets/log identities for concurrent successful and failing pages.

A new UI regression failed against the previous implementation: when another
tab resolves the current decision and polling advances, the original POST's
late rejection cleared the next decision's busy state and displayed the wrong
error. The dialog now mounts submission state by decision ID. The test proves
that a late rejection cannot unlock the next pending submission or inject its
error. No copy or recovery eligibility changed.

A separate process test exercises SIGKILL at the committed failure-decision
boundary, then production startup cleanup, real SQLite and real Hono routes.
It verifies interrupted status, stale-decision rejection, no automatic worker
invocation and unchanged committed node histories/media. This strengthens
AC-14 for that boundary; protected retry/publication and crashes during an
incomplete transaction remain unverified. No claim about all crash positions
or opaque external-provider executables follows from this test.


Follow-up verification: all 3,673 tests in 282 files passed, including the 12
added cases. Focused checks passed 37 provider/dialog tests plus the separate
process-restart test. `pnpm typecheck`, `pnpm lint` (same eight existing warnings),
Studio production build, Lingui extraction and strict compilation passed.
No new messages were introduced; all five catalogs remain complete. Rebuilt
Studio browser acceptance again passed reload/polling recovery, rejected
submission, refresh/Stop and two-tab resolution with no JavaScript errors and
unchanged fixture book data. The initial failing UI regression and all follow-up
logs are retained in `tmp/acceptance/`. No Docker/installer rerun or release
verification is claimed for this UI-only runtime fix.


## Implementation review and remediation (2026-09-25)

The [review report](SPEC-0013-review.md) records severity-ranked findings, fixes,
verification and the remaining implementation/dependency gaps. The new runner
regressions reproduced premature admission after Skip and sibling decisions
remaining pending after Stop; both are fixed using the existing gate and broker.
The review also corrected missing/invalid usage accounting, invalid-output
inspection, server-credential redaction, CLI validation feedback and wrapped
timeout/cancellation classification. Unknown usage now remains unknown through
API statistics and the translated Studio view.

Estimated full-contract completion remains approximately 60%; confidence in the
implemented slice is 8/10, not approval of full page recovery. AC-5/6, AC-7–10
and AC-16 remain blocked in full. No criterion or human approval was weakened
to fit the partial implementation.

Review verification: 283 files / 3,684 tests passed in the full suite (627.60
seconds), including pretest build; 12 files / 257 focused tests passed. Typecheck,
lint (the same eight warnings), Studio production build, API/Electron API
bundles, Lingui extraction and strict compile passed. All 3,623 messages are
translated in five locales. Rebuilt browser acceptance passed with an unchanged
fixture DB and no JavaScript errors. Fresh-book CLI acceptance exited 1 in 8.7
seconds after exactly six intercepted requests. No Docker/installer rerun or
release verification is claimed for these fixes. The dependency check was
refreshed through local SPEC-0010 `d8be3223`; it still refuses unsupported
downstream resume. Remediation commits: `382261fb`, `ac311a75`, `310f1fca`.


## Immediate follow-up (2026-09-26)

See the [follow-up investigation](SPEC-0013-review.md#immediate-follow-up-owned-work-and-cli-request-counts-2026-09-26).
Durable per-page Skip diagnostics and three Claude CLI retry controls are now
implemented. The provider request ceiling remains unsatisfied: the opt-in real
Claude acceptance has seven passing cases and one failing token-truncation case
(12 actual HTTP requests against a budget of three). This is a known AC-5
failure, not merely an unavailable check. AC-6 remains incomplete for the same
internal accounting boundary. Codex's working custom-provider experiment has
not been substituted for its unverified production login/provider behavior.
AC-16 has stronger diagnostic evidence but remains blocked in full.

Follow-up verification: `pnpm test --maxWorkers=2 --testTimeout=30000`
passed **283 files / 3,688 tests**, with **one file / eight opt-in CLI tests
skipped**, in 195.59 seconds; its pretest build passed. Running that opt-in CLI
suite separately produced **seven passes and one failure**, as detailed above.
Typecheck, Studio lint (zero errors, eight baseline warnings), production Studio
build, API/Electron API bundles, Lingui extraction and strict compilation passed.
All 3,625 messages are translated in the five locales. The skipped-page Debug
browser check passed, including reload persistence and no script errors. No
current-head Docker, packaged Desktop, release or paid-provider verification is
claimed.


## Codex transport follow-up (2026-09-26)

The [latest CLI review](SPEC-0013-review.md#cli-transport-hardening-and-remaining-agent-continuations-2026-09-26) supersedes the earlier statement that the Codex adapter is unchanged. Its transport retry and connection-recovery loops are now disabled with OpenAI authentication retained. Ten real Codex cases pass, including synthetic login/key precedence, organization/project headers and cancellation. An unexpected tool call still produces two actual requests with `maxRetries=0`. Claude's twelve-request truncation failure is reconfirmed. AC-5 remains failed in external CLI scope; AC-6 is incomplete.

`pnpm test --maxWorkers=2 --testTimeout=30000`
passed **283 files / 3,690 tests**, with two files / 19 opt-in executable tests
skipped, in 195.38 seconds. Its pretest build passed. `pnpm typecheck`, Studio
lint (zero errors, eight baseline warnings), API and Electron API bundling also
passed. The separate executable suites remain **17 passed / 2 failed**. The
final focused Codex run including unit/login tests was 80 passed / one failed;
that failure is the retained tool-continuation assertion. No Studio strings
changed in this pass, and no new browser, Docker, packaged Desktop, live paid
provider or release verification is claimed.

The first full invocation selected the machine's unaccepted Xcode installation
and failed 22 Git-based script tests. Selecting the installed Command Line
Tools via `DEVELOPER_DIR=/Library/Developer/CommandLineTools` resolved those
failures; the final full result above includes those tests passing. This is not
reported as a passing first run or as an unrelated code regression.

Local implementation commit: `efc49c64`. No push or merge was performed.
