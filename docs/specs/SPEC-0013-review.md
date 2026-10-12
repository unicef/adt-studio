# SPEC-0013 implementation review — 2026-09-25

> Historical September checkpoint. The implementation and dependency gaps below
> are superseded by the [October continuation evidence](../verification/spec-0013-full-continuation.md)
> and [independent review](../verification/spec-0013-independent-review.md).
> The original findings and executed results are preserved unchanged below.

The review started at local `75de501c` on `spec/685-page-failure-recovery`,
against develop `737d331418d13f930955504e8288ee26ec1b20ba`. It independently
re-evaluates the implementation against the published specification, issue #685,
PR #712 and the existing application paths. This is an agent review and does
not constitute the pending human approval. No commits were pushed.

**Verdict: useful partial implementation, not complete page recovery.** Estimated
completion is approximately **60% of the original behavioral contract**. This is
a judgment weighted toward user behavior, not a test-count or lines-of-code
metric. Eleven criteria have evidence within the scopes in the
[acceptance matrix](SPEC-0013-implementation-evidence.md); seven remain unsatisfied
in full. The missing criteria include the central protected page Retry behavior.
Confidence in the implemented HTTP retry, decision and diagnostic slice is
**moderately high (8/10)** after remediation. Confidence is insufficient to
approve the full specification or promise safe recovery on edited books.

## Findings fixed during this review

| Severity | Finding and impact | Correction and regression evidence |
|---|---|---|
| P1 | With two concurrent page failures, choosing Stop resolved one broker promise, but the sibling waited for a separate decision or timeout. The stopped step could remain running for up to ten minutes. | Pass the step abort signal into the existing broker; finish sibling decisions and detach listeners when the step stops. A real-storage, real-runner, real-broker three-page regression demonstrates prompt termination and no third page invocation. |
| P1 | Admission used a boolean. Resolving one failure with Skip opened it even while another failure still awaited a decision; later pages could incur provider calls while the UI was paused. The launch ramp also lacked a post-delay admission recheck. | Count pending pauses, release only after all resolve, and recheck after the ramp. The same runner regression proves the third page stays unstarted after the first Skip. Both runner cases failed before the fix and passed afterward. |
| P2 | SDKs with no usage returned NaN, while CLI adapters manufactured zero usage. Studio could consequently display zero cost for a request with unknown cost. | Normalize missing, partial, negative and non-finite usage to unknown; preserve measured zero and known usage on invalid CLI responses. The API counts unknown-usage calls and Studio explains incomplete token totals instead of estimating their cost. HTTP, CLI, SQLite API and rendered Studio tests cover the behavior. |
| P2 | Invalid model output disappeared from attempt inspection; credentials resolved from server configuration were absent from the redaction set, so semantic feedback could expose them in logs or subsequent feedback requests. | Retain failed output, resolve the active provider's declared secret fields, and redact diagnostic text and validation feedback. Three actual-SDK transport regressions failed before remediation and passed afterward, covering missing usage, failed-response inspection and redacted subsequent request bodies. |
| P2 | CLI invalid JSON/schema failures were generic unknown errors, losing their validation feedback and reported usage. Wrapped native timeout/abort exceptions were also missed because their names are inherited native accessors. | Emit typed validation errors with output/usage from both CLI adapters; inspect native DOMException names safely through nested causes. Keep CLI quota advisory failures permanent. Adapter/classifier regressions pass; this does not prove executable-internal HTTP budgets. |
| P2 | A no-call cancellation control row looked like an error in Debug, even though it represented cancellation rather than another failed paid request. | Display the existing translated Cancelled status and exclude cancellation from the error aggregate; regression coverage checks both UI status and API totals. |

No separate recovery subsystem, provider dependency or durable decision store was
introduced. API additions remain backward compatible. The prompt/output
inspector still retains book content while removing known credential values.

## System-level review and remaining blockers

The path was traced from Studio's keyed decision dialog and authoritative
polling through strict Hono validation, the run-owned broker, page admission,
Meaningfulness publication, persisted logs and Debug statistics. The CLI/DAG
headless path and storage startup interruption behavior were also reviewed.

1. **Shared freshness and readiness — SPEC-0001 / [PR #879](https://github.com/unicef/adt-studio/pull/879).**
   Inspected head `375081fc3ba84b185861c7977623ae2d589eb34a` is documentation only.
   Recovery needs input/config/filter/output version checks and an honest
   retained-result readiness policy before dependent stages consume old data.
2. **Manual-work and history preservation — SPEC-0002 / [PR #880](https://github.com/unicef/adt-studio/pull/880).**
   Inspected head `5eeaab68665f594f828dcf448b30e52dc109ba7a` is documentation only.
   `makeBeforeRun` in `apps/api/src/routes/stages.ts` still clears node types and
   histories before execution. Meaningfulness still publishes filtering through
   `putNodeData` without checking the captured input/output versions. A failure
   after cleanup cannot preserve already-deleted history; a late response can
   supersede a newer edit. Broker tests do not prove these writes safe.
3. **Non-destructive downstream admission — SPEC-0010 / [PR #886](https://github.com/unicef/adt-studio/pull/886).**
   Remote head `d906d7f3aa39b8dc6b57b36c1971221cf16e4966` is documentation only.
   Local implementation refreshed through `d8be3223` contains shared writer admission
   and safe extraction, but explicitly refuses unsafe downstream resume. Its
   latest import/font admission fixes do not provide Meaningfulness's
   preservation/freshness
   prerequisites. It was inspected, not imported or modified.
4. **Remaining SPEC-0013 work / [issue #685](https://github.com/unicef/adt-studio/issues/685).**
   Once the shared contracts exist, this PR still needs the page-only manual
   Retry loop, captured-version conflict validation, protected publication,
   downstream cardinality and qualified completion UI. The September 26
   follow-up below implements page-specific skipped-with-error diagnostics.
   The remaining tasks belong here,
   not changes that another spec will automatically deliver. Current Skip can
   still emit ordinary step completion with a count; it does not satisfy AC-16.
5. **External CLI request-budget boundary — AC-5/6.**
   Codex and Claude executables can make hidden requests beyond one adapter
   invocation. Their invalid-output usage is now preserved and absent usage is
   honestly unknown. The September 26 tests below demonstrate a remaining
   wire-budget failure despite mitigation. A controllable boundary is required, or a separately
   approved, explicit spec amendment. The current acceptance criteria stand.

Interactive Retry therefore remains unavailable everywhere, including
Meaningfulness. This follows the dependency gate; it must not be described as
completion of AC-7/8. Existing rerun/Skip paths are not certified safe merely
because the new broker cannot issue Retry. Shared prerequisite coverage must
include both API and CLI, not only a Studio guard.

## Verification and limits

- Focused suite: 12 files / 257 tests passed, including the reproduced failures.
- `pnpm test --maxWorkers=2 --testTimeout=30000`: **283 files / 3,684 tests
  passed** in 627.60 seconds with other worktrees running tests concurrently.
  Its pretest `pnpm build` passed. Eleven regression cases and one test file were
  added over the previously verified 3,673-test revision.
- `pnpm typecheck` passed. `pnpm lint`: zero errors, the same eight
  unused-suppression warnings reproduced
  on the untouched develop baseline during implementation.
- Studio production build, API server and Electron API bundles passed.
- Lingui extraction and strict compile passed: 3,623 messages, no missing
  translations in any of the five supported locales.
- Rebuilt production Studio browser acceptance passed reload/poll recovery,
  rejected submission, refresh/Stop and two-tab resolution. No unsupported Retry
  appeared, no JavaScript errors occurred, and the disposable book DB remained
  byte-for-byte unchanged. The fixture injects decisions through the real broker;
  it does not simulate an implemented manual Retry worker.
- Fresh-book compiled CLI acceptance passed again: exit 1 in 8.7 seconds after
  exactly six intercepted transport requests (three metadata, three
  Meaningfulness), with no dialog or live paid calls.
- Runtime: Node 22.23.2, matching the current CI major version. Test logs and
  disposable browser harnesses are retained locally under `tmp/acceptance/`.

Current checks do not establish protected three-page retry, manual prune/history
preservation across a rerun, concurrent input/output replacement, or a crash
inside an incomplete publication transaction. The real process restart test
covers only the committed failure-decision boundary. The earlier Docker smoke
was on an earlier local implementation revision; this review does not claim it
as current-head Docker verification. Signed installers, packaged Desktop launch,
Windows, paid providers, release/upgrade and hosted CI remain unverified.

Remote PR #889 still points to the original documentation head
`2a5da50a9de1d58c2131ad1132f8bda22d9ba9e5` on the original document stack.
Retarget to develop together with a later authorized push, using the preserved
backup ref and a fresh remote lease check. PR #712 remains unchanged and its
applicable starting work remains attributed in the implementation evidence.
Specification approval, retained-result product review and any CLI-budget
amendment remain human decisions; no approval or acceptance checkboxes were
fabricated by this review.

Local remediation commits: `382261fb` (concurrent decisions), `ac311a75`
(provider diagnostics/usage), and `310f1fca` (API/Studio accounting and locales).
The final documentation commit records these tested changes without publishing
them.


## Immediate follow-up: owned work and CLI request counts (2026-09-26)

Items 4 and 5 above do not justify waiting for another specification to be
approved. Shared protection is necessary before enabling manual Retry, but
page-level diagnostic persistence and executable retry investigation can proceed
independently. This follow-up does that work without a separate preservation
subsystem or a change to CLI login/billing identity.

### Skipped-page outcome persistence

The existing progress channel now records a `page-error-skipped` event and
appends a `skipped-with-error` control record to the book's existing `llm_log`
when the runner consumes Skip. It contains the page, step, error class and the
original request identity/attempt when available. It has `providerCall: false`,
no manufactured usage, and is excluded from provider-call, latency and error
aggregates. Studio Debug shows a distinct translated **Skipped after error**
status and explanation. No entity versions, filtering values or assets are
rewritten by this diagnostic record.

A real SQLite runner test reopens storage after Skip followed by a sibling Stop:
the page-specific record persists and all pre-existing node rows are unchanged.
Actual Hono Debug routes expose the record and keep call accounting unchanged.
Rebuilt Studio browser acceptance verifies the label/explanation, reload
persistence, zero JavaScript errors and unchanged fixture DB after inspection.
Both new messages are translated in all five locales.

This is durable diagnostic evidence, not the full qualified completion/readiness
read model: AC-16 remains incomplete. It does not protect data deleted by
existing pre-run cleanup, enable Retry, or prove downstream page cardinality.

### External CLI investigation and partial mitigation

All executable experiments used synthetic loopback HTTP/SSE responses, fake
credentials and isolated temporary configuration. No paid-provider request was
made. Installed versions: Claude Code `2.1.260`; Codex
`0.155.0-alpha.9.2`. The tests count HTTP requests at the local server, not
mocked helper invocations.

- Before controls, one Claude invocation sent five HTTP requests in 15 seconds
  on a persistent 503, before the probe cancelled it.
- The production Claude adapter now sets `CLAUDE_CODE_MAX_RETRIES=0`,
  `MAX_STRUCTURED_OUTPUT_RETRIES=0` and
  `CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK=1`. These keep transport retry,
  schema repair and streaming fallback in the facade's budget for the tested
  executable. The separate stream fallback is documented in the
  [official environment reference](https://code.claude.com/docs/en/env-vars).
  Reported HTTP status and structured-output exhaustion now reach the shared
  classifier/feedback path, with available usage preserved.
- The real CLI initially sent six requests for three facade attempts when the
  stream ended early. Disabling non-streaming fallback corrected this to three.
- Seven real-executable acceptance cases pass: 503, temporary 429, permanent
  403, malformed structured output, interrupted stream, valid output and
  cancellation. For `maxRetries=2`, the failure cases make three requests;
  permanent failure and success make one. Cancellation sends no further request.
- **Known failure: token truncation still sends twelve requests for three
  facade attempts.** Claude's internal output-token continuation does not obey
  these controls. A tested one-turn cap did not fix it and is not shipped.
  The original three-request assertion remains failing in the opt-in acceptance
  test; the criterion has not been weakened or marked complete.
- Codex rejects retry overrides for its reserved built-in `openai` provider.
  A synthetic custom-provider configuration with request/stream retries set to
  zero did make one request. Switching production configuration without proving
  the existing API-key and CLI-login paths would risk authentication and
  compatibility, so the Codex adapter is unchanged. This is remaining adapter
  engineering work, not a dependency on SPEC-0001/0002/0010.

Repeat the executable acceptance with:

```sh
ADT_CLAUDE_BUDGET_EXECUTABLE="$(command -v claude)" pnpm exec vitest run packages/llm/src/__tests__/claude-wire-budget.test.ts --maxWorkers=1
```

It currently reports **7 passed / 1 failed** on the version above. Without that
explicit executable setting, the default repository suite skips these eight
acceptance tests. CI cannot be represented as proving this executable contract.
Older CLI versions, subscription login, other gateways and packaged platforms
have not been verified. The existing CLI version floor is unchanged; older
executables may ignore the new environment controls.

The remaining request-count guarantee needs a supported way to disable every
internal continuation, or a controllable provider transport preserving the
existing authentication behavior. A narrower CLI guarantee would be a material
spec amendment requiring explicit review; it is not implied by this mitigation.
No unrelated PR or provider login configuration was modified.

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

Follow-up implementation commits: `8a34a18d` (Claude controls and executable
acceptance), `65047445` (persisted Skip diagnostics and translated Studio view).

## CLI transport hardening and remaining agent continuations (2026-09-26)

The subsequent implementation pass reduces Codex's hidden transport retries.
It does **not** establish an overall request ceiling for either external CLI.
AC-5 remains failed in that scope and AC-6 remains incomplete.

Before editing, the acceptance targets were AC-5 (actual provider requests must
not multiply a facade round), AC-6 (request/usage visibility), and the associated
AC-2/4/17 compatibility checks for permanent failures, cancellation and
credentials. The executable test below exercises the real facade, adapter,
process runner and installed CLI; it does not count mocked helper invocations.

The Codex adapter now uses an internal custom definition with OpenAI
authentication, zero HTTP/stream retries, SSE transport, and
`features.unbounded_connection_retries=false`. The last setting matters:
connection failures otherwise take a separate unbounded reconnect path even
when stream retries are zero. The model/provider selection exposed to Studio
is unchanged. No dependency or separate recovery subsystem was added.

The definition retains the CLI's API-key/subscription credential selection and
auth-dependent default endpoint. Organization/project headers remain forwarded.
Synthetic login-file tests prove the configured API key outranks a stored login;
without a configured key, the CLI sends the synthetic login token and account ID.
The production adapter does not introduce an ambient `OPENAI_BASE_URL` override.
An explicit runner-only endpoint seam routes acceptance traffic to loopback;
these tests never read the user's login, and all outside proxy connections are
rejected. Live subscription entitlement and token refresh are not verified.

References: [OpenAI authentication](https://learn.chatgpt.com/docs/auth#alternative-model-providers),
[provider retry configuration](https://learn.chatgpt.com/docs/config-file/config-reference),
and the public Codex `responses_retry.rs` implementation inspected during this
pass. The executable under test is `0.155.0-alpha.9.2`; behavior on other CLI
versions, corporate gateways and packaged platforms is not certified.

### Actual executable acceptance

A corrected baseline probe routed the original built-in provider with its explicit
`openai_base_url` setting. One invocation made **13 HTTP POSTs plus seven
WebSocket upgrade attempts** against synthetic 503 responses in 15 seconds,
before the probe stopped it. An earlier environment-only probe did not reach
the loopback endpoint and is not used as provider-count evidence. With the new
production transport controls, the 503 acceptance makes three HTTP requests
for three facade attempts.

| Provider / condition | Result |
|---|---|
| Codex 503, temporary 429, malformed JSON, closed stream, reset socket, truncated response | Passed: three actual requests for `maxRetries=2`. |
| Codex permanent 403 | Passed: one actual request. |
| Codex valid structured output, configured API key and synthetic CLI login | Passed: one request, valid result and reported usage; configured key takes precedence and login sends the account header. Organization/project headers verified in both cases. |
| Codex cancellation | Passed: child stops, no subsequent provider request. |
| Codex unexpected tool call | **Failed:** two actual requests with `maxRetries=0` (budget one). The CLI processes the unavailable tool and asks the model again inside one facade invocation. This is an agent continuation, not a transport retry. |
| Claude token truncation | **Failed again:** twelve actual requests with `maxRetries=2` (budget three). Other seven Claude cases still pass. |

The Codex suite therefore has **ten passing cases and one failing case**. Its
new failing assertion is retained; no `test.fails` annotation or relaxed request
count conceals it. Combined executable acceptance is **17 passed / 2 failed**.
These 19 cases are opt-in and skipped by the normal repository suite.

```sh
ADT_CODEX_BUDGET_EXECUTABLE="$(command -v codex)" pnpm exec vitest run packages/llm/src/__tests__/codex-wire-budget.test.ts --maxWorkers=1
ADT_CLAUDE_BUDGET_EXECUTABLE="$(command -v claude)" pnpm exec vitest run packages/llm/src/__tests__/claude-wire-budget.test.ts --maxWorkers=1
```

### What still needs implementation

A true total-call limit must be enforced inside the executable or before each
provider request. No supported total-call control was found for these installed
versions. Claude's output-token recovery loop remains separate from its retry
and turn controls; Codex's agent/tool continuation remains separate from its
transport controls. Killing a child after observing stdout is not a reliable
request gate because the next request may already be in flight.

The remaining choices are an executable-supported call cap, or an authenticated
transport boundary that demonstrably preserves login, routing and streaming.
Those require further implementation and verification; prompt instructions or a
narrower guarantee are not substitutes for the published criterion. No vendor
binary, external PR, user login or user configuration was modified.

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
