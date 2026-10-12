# SPEC-0013 independent adversarial review

Reviewed on 2026-10-12 by a separate reviewer agent, against the complete
SPEC-0013 contract and published SPEC-0012 base
`d9dac25357dd971e4c970ebf19edc778468fb976`. The review includes recovered work and
the implementation author's subsequent fixes. The latest inspected committed
head was `947807a2d1ad8fca7ff587dd256dbc163944f1ad`, with additional working-tree
integration changes. This is engineering review evidence, not human approval or
an exact-final-head CI certificate.

The reviewer independently examined provider/facade request accounting,
classification, caching, cancellation, the decision broker/API, Studio submission
state, generation admission/publication, filtering/pass evidence, durable recovery
read models and CLI behavior. The author retained ownership of production fixes.
The reviewer added the synthetic mTLS regressions in commit `6eb10c20`.

## Findings and resolution

1. **P1 — structured quota errors could consume three requests instead of one.**
   A first HTTP 429 containing `insufficient_quota`, without a quota phrase in its
   message, lost its structured status/body when translated through a CLI. Both
   installed executables reproduced three actual model requests with a budget of
   three. The gate now preserves the upstream error for classification whether or
   not an internal continuation was blocked. Independent reruns observed exactly
   one request for both Claude and Codex.
2. **P1 — Claude alternate-backend environment selectors bypassed the gate.**
   A synthetic Bedrock endpoint observed three model POSTs plus nine profile GETs
   while the facade reported zero requests. The registered Claude adapter now
   fails before spawning for unsupported alternate-backend selectors. The
   independent Bedrock rerun observed zero requests and a permanent failure.
   Supported Anthropic API-key and Claude-login routes remain available. This
   explicitly enforces the existing adapter manifest boundary; it does not claim
   a new Bedrock/Vertex/Foundry integration.
3. **P1 — the forwarding boundary dropped Claude mTLS credentials.**
   A loopback HTTPS server requiring a client certificate accepted a direct
   request but rejected a gated request. The adapter now passes its configured
   certificate, encrypted key and passphrase to the gate's direct and CONNECT TLS
   transports. Three independent committed tests cover both routes and rejection
   without a certificate. The fixtures are deliberately synthetic public test
   credentials, not user secrets.
4. **P1 — image passes lost filtering provenance and could replay successful
   siblings.** Segmentation/cropping wrote plain filtering output over its proof,
   and current filtering still entered the pass pipeline. The implementation now
   retains versioned raw Meaningfulness output and pass-specific filtering
   snapshots with shared generation evidence. Reuse restores these snapshots;
   pass signatures include relevant preceding inputs. Real SQLite/filesystem
   tests compare successful sibling versions, identities and asset bytes before
   and after failed-page recovery. A separate prompt-change case checks that
   segmentation and cropping rerun while Meaningfulness remains reused.
5. **P1/P2 — durable Skip qualification survived some successful recoveries and
   was missing from some downstream read models.** Only Meaningfulness originally
   cleared its durable warning. Actual successful publication now clears the
   corresponding step/page warning transactionally. Shared qualification is used
   by both generation and output catalogs. Partial caption publication does not
   clear unrelated unresolved work. Sectioning recovery and archive/import
   regressions verify retained source cardinality and durable state.
6. **P1 — headless exhaustion could admit dependent paid image passes.**
   The runner accumulated failed Meaningfulness pages but still entered
   segmentation/cropping. Dependent admission is now blocked after exhaustion.
   Both the real-storage runner and compiled CLI checks observe no dependent
   requests; the CLI exits with status 1 after three failed-page requests.
7. **P1/P2 — aggregate evidence could certify retained manual/unknown filtering
   as newly generated.** An explicit book replacement retained the filtering row
   but wrote fresh aggregate AI proof. Aggregate output now remains protected and
   non-current until the existing human Keep workflow records review. A first fix
   made Keep permanently unavailable by retaining `incomplete`; the reworked
   metadata avoids that dead end. The regression verifies unchanged manual prune
   history, no false generated currentness, and successful protected Keep.

Two test-fixture problems were identified separately from production defects:
the compiled CLI fixture initially omitted required local assets, and a prompt
change was appended outside the chat block, leaving the rendered LLM cache key
unchanged. Both fixtures were corrected rather than weakening the assertions.

The subsequent full-suite run exposed ten failures in older Sectioning fixtures
(`sectioning-existing-book`, `manual-edit-survival`, and `stage-runner`). The
SPEC-0012 baseline passed 4,385 tests, so these are compatibility adjustments
required by this change, not claimed pre-existing failures. Those fixtures marked
extraction complete or supplied retained sections without storing any filtering
decision, then requested new Sectioning. The fixtures now contain the actual
upstream filtering results (empty for image-free pages; the existing retained
image unpruned where applicable). Production prerequisite enforcement and all
manual-work, version/history, publication and scope assertions remain intact.

## Independent execution evidence

Logs are preserved under `tmp/spec0013-oct12/review/` in the recovered worktree.
They are local evidence; the committed regression sources are the reproducible
artifact.

| Check | Result / evidence |
|---|---|
| Classifier, broker, decision API, dialog and mTLS | 49 passed; `independent-focused.log` |
| Real-storage recovery and publication | 20 passed; `independent-recovery.log` |
| HTTP retry/cache, killed-process restart, archive/import | 52 passed; `independent-cache-restart-archive.log` |
| Actual Claude/Codex structured quota repro and recheck | Both initially failed at 3 requests; both fixed at 1; `quota.log`, `quota-recheck.log` |
| Actual Claude Bedrock bypass repro and fail-closed recheck | Initially 3 uncounted model POSTs; fixed at 0 requests; `bedrock.log`, `bedrock-recheck.log` |
| mTLS direct and CONNECT, encrypted client key | 3 passed; `mtls-committed-tests.log` |
| Compiled CLI headless exhaustion | Passed; 3 failed-page requests, no dependent pass, status 1; `independent-cli-latest.log` |
| Final material-fix recheck: changed pass inputs, protected Keep, compiled CLI | 3 passed; `independent-final-recheck.log`; changed rendered segmentation prompt causes 3 segmentation and 3 cropping requests, zero repeated Meaningfulness requests |
| Compatibility fixture correction: existing Sectioning, manual-edit survival, stage runner | 68 passed across all three files; `independent-fixture-compatibility.log`; prerequisite and preservation assertions retained |

The real executable versions exercised were Claude Code **2.1.260** and Codex
**0.159.2**, with fake credentials and loopback responses. No paid provider calls
were needed. The author's expanded real-wire suite also exercises token
truncation, unexpected tool continuation, transport closure, schema failures,
temporary errors and cancellation. These opt-in executable checks must be run
explicitly; a default test run that skips them is not equivalent evidence.

## Acceptance audit

“Passed” below means the reviewed implementation and local behavioral evidence
satisfy the criterion for the supported adapters. It does not imply specification
approval, release certification or final hosted CI success.

| AC | Review status | Evidence / reasoning |
|---|---|---|
| 1 | Passed | Actual transport retry integration, classified transient failures and abortable delay |
| 2 | Passed | Permanent error integration plus independently reproduced/fixed structured quota in both real CLIs |
| 3 | Passed | Validation/unknown bounded rounds and feedback; real-wire schema/token/tool cases |
| 4 | Passed | Pending transport, admission and backoff cancellation regressions; external abort precedes gate errors |
| 5 | Passed | One slot reserved before upstream egress, HTTP SDK retries disabled, real executable probes, unsupported backend fail-closed |
| 6 | Passed | Real disk cache validation/eviction and unrelated cache retention; actual request versus unknown usage accounting |
| 7 | Passed | Three-page recovery, successful sibling history/assets unchanged, page/pass checkpoint reuse |
| 8 | Passed | Decision consumption grants one bounded round; re-exhaustion creates another decision; no Retry-all |
| 9 | Passed | Stable page IDs/manual prune versions retained; invalid or missing filtering blocks dependent requests |
| 10 | Passed | Shared admission, captured input/protection checks, real transactional publication failure tests, protected Keep regression |
| 11 | Passed | Ineligible and apply-to-all Retry return 400 while preserving pending state |
| 12 | Passed | Ownership, stale/cancelled/duplicate request and concurrent resolution API/broker tests |
| 13 | Passed | Authoritative poll/SSE state, reconnection, 30-second listener grace and 10-minute timeout tests |
| 14 | Passed | Independent killed-process restart test retains committed state, rejects old decisions and starts no paid work |
| 15 | Passed | Independent compiled CLI returns nonzero after bounded exhaustion without dependent requests or a dialog |
| 16 | Passed | Shared durable qualification, successful recovery clearing, cardinality and real archive/import preservation |
| 17 | Passed | Sanitized classified diagnostics, bounded payload evidence, actual/cache/unknown usage integration tests |
| 18 | Passed | Independent dialog/action/submission tests and reviewed locale changes; author's real browser and extraction/strict-compile evidence |

## Conclusion and limits

No unresolved material behavioral finding remains from this review. The full
functional SPEC-0013 contract is implemented for the repository's supported
provider adapters; estimated functional coverage is **100%**, with **high
confidence (approximately 95%)** after the listed adversarial fixes. That estimate
is an engineering assessment, not a claim that every future external CLI version,
corporate proxy or provider configuration has been exercised.

The final full repository checks, packaged/Desktop/Docker verification and
exact-pushed-head hosted CI remain the implementation author's delivery gates.
This report must not be used to label an unrun or skipped check as passed. Human
review of Meaningfulness-only Retry and qualified Skip semantics remains pending;
no approval checkbox was changed by this reviewer. No missing implementation spec
was identified as a remaining functional prerequisite on the published SPEC-0012
stack. Third-party Claude backends outside the registered adapter manifest are
explicitly rejected, not silently routed or claimed as supported.

## Final compressed-response follow-up

After the first published head `bb67b9ae` passed hosted CI, the implementation
owner identified a further concrete classification risk and delegated its
reproduction to this reviewer. Two additional P1 findings were reproduced with
both real installed CLIs:

8. **Compressed permanent errors lost their structured code.** A gzip HTTP 429
   `insufficient_quota` response caused three actual requests instead of one.
   The gate had inspected compressed bytes as UTF-8. Commit `ff07bf60` decodes
   only a bounded diagnostic copy, leaving forwarded bytes and Content-Encoding
   unchanged. It supports gzip/deflate/br, identity and native zstd where
   available; capture and each decoded result are limited to 64 KiB and at most
   four encoding layers. Unsupported advertised encodings are removed according
   to runtime capability. Malformed/oversized evidence remains unknown.
9. **Explicit provider no-retry guidance was discarded.** HTTP 503 with
   `x-should-retry:false` also caused three actual requests in both CLIs. The gate
   now preserves explicit false as typed non-retryability. A true header cannot
   override permanent quota/authentication classification.

The reviewer implemented these focused gate corrections and regression tests;
the implementation owner independently reviewed the production diff, bounded
allocation, wire preservation, cancellation precedence and classification order.
Both real-CLI cases now make exactly one actual provider request. The reviewer
ran 54 passing tests: 25 actual-executable cases and 29 gate/mTLS/capability cases,
including a feature-mocked older runtime without native zstd. Package TypeScript
build passed. Logs: `review/{compressed-quota-before,explicit-no-retry-before,
compressed-wire-and-gate-final}.log`. A syntax omission in a new test helper was
corrected before the final passing run; it was not a production finding.

The final review therefore contains **nine material findings, all fixed and
rechecked**, with no unresolved material concern. The owner's final whole-suite,
packaged builds and corrected-head hosted results are recorded in the current
acceptance matrix and PR summary. The earlier green CI is not reused as evidence
for a later untested commit.
