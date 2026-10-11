# SPEC-0011 full continuation — before-edit acceptance map

Date: 2026-10-11. This map precedes restacking and runtime edits. Human approval
remains pending; no acceptance criterion is changed. PR #887 title/body are frozen
byte-for-byte for this continuation; only comments and base retargeting are authorized.

## Recovered work and dependency inventory

The clean existing worktree `tmp/spec-0011-implementation` is on local branch
`spec/spec-0011-prompt-persistence`, identical to published PR #887 at
`bb9e6420a7e475af67404d2efd8c827211c45583`. There are no unpublished SPEC-0011
commits, tracked drafts or stashes. The main checkout has untracked spec drafts;
other implementation worktrees have unrelated verification/tmp drafts. All remain
untouched. App task inventory shows this thread as the only active SPEC-0011 writer.
Prior recoverable refs and all attributed adaptations of #644 remain intact.

Refreshed published stack: #879 `a10d3fa0`, #880 `373619dd`, #884 `a5670d46`,
#886 `3a7ad4a33b18db8aac851c093712ce4d5112ec4d`. The graph contains them in that
order; develop is `ef31494d`. #887 shares old develop `737d3314` with that stack.
Integrating the genuine prerequisite branch into the existing implementation
preserves published commit identities and attribution without a history rewrite.
No descendant branch is merged into its ancestor. A backup will preserve #887's
pre-integration head. Its existing remote branch name is unchanged.

Read current spec, source issue, PR discussion/reviews and #644's attributed work.
The #644 review reiterates image prompt resolution, logical destination, required
revision and CLI root parity. SPEC-0003 review proposes semantic amendments still
not in its published spec; this task retains the published stack contract and
introduces no unratified mode/lock change. Current SPEC-0010 source contains shared
full resume and publication guards. Its prompt fingerprint reader still uses the
legacy resolver and two roots; SPEC-0011 must reconcile this, not bypass it.
Docker 29.8.0 is reachable with authorized host access. Old blocked percentages
and missing-dependency statements are historical, not current evidence.

## Every acceptance criterion

| AC | Existing behavior | Required change/audit | Concrete verification |
|---|---|---|---|
| 1 | Source/destination/dirty UI exists | Keep labels and reconcile freshness feedback | Actual Studio editor and browser Save/Reset/Restore |
| 2 | Filesystem/process durability exists | Preserve root injection across new stage executor | Read-only filesystem and packaged restart |
| 3 | Shared selected-version resolver exists | Reconcile dependency fingerprints and every new reader with the same roots | Variant/reset matrix and full API/CLI execution |
| 4 | Model-first precedence and source UI exist | Retain precedence while adding global roots to catalogs | Book generic vs bundled/global variant; unchanged consumer freshness |
| 5 | Required revisions and draft conflict handling exist | Retain through shared book writer admission | 428/409 and actual editor conflict tests |
| 6 | Cross-process prompt gates and ABA tokens exist | Audit lock ordering with shared book gate | Concurrent processes and Save/Reset/Restore race |
| 7 | Identical no-op and re-read on ambiguous response exist | Retain exact-content cache/freshness equivalence | Duplicate and ambiguous transport regressions |
| 8 | Immutable versions and atomic pointers exist | Verify shared publication rejects changed inputs | Fault injection, in-flight input mutation and retained output |
| 9 | Reset/restore retain history | Preserve during stack and archive integration | Bytes/selection histories across reset/restore/restart |
| 10 | Zod, containment and model ownership validation exist | Apply same validated resolver to fingerprint/include reads | Invalid names, pointers, symlinks and collisions |
| 11 | Newer typing and navigation guards exist | Reconcile new dependency UI and query invalidation | Deferred response, cross-book navigation, actual browser |
| 12 | Old API/stage/agent/CLI parity exists | Inject writable roots into new shared execution and catalogs | Production callers and actual CLI at stubbed transport |
| 13 | Caches captured rendered bytes; freshness fallback only | Integrate effective template/include/layout fingerprints with shared catalogs and guarded publication | Full resume changed/restored inputs, no-call Save, unchanged scopes and in-flight provenance |
| 14 | Idempotent source-retaining migration exists | Retain startup migration in API/CLI/Desktop | Legacy conflicts, interrupted publication and newer target |
| 15 | Historical macOS harness only; Docker now available | Refresh Desktop and Docker read-only/restart acceptance | Current packaged resources, persistent volumes and container recreation |
| 16 | Templates derive from bundled prompt parent | Keep derivation in new generation/resource fingerprints | API/CLI/Desktop/Docker template identity |
| 17 | Archives preserve prompt snapshots/history/logs; generic host warning | Use shared current-input catalogs after import to disclose effective host differences | Real ZIP/SQLite two-host read-model and provenance integration |
| 18 | Five locales complete on old head, no dependencies | Extract/translate any changed strings; strict compile | Lingui all five locales, lint, manifest diff |

## Whole-contract constraints and final gates

Keep model-specific-first precedence, immutable selected bytes, book-local
history/provenance, manual and unknown-output protection, stable identities and
referenced media. Save makes no provider call. Only effective consuming inputs
affect shared freshness; restored equal bytes can reuse valid caches. In-flight
operations must retain captured inputs and never gain evidence for newer prompts.
Reuse existing OutputMetadata, catalogs, book writer admission and staged
publication; no second freshness database/engine. Preserve compatibility flat
files, migration source retention/conflict refusal, operator recovery, explicit
rollback constraints and bundled-parent template lookup. No schema tuning,
provider-discovery change, automatic paid regeneration or global cache deletion.

Run focused regressions, full tests/build/typechecks/lint/invariants, extraction
and strict locale compilation, real book/browser and Desktop/Docker acceptance.
Delegate a separate adversarial reviewer only after implementation and initial
testing; fix material findings and obtain recheck before publication. Audit all
ACs again, publish only to #887, check exact-head hosted CI, and post current
coverage/dependency/review evidence tagging elasticsounds. No approval or merge.

## Continuation implementation and independent review

The published implementation at `bb9e6420` was reused in place, including its
attributed adaptations of PR #644. The integration merge `0d0da755` retains both
published histories and makes SPEC-0010 `3a7ad4a3` the genuine prerequisite. The
pre-integration recovery ref is `backup/spec-0011-before-stack-20261011`.

Shared prompt fingerprints now use the exact model-first immutable-selection
resolver used by rendering, including static Liquid includes and layouts. The
same writable roots reach generation/output catalogs, packaging, speech,
API/direct edits, agents and CLI. Admitted operations pin template/dependency
bytes; generated evidence uses that captured engine while publication checks use
live inputs. Prompt Save refreshes affected output queries and starts no work.
Packaging hashes its consumed freshness projection, not incidental history files
or selection UUIDs. Export snapshots prompt files under the existing book writer
and prompt gates. Import uses the destination host's shared input projection and
retains historical rendered-call logs.

A separate reviewer agent audited all 18 ACs, the full spec and stack diff. It
identified four material issues, all addressed with regressions:

1. Direct/multi-call generation engines could mix prompt revisions. Operation
   engines now capture inputs; a real two-block Easy Read provider test saves
   A→B→A while calls run and verifies both requests retain A.
2. Dynamic dependency fingerprint failures could masquerade as missing prompts.
   Catalog outputs now block only actual consumers of unsupported dependencies.
   Rechecks exposed disabled, non-applicable and excluded speech cases; the guard
   now follows actual Core TTS transformation and speech eligibility inputs.
3. Migration could lose legacy model ownership when a target model list already
   existed. Migrated selections retain validated ownership; production readers
   validate metadata across every root. A real API/filesystem regression rejects
   the colliding `ollama:alpha-beta` / `ollama:alpha_beta` alias.
4. Post-generation evidence used a live fingerprint in a narrow publication race.
   It now derives evidence from captured inputs and reserves live reads for the
   existing publication guard.

The reviewer retracted a proposed late-copy draft-loss finding after inspecting
the existing modal close guard. No human approval is implied by agent review.

Static includes/layouts are supported. Arbitrary dynamic Liquid dependency proof
remains outside SPEC-0010's documented safe-resume boundary: affected consumers
are blocked rather than labeled current. Disabled/unconsumed prompts and excluded
speech entries do not block unrelated work. This does not introduce another
freshness system or silently accept unsupported evidence.

## Final acceptance matrix

These are implementation/development acceptance results, not human approval or
release certification. The specification checkboxes and approval metadata remain
unchanged.

| AC | Result | Evidence |
|---|---|---|
| 1 | Passed | Global/book editor component tests; Chrome source/destination, dirty state and Save feedback. |
| 2 | Passed | Real filesystem/recovery tests; packaged Electron process restart; Docker container recreation with persistent books. |
| 3 | Passed | Resolver variant/reset matrix; actual API stage, targeted edit, agent and CLI provider captures. |
| 4 | Passed | Full resume ignores a book generic when the effective model variant wins; UI displays actual source/candidate. |
| 5 | Passed | Missing revision 428, stale revision 409; retained draft/conflict/controller tests. |
| 6 | Passed | Independent-process writer race, one winner, revision ABA and concurrent model-alias rejection. |
| 7 | Passed | Identical Save no-op and ambiguous-response reconciliation tests; changed/restored provider inputs reuse cache. |
| 8 | Passed | Injected pointer rename failure, orphan exclusion, corrupt/missing pointer and restart regressions. |
| 9 | Passed | Immutable history/selection tests; Chrome Reset and Use as current; Docker Reset/Restore after recreation. |
| 10 | Passed | Zod/path/symlink/pointer tests, cross-process aliases and migrated model-owner collision regression. |
| 11 | Passed | Deferred response/new typing, conflict, navigation/reset/restore guards and cross-book tests. Native browser confirmation completion was not verified because automation timed out; no claim of that live flow passing. |
| 12 | Passed | Same resolver roots in API/shared executor/direct edits/agents/actual CLI; transport-boundary requests and SQLite logs. |
| 13 | Passed | Real PDF/full-resume tests, only consuming scopes stale, Save makes zero calls, restored inputs reuse cache, in-flight A→B→A capture, guarded publication, packaging ignores incidental history. Dynamic dependency boundary described above. |
| 14 | Passed | Source-retaining idempotent migration, different-byte collisions, preserved newer targets and model-owner migration. |
| 15 | Passed | macOS unpacked app actual utility-process API with read-only resources; Docker app image read-only bind mounts, default and custom persistent roots, container recreation. |
| 16 | Passed | Root tests and actual Desktop/Docker templates endpoint compared byte-for-byte with bundled sibling templates. |
| 17 | Passed | Real ZIP/SQLite portability plus full-resume two-host global comparison; used-prompt logs and book overrides retained. |
| 18 | Passed | Lingui extraction and strict compilation: 3,716 messages, zero missing in all five locales; no dependency/lockfile changes relative to SPEC-0010. |

## Commands, review rechecks and verification limits

- `pnpm test --maxWorkers=2`: **348 files / 4,208 tests passed**, including its
  `pnpm build` pretest. Earlier 39 failures were corrected fixture roots in five
  files: they incorrectly used the books directory itself as read-only bundled
  resources. The corrected 164-test focused run and final full suite pass.
- `pnpm typecheck`, `pnpm --filter @adt/runtime typecheck`, `pnpm lint:invariants`:
  passed. `pnpm lint`: passed with eight warnings, zero errors.
- `pnpm --filter @adt/studio extract` and
  `pnpm --filter @adt/studio exec lingui compile --strict`: passed.
- Separate reviewer: 15 focused persistence/parity/cache/CLI tests, 33
  scope/Core-TTS/resume tests, and final nine continuation regressions passed.
  All four original findings plus both over-broad Core TTS follow-ups are fixed;
  no confirmed unresolved P1/P2 remains.
- `pnpm --filter @adt/desktop build` and `electron-builder --dir` with a fresh
  temporary output directory: passed. The actual packaged utility-process API
  harness passed global/book persistence, process restart, read-only resource
  hash and template identity. An initial packaging attempt could not remove the
  prior smoke artifact's intentionally read-only prompts; a fresh destination
  resolved that without touching user data.
- `pnpm --filter @adt/desktop typecheck`: node check passes; web check fails with
  three TS2307 errors for `@root/scripts/release-version.mjs` and
  `release-source-notes.mjs`. Reproduced identically on the unchanged published
  SPEC-0010 worktree at `3a7ad4a3`; this continuation does not change those files.
- `docker build --target app -t adt-spec0011-continuation:review .` and
  `node scripts/prompt-persistence-docker-smoke.mjs adt-spec0011-continuation:review`:
  passed on Docker 29.8.0. The harness uses disposable storage, verifies the
  read-only mount rejects writes, recreates containers, checks both scopes,
  Reset/Restore history, custom root persistence and unchanged templates.
- Chrome against the disposable Docker Studio: Save, reload, Reset, retained
  history and Restore passed. Source/destination/dirty feedback was visible.
  Native unsaved-navigation confirmation automation timed out in both browser
  adapters; native recovery lacked OS permissions. Automated guard/draft tests
  pass, but completion of that particular live interaction is not asserted.
- Windows/Linux Desktop installers, upgrade installers, notarization, network
  filesystems and release qualification were not run. macOS unpacked development
  acceptance is not release certification. No real paid-provider calls were made.

All declared SPEC-0011 functionality is implemented against the published stack's
supported static dependency contract. Estimated implementation coverage is 100%
(18/18 criteria); confidence is high, approximately 95%, not a statistical measure.
No missing implementation prerequisite remains in this stack. Remaining human
questions are the spec's ratification of scopes/precedence/API coordination and
shared-root migration/concurrency policy. Approval and merge of #879 → #880 →
#884 → #886 → #887 remain pending. Dynamic dependency proof is an explicitly
bounded SPEC-0010 capability, not silently represented as fresh output.

Hosted exact-head CI and the final publication comment are recorded on PR #887.
The PR title/body remain unchanged by request; that comment supersedes historical
coverage claims in the frozen description. Source issue #629 and original PR #644
are informational references; neither is closed by this work.
