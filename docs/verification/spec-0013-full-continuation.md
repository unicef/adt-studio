# SPEC-0013 full continuation

2026-10-12. This acceptance map was prepared before runtime integration; its first
file-write attempt hit the Xcode Python selection error. It is persisted here
after replaying the recovered commits, before implementing the remaining contract.
Human approval and all specification checkboxes remain unchanged. PR title/body
were captured and are frozen byte-for-byte.

Recovered d6233075 onto published SPEC-0012 d9dac253, with backup refs, Git bundle
and a hash manifest preserving the existing untracked evidence. Original PR712
attribution is retained. Historical missing-prerequisite claims are superseded.

| AC | Existing behavior | Required continuation | Concrete verification |
|---|---|---|---|
| 1 | Classified bounded HTTP retries | Retain in shared runner | Actual DNS/socket/408/429/5xx counts |
| 2 | Permanent failures fast-fail | Retain provider/auth interfaces | Auth/quota/model one-request checks |
| 3 | Validation feedback bounded | Audit CLI internal continuations | Invalid JSON/schema/semantic counts |
| 4 | Abort and backoff implemented | Compose shared execution | No calls/admission/dialog after abort |
| 5 | HTTP bounded; CLI agent continuations escape | Reliable pre-request enforcement retaining authentication | Installed Claude truncation and Codex tool probes |
| 6 | Validated cache, unknown usage | Reconcile force-fresh cache and actual calls | Real filesystem cache/usage tests |
| 7 | Interactive Retry disabled | Meaningfulness-only page loop | Three pages; successful siblings committed and not recalled |
| 8 | No interactive Retry | Each decision grants one bounded round | Repeated exhaustion/new IDs/no unattended loop |
| 9 | Skip diagnostics only | Preserved filtering and missing-input blockers | Manual prune/unknown data, page IDs/history/media |
| 10 | New stack stages whole generation | Page commits and guarded publication | Stale source/filter/config/prompt/protection, rollback/cancel |
| 11 | All Retry rejected400 | Enable eligible validated Retry | Ineligible/bulk400 without consumption |
| 12 | Owned once-only decisions | Input preflight before consumption | Wrong ownership/stale/two tabs/duplicate409 |
| 13 | SSE/poll/timers implemented | Retain authoritative reconnect state | SSE loss/reload/30s grace/10min timeout |
| 14 | Run decisions ephemeral | Retain committed recovery state | Process kill/restart; no automatic paid resume |
| 15 | CLI stops on exhaustion | Shared execution parity | Compiled CLI nonzero, no dialog |
| 16 | Durable skip logs only | Qualified durable summaries/readiness | Missing/retained filtering, downstream cardinality, archive |
| 17 | Sanitized diagnostics implemented | Exact request/outcome accounting | Credential/header/payload bounds, unknown cost |
| 18 | Accessible controls/locales, Retry hidden | Supported actions and qualified outcomes | React/browser, all5 locales extraction/strict compile |

Reuse shared writer admission, relevant-input/protection evidence, captured prompts
and guarded publication. No destructive cleanup, separate provenance system,
retry-all, paid automatic restart, new PR, changed auth semantics or weakened ACs.
Failed/Skip/Stop retains committed entities, history and media; Skip is never prune
or proof of currentness. Missing prerequisites remain explicit blockers.

Full checks and separate adversarial review follow implementation. Push only after
high-confidence review, then verify exact-head CI and summarize in a comment.

## Final functional acceptance audit — 2026-10-12

The complete supported functional contract is implemented. All 18 criteria below
have passing behavioral evidence, rather than checklist-only assertions. Human
approval remains pending. The roadmap's retry-without-pruning requirement and
SDD's same-PR evidence/independent-review requirements are retained; the owner's
explicit authorization overrides approval-before-implementation sequencing only.

### Recovered work and integration

Recovered all 17 unpublished implementation commits through `d6233075`, then
restacked onto published SPEC-0012 `d9dac25357dd971e4c970ebf19edc778468fb976`.
The original remote `2a5da50a` and local head have backup refs and a Git bundle.
All 101 original untracked draft/evidence files retain their SHA-256 hashes.
Other worktrees, drafts, stashes and PR712 remain untouched. PR712's classifier,
diagnostic vocabulary and decision-validation work by Kemal Sokolovic was adapted
to the current provider ports, with its original attribution retained.

The real implementation chain is #879 → #880 → #884 → #886 → #887 → #888 → #889.
SPEC-0009 is not a runtime prerequisite. Runtime changes reuse the stack's writer
lease, protection/currentness evidence, captured prompts, generation staging and
transactional publication. They add selected-page checkpoints, not a second
preservation subsystem. Retry is restricted to Image Meaningfulness.

Evidence keys are repository-relative:

- **W**: `packages/llm/src/__tests__/{client-retry-integration,claude-wire-budget,codex-wire-budget,cli-request-budget,cli-request-budget-legacy,cli-request-budget-mtls}.test.ts`; see [wire evidence](spec-0013-provider-wire.md).
- **C**: LLM classifier/client/cache/cancellation suites, including real filesystem cache and stubbed transport counts.
- **P**: `packages/pipeline/src/__tests__/{page-recovery,generation-publication}.test.ts` — real SQLite, three source pages, history and asset comparisons; includes compiled CLI subprocess.
- **D**: API `page-error-decisions`, `stages-decision`, decision restart and stage-service tests; authoritative state and timers.
- **R**: shared generation/output catalogs and catalog resume tests; API `page-recovery-archive.test.ts`.
- **U**: `PageErrorDecisionDialog` component tests, committed Chrome smoke and five-locale extraction/strict compilation.
- **I**: [separate reviewer report](spec-0013-independent-review.md), including independent rechecks of material fixes.

| AC | Status | Concrete evidence |
|---|---|---|
| 1 | Passed | W/C: actual transport DNS/socket/timeout/408/429/5xx rounds stay within N+1, bounded Retry-After/backoff. |
| 2 | Passed | W/I: auth/model permanent cases fast-fail; both real CLIs stop at one request for plain/compressed quota 429 and explicit no-retry 503 after correction. |
| 3 | Passed | W/C: malformed/schema/semantic and unknown failures retain bounded feedback; real CLI token/tool continuations cannot escape. |
| 4 | Passed | W/C/P: request/backoff/admission abort sends no next attempt or dialog; staged output remains unpublished. |
| 5 | Passed | W/I: forwarding slot reserved before upstream egress; actual Claude 12→3 and Codex 2→1 historical reproductions fixed. |
| 6 | Passed | C/W: invalid cache eviction, validated writes, valid reuse, unrelated cache retention, actual-call and recorded/unknown usage separation. |
| 7 | Passed | P/I: successful siblings committed, not called again; failed-page Retry and restart preserve sibling row versions and media hashes, including segmentation/cropping. |
| 8 | Passed | P/D/U: repeated Retry consumes one decision, grants one bounded round and creates a new decision after exhaustion; bulk Retry unavailable. |
| 9 | Passed | P/R: source IDs and manual/unknown filtering/prune choices retained; missing/invalid filtering blocks new dependent generation. |
| 10 | Passed | P/I: real rollback, stale captured inputs, concurrent writers and protected publication; explicit Keep remains available without false AI provenance. |
| 11 | Passed | D/U: ineligible or apply-to-all Retry returns 400 without consuming the pending decision. |
| 12 | Passed | D/P/U: book/run/step/page ownership, stale preflight, duplicate/concurrent tabs and cancelled decision rejection. |
| 13 | Passed | D/U: SSE loss/poll recovery/reload, retained rejected dialog, 30-second listener grace and 10-minute timeout preserved. |
| 14 | Passed | D/I/platform probes: run-scoped policies cleared; killed-process/API/container restart preserves committed data, exposes interruption and sends no automatic work. |
| 15 | Passed | P/I: compiled CLI returns status 1 after three failed-page requests, no dependent segmentation/cropping or interactive wait. |
| 16 | Passed | P/R/U: durable step/page qualified Skip, later committed recovery clears it; source cardinality, downstream warnings and archive/import preserved. |
| 17 | Passed | C/W/U: bounded sanitized diagnostics, request/classification/outcome/cache/provider fields; unknown cost is not fabricated as zero. |
| 18 | Passed | U/I: valid actions, page/attempt/cost implications, no Retry on unsupported stages, retained error state, five translated locales and real dialog layout. |

### Review and compatibility corrections

The fresh separate reviewer found nine material issues and rechecked their fixes:
structured CLI quota classification, alternate Claude backend bypass, mTLS forwarding,
image-pass reuse/provenance, durable recovery qualification, headless dependent
admission, retained manual filtering provenance, compressed error decoding and
explicit provider no-retry guidance. See I for reproductions.

The published base passed 361 files / 4,385 tests before integration. The initial
integrated full runs exposed defects and fixture assumptions; those failures are
not labeled pre-existing. Ten existing API tests marked Extract done but omitted
its persisted filtering prerequisite. Their fixtures now supply valid upstream
rows; all existing preservation/mode assertions remain unchanged. The reviewer
independently reran those three files: 68 tests passed. A changed-prompt fixture was
also corrected to change text inside the rendered chat block, and the CLI fixture
now supplies its required assets. Neither fix weakens an acceptance assertion.

### Functional boundaries and release limits

No missing implementation spec remains as a functional blocker on this published
stack. Full supported functional coverage is estimated at 100%, with high (~95%)
engineering confidence after independent review; this is not mathematical proof.

Claude's registered adapter supports Anthropic API keys and Claude Code login.
Ambient third-party Bedrock/Vertex/Foundry and other alternate-backend selectors
can bypass its configured Anthropic endpoint, so they now fail explicitly before
spawning with the existing unsupported-capability classification. They are not
silently unset, relabeled as counted requests or newly claimed integrations.
Supported key precedence, login selection, proxy/mTLS and Codex account/org/project
routing are retained and tested with synthetic credentials. Live paid accounts,
future executable versions and arbitrary corporate network configurations are
not certified by loopback evidence.

Desktop evidence uses an unpacked macOS-arm64 bundle and real Electron utility
process; it is not signed/notarized installer, Windows/Linux Desktop or full release
QA. Docker checks use the combined production app target. No release tag, merge,
issue closure or human approval is performed. PR title/body remain frozen; the
publication summary and exact-head CI belong in a PR comment.

### Executed verification

| Command/check | Result |
|---|---|
| Published SPEC-0012 baseline `pnpm test --maxWorkers=2` | Passed: 361 files / 4,385 tests; isolated checkout, frozen offline install. |
| First published head `bb67b9ae`: `pnpm test --maxWorkers=2` (including pretest build) | Passed: 371 files / 4,508 tests; 2 executable-only files / 21 tests skipped by default and explicitly passed below. |
| Final runtime head `ff07bf60`: `pnpm test --maxWorkers=2` (including pretest build) | Passed: 372 files / 4,521 tests in 484.93 seconds; 2 files / 25 external-executable cases skipped by default and explicitly passed below. |
| Final opt-in Claude/Codex and gate/mTLS command in W | Passed: 54 tests (25 real-executable cases + 29 gate/proxy/mTLS/capability cases), Claude 2.1.260 and Codex 0.159.2. |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm lint` | Passed: zero errors, eight unused-suppression warnings; not claimed warning-free. |
| `pnpm lint:invariants` | Passed: implemented SPEC-0010 extraction reset check. Other listed planned invariants are not executable checks. |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio exec lingui compile --strict` | Passed: 3763 messages, zero missing translations in en/es/fr/pt-BR/sq. |
| Production Studio, API/Electron and combined Docker builds | Passed; root pretest also builds packages/runtime. |
| Real Chrome `spec-0013-browser-smoke.mjs` | Passed with committed portable fixture: decision/reconnect/two-tab flows, durable warnings/diagnostics, geometry, zero page errors, unchanged SQLite bytes. |
| Compiled CLI and archive/import | Passed in P/R; CLI independently rechecked. |
| Electron packaged API and Docker `app` recreation | Passed: 20 pages, durable warnings/interruption, unchanged page data/current versions and 43 asset hashes; [scope and reproduction](spec-0013-platform-acceptance.md). |
| Independent reviewer | Nine material fixes rechecked; no unresolved material finding; final 18-AC audit passed. |
| PR metadata and recovered drafts | Original title/body equal byte-for-byte; all 101 original draft/evidence hashes unchanged. |

Local logs are retained under `tmp/spec0013-oct12`. Exact pushed-head hosted CI
and the publication link are recorded in the PR summary comment, because this
pre-publication document cannot attest to a future workflow run. Hosted default
tests skip external-executable probes; the separately executed W command above
is their evidence, not hosted CI. Signing, installers, live accounts and future
external CLI versions remain not-run release checks, not failed functional ACs.
