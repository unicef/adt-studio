---
id: SPEC-0013
title: Bounded LLM retries and page-scoped failure recovery
status: in-review
owner: "@ksokolovic"
approvers: []
issues: ["#685"]
prs: []
adr: ""
created: 2026-09-22
updated: 2026-09-22
---

## Decision under review

Known transient provider/transport failures and invalid model output use the configured bounded retry budget. Known permanent failures stop immediately. After Image Meaningfulness exhausts its automatic budget, an interactive run can retry only that failed page, retain its prior result and skip, or stop. Headless execution stops safely without waiting for a person.

[#685](https://github.com/unicef/adt-studio/issues/685) is labeled fast lane, but [PR #712](https://github.com/unicef/adt-studio/pull/712) changes shared retry classification and adds a user decision/API action across 30 files. This warrants a common behavioral contract. The existing PR remains the implementation starting point.

### Coordination with existing specs

[PR #879 / SPEC-0001](https://github.com/unicef/adt-studio/pull/879) and [PR #880 / SPEC-0002](https://github.com/unicef/adt-studio/pull/880) are still proposals. References below describe required interfaces and safety properties, not approval or implementation of those PRs. This spec does not publish or depend on unpublished local revisions of them.

Retained-result recovery requires non-destructive run admission and protection of existing filtering/output state. Those are integration requirements, not a claim that the current freshness/preservation PRs cover every retryable stage or CLI path. Unsupported replacement cases must retain data and stop.

## Problem (with evidence)

The issue reports transient LLM failures and concern about disappearing pages. PR #712 clarifies that the observed behavior was a halted pipeline: Image Meaningfulness already retained its prior result on failure. Do not claim a reproduced deletion bug or silently redefine failure as an instruction to prune a page.

Evidence checked 2026-09-22:

| Source | Observed behavior |
|---|---|
| Develop `7a88965284faebcc0beb2e357a5adda9fbfbda45`, `packages/llm/src/client.ts:208`, `:389–432` | A bounded retry loop, exponential backoff and abort checks already exist. Some provider errors are treated as configuration failures. |
| Same source, `packages/types/src/page-error.ts` | `stop`/`ask` policies and `skip`/`stop` decisions already exist. |
| `apps/api/src/services/page-error-decisions.ts` | Pending decisions are available through events and polling; listener grace is 30 seconds and interactive decision timeout is 10 minutes. |
| PR #712, head `92ce4d19213b3406b09775a9c0c9227022a8e34c` | Proposes error classification, eligible page Retry, retained image filtering, diagnostics and invalid-retry handling. |

The PR's older provider/AI SDK integration must be reconciled with current develop's provider ports; its passing test report is not verification of that integration.

## Goals

- Recover bounded transient failures without restarting successful pages or expanding cost invisibly.
- Preserve source page identity, prior filtering decisions and manual work on retry, skip, stop and cancellation.
- Give Studio actionable, accurate recovery choices and headless callers deterministic failure behavior.
- Make attempts, cache use and final outcomes inspectable without exposing credentials.

## Non-goals

- A new job queue, durable interactive-decision database, unlimited background retries or retries across whole books.
- New provider integration, changing configured retry counts or applying an automatic “retry all failures” policy.
- Proving that all downstream stages implement page Retry; interactive retry support is scoped to Image Meaningfulness in B1.
- Fixing extraction resets from SPEC-0010 or replacing general preservation/freshness contracts.

## Proposed design

### Options

| Option | Relative cost | Decision |
|---|---|---|
| Increase all retry budgets | Small configuration change | Rejected: delays permanent failures and increases spend without safe recovery. |
| Typed bounded classification plus explicit failed-page recovery | Moderate LLM/API/Studio work | Recommended. |
| Persistent distributed retry scheduler | Large new dependency/operational surface | Out of scope. |

### Error classification and one retry budget

Expose a finite classification and retryability result through shared types. Classify from trusted typed provider status/codes and safely bounded nested causes/payloads; use textual heuristics only as a fallback. Handle cyclic/oversized malformed cause chains without hanging or leaking a raw payload.

| Condition | Automatic behavior |
|---|---|
| Temporary DNS (`EAI_AGAIN`), connection/request timeout, reset/closed socket | Retry within budget. |
| Temporary HTTP 429, 408, retryable provider 5xx | Retry within budget; respect provider non-retryable classification where explicit. |
| Structured quota/billing exhaustion, invalid credentials/permissions, unsupported or missing model | Fail immediately, including permanent quota carried by HTTP 429. |
| Invalid JSON/schema or semantic validator rejection | Preserve existing bounded validation-feedback retry behavior. |
| Unknown failure without a known permanent/cancel signal | Preserve bounded retries, labeled unknown; do not silently make all unknowns permanent. |
| User/external cancellation | Stop immediately with no retry or recovery prompt. Distinguish it from an internal request timeout. |

For configured `maxRetries = N`, one automatic round has at most `N + 1` attempts. Audit provider adapter/SDK internal retries so they do not multiply this visible budget. Preserve the existing exponential backoff/jitter and configured timeouts; sleep is abortable. Cancellation during backoff must not send the next request. Honor provider retry delay only within the existing bounded delay policy, not an unbounded server-specified sleep.

An invalid cached model result goes through the existing validator, eviction and feedback path. Failed responses are never cached as successful output. Valid cache hits are identified separately from provider calls; an “attempt” must not be reported as billable when no provider call occurred. Do not clear unrelated cache entries or manufacture a fresh hash just because the user chooses Retry.

### Failed-page state machine

The Image Meaningfulness work unit is the failed source page and its captured inputs. Successful pages remain committed and are not invoked again when another page is retried.

1. Run the page with one bounded automatic round.
2. On success, commit the result under the normal version/protection policy and continue.
3. On exhausted retryable error in `ask` mode, retain the prior page/filter result and create one pending decision with identity, page, step, error class, attempt count and `canRetry`.
4. Retry consumes that pending decision and starts one new bounded round for that page. Another failure creates a new decision; there is no implicit endless loop.
5. Skip consumes the decision, retains existing page/filter data and records an explicit skipped-with-error outcome.
6. Stop ends the run's recovery path and prevents dependent stages from proceeding as successful work.

Known permanent failures can offer Skip/Stop where those existing actions are valid, but must not advertise Retry until inputs/configuration have been corrected through a supported new run. Retry eligibility is computed on the server, not inferred from button presence.

Before a manual retry, verify that its source/filter/config versions still match the paused attempt. Conflicting edits return a conflict and keep the decision available for Stop/Skip or an explicit refreshed run; do not rerun a different page snapshot under the old decision. Shared writer admission must prevent accidental overlap with another mutation of that work unit.

### Skip and content preservation

Skip means “continue with retained input/result and an unresolved error”, never “remove this page”. Preserve every source page ID and the prior `image-filtering` version, including deliberate manual prune decisions. Do not rewrite a previous meaningfulness failure as a successful “all images meaningless” response.

If the prerequisite filtering value is absent/invalid, Skip cannot fabricate it or claim the page is ready. Keep the page in the source set, report missing prerequisites and block dependent work that requires them. Downstream Sectioning/Storyboard may use an existing valid retained filtering result under the normal stale/review policy; their page count may not shrink solely because meaningfulness failed.

Retry success creates a new allowed output version without erasing prior versions. Upstream task cleanup must not delete the data needed for retention before the recovery loop begins. Manual/unknown-origin output still follows SPEC-0002; provider recovery does not grant replacement permission. Concurrency rechecks prevent an old attempt from publishing over newer data.

### API, polling and decision lifetime

Extend the existing strict decision schema with `retry`. Requests carry the pending decision identity and book context. Validate that the decision belongs to that book, run, step and page. A stale/already-consumed/cancelled decision returns 409; an ineligible Retry or Retry combined with `applyToAll` returns 400 and **does not consume** the pending decision.

Retry is always page-scoped. Existing Skip/Stop apply-to-all, when supported, lasts only for the active run; it must not leak into another book or later run. Resolve a decision once, even when two tabs submit simultaneously. Polling returns the same authoritative pending state as SSE, so a missed event or UI reconnect can recover the dialog.

Keep the existing 30-second listener grace and 10-minute interactive timeout unless separately reviewed. Without a listener or decision, fall back to Stop. On cancel/end clear the run's decisions and bulk policy. On process restart, pending in-memory decisions are no longer actionable: surface interrupted/failed execution, retain committed book data and require an explicit new run. Do not persist a fictitious successful decision or resume paid work automatically.

### Headless and UI behavior

CLI/DAG and clients without an interactive decision channel default to `stop`. They use the same bounded classifier and then report failure/nonzero status without a dialog or indefinite wait. Already-running independent page work may finish under the existing concurrency policy; no dependent stage may treat a failed required step as successful.

Studio shows page identity, error category, attempts already made, whether Retry can incur additional calls, and the valid actions. While submitting, disable duplicate actions; keep the dialog after an ineligible/stale request long enough to refresh authoritative state and explain the result. Do not offer “retry all”.

Distinguish successful, failed, cancelled and skipped-with-error counts. If existing step schema stores a completed run after explicit skips, a durable summary must still expose those skipped pages; a plain green completion without qualification is insufficient. A manual skip never changes a page's pruning state or marks its output current. Export/readiness continues to use the shared freshness/protection contract.

Call diagnostics retain request/correlation identity, prompt/model, round/attempt, cache/provider-call status, classification, final outcome and recorded usage where available. Unknown cost stays unknown; it is not zero. Sanitize provider error bodies through the existing logging policy and never show headers/API keys. All new copy and error labels are translated in the five supported locales.

## Impact map

| Area | Expected work / coordination |
|---|---|
| Types/LLM/provider ports | Classification/diagnostic schemas, bounded retry integration, abort behavior and single-budget tests. |
| API | Existing page-error decision service, ownership validation, runner page retry and polled/event state. |
| Studio | Eligible actions, retained dialog/error states, attempt information and qualified completion. |
| Pipeline/CLI | Shared classification; noninteractive stop behavior and truthful outcome reporting. |
| PR #712 | Rebase onto current provider ports; preserve existing behavior rather than importing a parallel legacy client. |
| SPEC-0001/0002/0010 | Retained data, review/protection, safe run admission; no alternate clear/prune policy. |

No new dependency or provider is required. Additive log/decision fields keep old records readable; missing historical classification is unknown, not retroactively successful.

## Acceptance criteria

- [ ] AC-1 Transient DNS/socket/timeouts/408/temporary 429/retryable 5xx follow one configured bounded retry budget.
- [ ] AC-2 Permanent auth/quota/model failures fail immediately, including structured quota exhaustion inside HTTP 429.
- [ ] AC-3 Malformed/semantically invalid output and unknown failures retain bounded retry behavior with appropriate feedback.
- [ ] AC-4 External cancellation during a request or backoff sends no further attempt and creates no Retry dialog.
- [ ] AC-5 Provider/SDK retry layers cannot multiply the visible `N + 1` automatic attempt budget.
- [ ] AC-6 Invalid cached output is evicted/revalidated; valid cache/provider-call counts and costs are reported accurately.
- [ ] AC-7 Retrying one failed Meaningfulness page never reruns successful pages or unrelated stages.
- [ ] AC-8 Each explicit Retry grants one new bounded round; no retry-all or unattended infinite loop exists.
- [ ] AC-9 Skip preserves page IDs and prior filtering versions/manual prune choices; missing prerequisites remain an explicit downstream blocker.
- [ ] AC-10 Failure/stop/cancel retains committed content/history/media; retry success cannot overwrite newer/protected input or output.
- [ ] AC-11 Ineligible Retry and Retry+apply-to-all return 400 without consuming the pending decision.
- [ ] AC-12 Wrong-book/run, stale, duplicate and cancelled decisions cannot control another work unit; valid decisions resolve once.
- [ ] AC-13 Polling recovers missed SSE decisions; listener grace, timeout and disconnect fallback safely stop unresolved work.
- [ ] AC-14 Run end/cancel/restart cannot leak a bulk policy or auto-resume paid work; interrupted state is honest.
- [ ] AC-15 CLI/headless calls stop with failure/nonzero status after exhaustion and do not wait for a user.
- [ ] AC-16 Skipped pages remain visible in downstream page cardinality and durable qualified run summaries; skip is never prune or success-current.
- [ ] AC-17 Diagnostics identify attempts, classification, cache usage and final outcomes without credentials/raw sensitive headers.
- [ ] AC-18 New UI actions/errors are accessible and fully translated; unsupported stages do not advertise page Retry.

## Test plan

| Layer | Criteria | Required fixtures |
|---|---|---|
| Classifier/backoff units | AC-1–4 | Nested/cyclic errors, structured quota 429 vs rate-limit 429, malformed output, typed provider errors, timeout vs external abort; fake timers. |
| Provider HTTP integration | AC-1–6 | Stub transport counts actual outbound calls for `maxRetries: 2`: three transient/malformed attempts, one permanent failure; cancellation during delay; invalid/valid cache. |
| Real-storage page runner | AC-7–10, AC-16 | Three source pages, one failing; retain prior filtering/manual prune versions, retry only that page, missing-prerequisite skip, concurrent edit and failed pre-run cleanup assertion. |
| Decision API/event tests | AC-11–14 | Two tabs, wrong-book decision, retry-all request, SSE loss, 30-second grace, 10-minute timeout and restart/cancel. |
| Studio/CLI flow | AC-15, AC-17–18 | Retry unavailable, submission failure, retained dialog, headless failure, redacted logs and translated qualified completion. |

Use deterministic failures and a fake transport; do not induce live provider quota/auth failures. PR #712's reported test results need revalidation on the integrated head against these criteria. This document does not claim those tests were executed.

## Rollout

Land classifier/budget/cancellation regressions first, then additive diagnostic metadata and server decision validation, then the Meaningfulness retry loop and Studio controls. Keep unsupported page steps on existing Skip/Stop behavior. A rollback can hide Retry while preserving classified logs and retained results; it must not reintroduce page pruning or unbounded retries.

## Open questions

| Question | Owner | Resolve by |
|---|---|---|
| Ratify Meaningfulness-only interactive Retry and the qualified completion/readiness semantics after a retained-result Skip. | @ksokolovic, coordinating product review | 2026-09-25, before spec approval |
| Reconcile PR #712 with current provider ports and verify exactly one automatic retry budget at the wire boundary. | @ksokolovic, coordinating with the PR maintainer | 2026-09-25, before spec approval |
