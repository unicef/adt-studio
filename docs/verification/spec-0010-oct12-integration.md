# SPEC-0010 revised-stack integration — 2026-10-12

Status: historical pre-edit requirement map and integration checkpoints. See [current acceptance](spec-0010-oct12-acceptance.md) and [fresh delegated review](spec-0010-independent-review-2026-10-12.md). Human approval remains pending.
Original published target: `3a7ad4a33b18db8aac851c093712ce4d5112ec4d`.
Revised prerequisite: SPEC-0003 `c71605454126c29f8f6e5dab56ee90385012b886`,
including SPEC-0002 `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89` and
SPEC-0001 `aefe41855ae63d89c09db5553c50f48eb01b190d`.
This map precedes runtime edits. Historical green checks are not integrated acceptance.
The old target includes prerequisite `a5670d46` and merge `8b169da0`; preserve
its complete net increment, including pre-merge work, rather than replaying old
prerequisite commits. PR #886 title/body remain untouched. Source #810 and
#811/PR #876 are informational; progress redesign stays outside this work.

## Original AC to revised contract and verification plan

No original numbered AC is removed. Upstream product reviews 5486273946 and
5368403884 revise the Sectioning/rendering interpretation of AC-4/12/13; they
do not waive source safety, authored protection, currentness or completeness.
All statuses below are **not run** against the integrated implementation.

| AC | Existing mechanism / needed reconciliation | Public entry and concrete verification |
|---|---|---|
| 1 | Complete manifest + immutable source exists; retain durable publication | Direct PDF, API, CLI fresh and eligible import; real SQLite/files and manifest inventory after success |
| 2 | Verified same-byte reuse exists | Direct/API/queued/CLI equivalent defaults; compare source/page/image hashes and every relevant history/version/ID |
| 3 | Source hash admission exists | Same name/length changed bytes; reject before writes and count zero transport calls |
| 4 | Normalized extraction fingerprint exists; distinguish rendering preference from actual extraction inputs | Mode-only change and layout transition with preserved extraction basis; explicit extraction option/window/spread/contract change still rejects; test both directions |
| 5 | Inventory and attempt validation exists | Missing/corrupt original assets, zero pages, incomplete/untrusted manifest fail closed |
| 6 | Legacy refusal exists | Existing content without trustworthy manifest remains unchanged, no inferred provenance |
| 7 | Incomplete attempts survive crashes | Real subprocess termination at extraction/publication boundaries; restart refusal and diagnostic preservation |
| 8 | Version/assets preservation exists; inherit new stable-owner/reset behavior | All histories/IDs/manual speech/uploads/crops survive reuse; scoped reset appends inactive versions; unrelated pages unchanged |
| 9 | Common pre-mutation admission exists | Spy source copy/storage creation/identity retirement/clear and actual transport at all rejecting entry points |
| 10 | Shared executor relocated by SPEC10; upstream executor changed | Merge revised executor into one package implementation; real immediate/queued/direct/CLI routes enforce admission and policy |
| 11 | Shared cross-process writer exists | Independent processes, slow/live writer, duplicate queue, dead owner and anonymous SQLite mutex retain safe ownership |
| 12 | Whole-run generation adapter has obsolete mode gates and whole-stage buffering | Shared missing-only Sectioning, exact reset, incremental page publication and current saved trees; no legacy full-run fallback |
| 13 | Full summary/package exists; old freshness and completeness assumptions need revision | All-current zero calls/no content churn; selective stale work; required protected/missing/skip nonzero; actual package membership/files and current reads |
| 14 | Existing request-level cache retained | Actual stub transport counts for valid cache, invalid cache eviction/retry and ordered inputs; no blanket cache reset |
| 15 | Fresh-label workflow exists | Actual CLI errors/new chosen label, unchanged old book, no positional transfer |
| 16 | Structured errors/five locale strings exist; revised copy may change | HTTP/SSE/CLI reason and privacy checks; Studio error mapping, Lingui extraction/strict five-locale compile |
| 17 | Snapshot before extraction exists | Mutate external PDF after snapshot; manifest/hash matches actual extracted stored bytes |
| 18 | Book-local archive provenance exists | Export/import/reopen source, manifest, histories, referenced media; omit stale writer ownership |

## Integration scenarios

| Scenario | Reconciliation / concrete verification |
|---|---|
| R1 | Full CLI and HTTP Extract-to-Package then repeat: zero provider calls/content churn; real validated bundle, reused summary |
| R2 | One stale AI scope, current neighbors and warmed cache: only consuming scopes change; compare all IDs/histories/assets |
| R3 | AI/manual/unknown mix: retain protected scopes and report unresolved; ordinary Sectioning keeps existing AI/empty trees too |
| R4 | Unsupported capability refuses before writes/providers; valid saved-tree cardinality or missing lifecycle never counts as unavailable |
| R5 | Concurrent input/output/config edits reject obsolete publication; cross-process writer and exact consent revalidation |
| R6 | Ordinary page 1 publishes before slow page 2; failure/Skip/cancel/death retain page 1 and failed-page prior output; restart resumes missing work; actual layout switch remains atomic |
| R7 | Duplicate queued full runs reassess when starting, second makes zero calls/new versions; cancellation cleanup holds writer |
| R8 | Actual valid/invalid cache and retry transport counts; preserve unrelated entries and ordered request keys |
| R9 | Both mode directions → missing-only Sectioning → exact scoped reset → structural edits → rendering → real preview/export; both layouts and persisted part window |
| R10 | Exact semantic/HTML/tree version consent, default-off UI, cancel-before-confirm no mutation; stale consent rejected; Keep cannot fabricate valid inputs/coverage/authorship |

## Narrative and integration obligations

- Reuse writer/freshness/authorship/stable ownership/publication mechanisms; no new scheduler/lock/provenance store. One implementation writer; delegate read-only independent acceptance after integration.
- Saved Sectioning includes deliberately empty and unreadable existing records; retain them, report unusable input per page and run unrelated valid pages. By Page count only validates generated/cache responses.
- Sectioning preference is informational. Separate fixed/reflowable rendering layout from immutable extraction capabilities; no admission bypass or guessed source provenance.
- Explicit reset is a committed user action before generation. Later cancellation/failure leaves reset HTML/tree inactive, with history/assets recoverable. No reset on ordinary Storyboard or routine manual Save.
- Ordinary rendering publishes each HTML/tree pair immediately, including fresh CLI/DAG; output API and clickable Studio refresh while later pages run. Whole active window publication only for actual layout switch.
- Current saved ownership/coverage governs usability and package completeness; lifecycle/attempt/history do not establish currentness. Usable downstream warnings permitted by SPEC1 remain distinct from missing required work and nonzero full-resume result.
- Preserve inherited authorship separate from lineage/acceptance, exact baseVersion, translation windows, quiz identities/options, whole-document TOC consent/recovery, physical speech/uploaded media, cosmetic-save freshness, SQL/JSON null current reads.
- Legacy unverifiable/contradictory rendering owners remain raw/history/assets but are omitted preview/export with warning; no positional inference or omission solely for missing authorship.
- Fixed rendering needs valid positioned inputs. Missing immutable extraction capability is a disclosed fresh-label limitation, not permission to manufacture blank output or rewrite source.
- No same-label PDF replacement, force reset, B2/cross-page merging, paid test calls, issue closure, sibling PR modifications or self-approval.

## Publication gates

Fresh separate reviewer independently maps original/amended requirements and probes
UI → API/worker → transaction → stored output/export at a frozen integrated head.
Fix findings with regressions; require that reviewer to recheck a new frozen head.
Run focused/full tests, root/runtime types, lint/build/invariants, five locales,
copied books/browser, combined Docker runtime/export/restart in both layouts and
unpacked Desktop bundled API/resources. Separate unavailable GUI/signed/platform
release checks. Preserve original failing evidence where feasible. Publish only
after material findings are resolved; exact-head hosted test/Docker/i18n then
new review comment and elasticsounds request, without editing PR title/body.

## Integration verification checkpoints (not final acceptance)

- Full suite at the initial integrated state: 4,267 passed / 78 failed.
- Second built full suite: 4,341 passed / 19 failed (365 files, 442.68 seconds).
  Failures exposed obsolete unconditional-rerun fixtures and a known-AI duplicate
  quiz-ID repair gap; fixes are being verified. No green full-suite claim yet.
- The obsolete `pipeline-dag-publication.test.ts` mocked a removed legacy executor
  and invalid extraction admission. Its assertion is replaced by
  `apps/api/src/routes/resume-incremental.test.ts`: real PDF/SQLite, transport gate,
  first-page API visibility while page two waits, and success/failure/cancellation.
- Copied-book real API acceptance completed preference change → missing-only
  Sectioning → explicit reset → split → Storyboard → preview/package in both
  layouts. Reflowable manifest: three sections; fixed: two pages. All 13 immutable
  source PDF/image hashes per book remained unchanged.
- Real Studio: while `slow` page two waited inside the stubbed transport, page one
  was available at version 1, its second section clickable and rendered, Storyboard
  showed in progress and one missing page. Releasing page two changed the sidebar
  to done. This is development browser evidence, not packaged/release certification.
