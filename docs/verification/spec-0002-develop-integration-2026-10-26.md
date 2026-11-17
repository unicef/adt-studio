# SPEC-0002: local integration with merged SPEC-0001 — 26 October 2026

## Assessment and scope

The preservation implementation is integrated onto current develop, with the
six explicitly accepted deferrals and merged SPEC-0001 compatibility limits
retained. Independent review found one material integration defect (protected
quiz generation incorrectly accepting changed inputs); it is fixed and covered
by adversarial regressions. The owner also authorized the narrow fixed-layout
JSON-null prerequisite correction. Neither correction introduces another
ownership, locking or freshness subsystem.

This is a **qualified implementation and verification assessment**, not an
unqualified claim that every edge of the original specification is complete.
The accepted deferred failures remain real. Docker combined-runtime acceptance
is blocked by a failed local image build; private historical-book acceptance,
live-provider quality and release checks remain pending. The evidence below
supports preparing a later push for review within that scope, not merging or
certifying a release.

All work in this round is local. No push, PR retarget, title/body edit, GitHub
comment, review request, merge or issue closure was performed. SPEC-0002 and its
INDEX entry remain `draft`. Proposed later PR base: **develop**. The remote PR
still has its old stack base until publication is separately authorized.

## Exact sources and integration

| Reference | Revision |
|---|---|
| Refreshed develop | `30e5a37b62c07bd25c26d737d9f22c2b0a333aef` |
| Original local and remote SPEC-0002 | `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89` |
| Actual inherited SPEC-0001 boundary | `aefe41855ae63d89c09db5553c50f48eb01b190d` |
| SPEC-0001 squash in develop | `c153ba7d26c2323b67236c61297999424b169ac1` |
| Final pre-squash SPEC-0001 head | `811d14751d6e01a8262d3e34466c1f45875b8ca1` |
| Integrated production source | `01b08c6eb0451878609789eef10d86a8e31931c8` |
| Additional independent-review regressions | `05aa78da` |
| Built old-read compatibility source | `ef31494dc2951b92222c473960fecee2d91f9544` |

The genuine increment is the **final net patch aefe41855..09f0d1c7**, not the
entire historic stack. It was applied with three-way context onto develop and
conflicts reconciled by behavior. This avoids replaying obsolete SPEC-0001
implementation commits after its squash merge. Late SPEC-0002 conflict fixes
are included in the final patch. The original 37 commits remain recoverable
through local backup refs and a saved patch. No descendant branch was merged.

Local backup refs are `backup/spec0002-local-oct26`,
`backup/spec0002-remote-oct26`, `backup/spec0002-inherited-oct26`, and
`backup/spec0002-develop-oct26`. Work used the existing isolated checkout
`tmp/spec-0002-implementation`, on the existing named PR branch; the main
checkout and its uncommitted drafts were preserved.

An independent final-tree inventory found 105 original increment paths, 356
upstream-changed paths and 51 overlapping paths. At the implementation freeze,
112 paths formed the final increment; **298 upstream-changed paths are
byte-identical to develop**. The other overlaps were reviewed semantically.
Nine added paths are focused integration tests or the shared receipt fix; two
old test-only edits were superseded by develop. Subsequent changes are tests
and evidence. The many-to-one range-diff is supporting history evidence, not a
proof of behavioral equivalence.

Overlap review retained shared writer admission, deleted/new-book handling,
pre-edit ownership snapshots, historical identity reservations, exact source
receipts, legacy full-list translation compatibility, locale namespaces,
pending-save acknowledgements, restore/scope guards, immutable audio/history,
package invalidation, generator review notices, upstream security/runtime and
PDF reference fixes. Ordinary freshness reads have not acquired media hashing.
The final diff retains the SPEC-0002 specification, INDEX row, accepted UI,
implementation, tests and prior evidence without reinstating obsolete SPEC-0001
versions of shared services.

## Review and clarification ledger

Preparation included the complete current specification, narrative decisions,
AC-1–19, source issues, prior audits, roadmap/SDD, architecture, guidelines,
invariants and relevant ADR decisions. Captured GitHub discussions were fully
paginated: #880 had eight discussion comments, two submitted reviews and no
inline comments; #879 had 25 comments, eight reviews and 255 timeline entries
across three pages. Linked ADR-028/#892 decisions were also read. Historical
passes and resolved discussions were treated as inputs, not new test results.

| Finding / decision | Result and concrete evidence |
|---|---|
| Original review areas 1–4: authorship/freshness, structural identities, explicit actions, real HTTP preservation and bounded CLI | Retained. Shared schemas and server stamps distinguish authorship from input lineage and review acceptance; `manual-edit-survival.test.ts` exercises actual route admission/preparation/publication/history/preview/export. Fixed windows and transport accounting remain in `catalog-execution.test.ts`; CLI coverage is stamping only. |
| F1 — old HTML/answers acquire new section identity | Retained and reverified. Shared owner resolution, replacement/reorder/prune/restore HTTP regressions assert URL isolation, catalog answers, manual translations, physical audio and neighboring versions. Contradictory ownership is not overridden. |
| F2 — TOC positional ID reuses another chapter's draft | Retained and reverified. TOC-specific whole-document conflict policy; mounted editor tests plus actual browser rejected Save/recovery/next Save. Two browser editors preserve unrelated title/indent changes; an identity replacement cannot silently receive the other chapter's draft. Actual reader navigation opens the correct chapter. |
| F3 — protected fixed page loses positioned tree | Retained and reverified. Existing pair-preservation tests cover ordinary run success/failure/cancel/reopen. Bundled Desktop API preview/export before and after restart retained the fixed-page output. Broader mode lifecycle remains out of scope. |
| F4 — combined Sectioning → TOC skips consented work | Retained and reverified. Exact same-run retirement advances only the authorized TOC snapshot. Real HTTP regression rejects an independent SQLite writer. A separate running API/transport probe made two Sectioning calls and exactly one TOC call, produced AI TOC and retained manual history. |
| JSON-null prerequisite named by #884 merge-order feedback | Failed on current develop, reproduced independently with SQLite. Owner authorized narrow correction: null fixed-layout row is inactive, so shared selection can use valid semantic data; malformed non-null/conflicting ownership still fails closed. Committed HTTP preview/export regression failed before and passes after correction. No broad #884 import. |
| Independent R1 — protected quiz rerun clears changed-input warning | Fixed. `publishSourceGeneration` validates captured inputs and runs the transaction even when output is incomplete; it accepts a clean input basis only when complete. API and DAG pass incomplete when protected groups remain. All-protected zero calls; partial real batching makes exactly two stubbed model calls; explicit HTTP Keep clears warning with no quiz version or calls; competing source edit rejects before publication with exact SQLite fingerprint unchanged. |
| Integration: generic history restore versus dirty draft | Preserved develop's scope/operation/acknowledgement behavior; removed obsolete blanket dirty blocking from the transplant. Generic VersionPicker adds the required baseVersion. Selected-page Revert keeps its distinct unsaved-draft restriction. Existing restore and pending-save component regressions pass. |
| Integration: first-language/no-output translation receipt | Preserved separate source signature and actual missing entity instead of synthesizing an empty saved translation. First saves and no-output tests pass. A historical-manual-then-empty fixture was corrected to model truly never-attempted output; selected-history recovery is still covered. |
| ADR-028 / SPEC-0014 | Current narrowed field-level authorship decision retained. No new storage home or duplicate invariant ownership introduced. |
| Final SPEC-0001 terminology, generator notices, C3 baseline, legacy saves and ownership decisions | Reconciled explicitly in the specification's October 26 section, with source links. No authorship inference; unchanged duplicate/retired translations may round-trip during unrelated valid saves. This exception is not applied to ambiguous TOC identity. |
| Earlier independent R1–R8 and accepted Revert UI | Existing fixes/regressions retained, reconciled with newer develop policies. Selected-page Revert chooses the highest earlier explicitly AI-authored version; no inferred baseline or cross-page reversal. Six later owner deferrals below remain visible. |

Decision sources:
[original review](https://github.com/unicef/adt-studio/pull/880#issuecomment-5776174130),
[follow-up](https://github.com/unicef/adt-studio/pull/880#issuecomment-5868235633),
[F1–F4](https://github.com/unicef/adt-studio/pull/880#pullrequestreview-5486314026),
[prior fixes](https://github.com/unicef/adt-studio/pull/880#issuecomment-6123311666),
[ADR discussion](https://github.com/unicef/adt-studio/pull/880#issuecomment-6129794433),
[owner deferrals](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220),
[merged SPEC-0001 ratification](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170).

## AC-to-evidence matrix

“Passed” below is an observed development check within the amended/ratified
contract, not approval or full release acceptance. Rows explicitly qualified
by a deferral are not unqualified AC completion. Real SQLite/filesystem routes
are used where persistence matters; provider boundaries are stubbed.

| AC | Status | Evidence and limits |
|---|---|---|
| 1 | Passed | Changed/new-only translation stamps, no-op unchanged AI/unknown provenance, stale/missing version rejection, first configured language and unchanged legacy entries: survival, text-catalog and compatibility regressions. |
| 2 | Passed | Full-source fixed windows before eligibility; protected/current exclusions, 8,850 entries/177 windows, adapter/cache/provider retry/cost assertions in catalog-execution. Ordinary reruns are separate from the warmed full-eligibility cache experiment; no force-fresh feature or representative-book cost claim. |
| 3 | Passed | Quiz save/identity/lifecycle regressions preserve quiz and option IDs, stamp changed/new only, retain provenance on no-op. Actual browser edit and reader scoring pass after two ordinary reruns. |
| 4 | Passed | Shared batching tests cover complete protected page groups, order independence, overlap, no eligible/all protected, repeated reruns, stable translations/audio/reading order. New partial-generation/Keep regression preserves input-review warning. All-protected runs may append a book aggregate version/update generatedAt while protected quiz objects remain unchanged; this existing behavior was independently compared with 09f0d1c7. |
| 5 | Passed | TOC save/no-op and generation stamp tests; actual browser saves/read/history confirm whole-document provenance. |
| 6 | Passed; D3 explicitly deferred | Named successful replacement, cancellation/failure and manual history; combined actual HTTP transport probe. Empty protected TOC's offered run remains a known UI no-op. |
| 7 | Passed; D4 explicitly deferred | Structural routes, changed-only authorship, pre-edit ownership and AI-edit guards pass. Unnecessary page versions in unchanged AI edits remain deferred. |
| 8 | Passed | Manual/unknown/empty pages skipped; fixed tree/HTML retained; ordinary eligible AI neighbors handled separately. No protected publication or retirement. |
| 9 | Passed within legacy bounds | Six-unit real save → own/upstream run route → read/history → preview/export survival regression passes. New browser scoped/fallback journeys retain manual French and unchanged neighbors. Unverifiable legacy ownership is retained raw but omitted with disclosure; private books pending. |
| 10 | Passed for badges/catalogs; D6 explicitly deferred | Four existing badge/control component suites, extraction/strict compilation in five locales, lint. Known adjacent-page error remains untranslated by owner direction. Not every normal accepted editor walkthrough repeated. |
| 11 | Passed within stated compatibility bound | Unknown protection and first-open review baseline tests. Actual built pre-change API reads all four entities, preview and Web export; current reopen preserves authorship/IDs/history. All 1,822 baseline tracked sources match ef31494d. No old-build editing/rerun, pre-schema-14 or blanket legacy-repair promise. |
| 12 | Passed; D1 explicitly deferred | Restore provenance and selected-page highest-earlier-AI tests include cancellation, missing baseline, stale/busy and neighboring history. Actual browser Cancel/Confirm verifies selected-page restoration, retained manual history, unchanged neighbor and zero calls. Generic restore acknowledgement regressions pass. Net-clean A→B→A pending draft after Revert remains deferred. |
| 13 | Passed | Real structural delete-last/empty-page/cross-page merge regressions preserve both manual pages and moved content exactly once; stale neighbor guard rejects before either mutation. |
| 14 | Passed within legacy bounds | Source removal retires active translation/TOC references, keeps history/provenance/assets and restores same IDs without borrowing corrections for new IDs; source reorder/prune/restore routes and retained catalog tests. K3 historical repair remains deferred. |
| 15 | Passed | Default-off named page snapshot confirmation tests, frozen version guards and ordinary skip; queued stale consent is rejected. |
| 16 | Passed | Failed/cancelled/SQLite-failed publication retains prior current/manual version and identities. Quiz replacement allocates fresh quiz identities; Sectioning reuses proven unchanged identities and allocates unused IDs for new content. Retirement occurs only on successful transaction. |
| 17 | Passed within output bounds | Real HTTP and packaged-runtime preview/Web export contain current manual content and actual stable owner. TOC navigation and actual quiz correct-answer scoring browser checks; Webpub tests. Retained physical assets and restart ZIP members verified. No EPUB/PNLD navigation redesign or unrestricted ambiguous-legacy projection claim. |
| 18 | Passed guards/F2; D1/D2/D5 explicitly deferred | Required baseVersion, stale/busy 409 and no writes, independent SQLite writer tests; guarded draft/component pending acknowledgement, scope/navigation/restore suites; actual two-writer TOC recovery and next Save. Known deferred draft/delete/error edges remain. |
| 19 | Passed, bounded | CLI/DAG four-node AI stamps and shared quiz grouping tests. Does not establish full CLI resume/preservation or complete SPEC-0010. |

## Accepted deferred failures and non-goals

The reviewer independently confirmed these six paths remain in source; they
were not all re-exercised in a browser this round. “Deferred” records a real
known limitation, not a pass or an integration fix.

| ID | Status | Remaining behavior |
|---|---|---|
| D1 | Explicitly deferred | Net-clean guarded draft can remain stale after selected-page Revert. |
| D2 | Explicitly deferred | Quiz deletion can bypass unresolved Save conflict. |
| D3 | Explicitly deferred | Empty protected TOC offers a run that silently skips. Its empty content remains preserved. |
| D4 | Explicitly deferred | AI edits can append unnecessary unchanged page-sectioning versions. |
| D5 | Explicitly deferred | Discard can leave a stale Save-error banner. |
| D6 | Explicitly deferred | “Adjacent page no longer exists” remains untranslated. |

Merged SPEC-0001's ratified deferrals remain: positional activity-ID carry-over;
ownership/history repair including K3 pruned-element legacy cases; staged
Speech publication between synthesis and Word Highlighting; provider-wide
preparation failure classification in SPEC-0013/#889; bulk review, projection
optimization, Storyboard no-op short-circuit and other Note 7 follow-ups;
historical blank-ID repair and uncertified pre-schema-14 books. Performance
#995/#996/#997 are not implemented here. Necessary restore/publication integrity
checks remain.

Also excluded: full Storyboard-rerun preservation under #144, new page/section
regeneration, broad Sectioning-mode lifecycle, a fifth Easy Read ownership
slice, general CLI preservation/resume and speculative cleanup. Current shared
Easy Read functionality is preserved but not claimed as a new SPEC-0002 slice.

## Commands and results

All commands ran in `tmp/spec-0002-implementation` unless stated otherwise.
Git-dependent checks used `DEVELOPER_DIR=/Library/Developer/CommandLineTools`.
Local raw artifacts are under `.local-docs/spec0002-develop-oct26/` in the main
repository (ignored, outside Git), with distinct checkpoint exports. Exact
logs and probe scripts remain there for owner inspection.

| Command / check | Result |
|---|---|
| Original 09f0d1c7 `pnpm build`; four focused files via Vitest | Passed build; 64 tests. Original baseline preserved before integration. |
| `pnpm install --frozen-lockfile` | Passed online; initial offline cache lacked a required tarball. |
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test --maxWorkers=2` | **388 files, 4,729 tests passed**, including pretest build. `logs/full-final.log`. |
| `node node_modules/vitest/vitest.mjs run apps/api/src/routes/manual-edit-survival.test.ts --maxWorkers=1` | **42 tests passed** after the two additional independent-review regressions. `logs/independent-regressions-final.log`. Full-suite total above predates these two test-only additions; it is not a claimed 4,731-test full run. |
| Independent `node node_modules/vitest/vitest.mjs run --config <local evidence>/independent/probe.config.mjs` | Three adversarial probes passed; original R1 failing reproduction retained separately. |
| `pnpm typecheck` | Passed, final root strict build check. |
| `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm lint` | Passed, zero errors and eight unused-disable warnings. No new claim here that every warning was baseline-verified. |
| `pnpm build` | Passed; root TS and reader builds, also in final pretest. |
| `pnpm --filter @adt/studio extract` | Passed, 3,831 messages per locale, zero missing across en/pt-BR/es/fr/sq. |
| `pnpm --filter @adt/studio exec lingui compile --strict` | Passed five catalogs. |
| `git diff --check` and develop-to-head diff check | Passed. No standalone invariant-check script exists in the package scripts; invariant-related regression files run in the full suite. |
| `node scripts/probes/spec-0002-compatibility.mjs --baseline /Users/ksokolovic/Development/adt-studio/tmp/spec-0002-evidence/compat-before` | Passed actual built-old-API reads, preview, export and current reopen; four units' authorship/IDs/history unchanged. |
| `pnpm --filter @adt/desktop build:unpack` | Passed macOS arm64 unpacked package, including Studio build and actual API/resources bundle. Ad-hoc signing; no notarized/signed-release certification. |
| Packaged API `node <app Resources>/api/api-server.mjs`, isolated books and resources | Three fixture preview/export checkpoints before/after controlled restart passed. ZIPs contain 94, 94 and 63 members; CRC valid and every member byte-identical across restart. Actual Electron GUI not exercised. |
| `docker build --target app -t adt-spec0002-oct26:local .` | **Failed** at Debian apt signature verification during Playwright system-dependency installation. Docker VM disk also observed at 100%; it is a plausible contributor, not a proven cause. No pruning of unrelated images or signature bypass. Combined Docker runtime/export/restart **blocked/not run**. |
| Hosted exact-head CI | **Not run**: local-only authorization, no pushed head. Historical CI is not combined-branch evidence. |

Initial integration failures were diagnosed rather than declared pre-existing:
missing version guards in older fixtures; source-receipt first-empty output
regression; restore/UI acknowledgement conflicts; absent ApiError in a test
stub; old CLI fixture cardinality; and authored-section fixture schema/ownership.
Production conflicts were fixed; fixtures now exercise the intended current
contracts. Final suites above supersede those failed intermediate runs.

## Real journeys and persisted-output checks

PROJECT_ROOT, API, Studio, reader and packaged resources were pinned to the
tested checkout. BOOKS_DIR contained fresh disposable copies, never user
originals. External providers were blocked by a controlled transport returning
synthetic responses/audio; no paid generation calls were made. Stub model,
adapter/cache and HTTP transport counts are identified separately.

- **Cosmetic Storyboard Save:** color/spacing/image size persists through reload,
  actual embedded Preview and downloaded Web ZIP; catalog outputs exactly equal
  before/after, zero transport calls.
- **TOC identity recovery:** pending indent for Chapter A, independent replacement
  with Chapter B reusing toc_001, rejected Save and preserved draft, explicit
  whole-document decision, next Save. Separate two-browser edit sequence merges
  unrelated title/indent changes without losing either. History retains both
  writers. Reader menu then navigates to the correct chapter text.
- **Combined HTTP replacement:** real running API, both manual pages and whole
  manual TOC named by version, Sectioning → TOC stage range, two Sectioning
  transport calls and exactly one TOC transport call, new AI TOC and retained
  manual versions. Competing writer refusal is covered by the separate real
  SQLite HTTP regression, not falsely claimed as a second browser run.
- **Scoped text change:** browser Save retains manual French and unaffected
  neighboring content/signatures, makes no provider call; UI Easy Read,
  Translation and Speech runs preserve protected work; repeated Speech makes
  zero new transport calls; Preview and downloaded ZIP succeed.
- **Preparation failure/retry:** browser text change, controlled preparation
  failure, usable display-text speech and retained manual French; repeated runs
  make no new calls; explicit retry makes exactly one preparation call and no
  audio/timing calls when outputs match. Preview/export succeed.
- **Glossary/image membership:** real browser definition and image edits preserve the glossary ID and unrelated Easy Read outputs; the new caption becomes Missing, then UI caption/translation/speech runs and Preview/export succeed without inventing unrelated consumers.
- **Quiz edit/rerun/scoring:** actual editor Save, two real HTTP ordinary quiz reruns, exact protected quiz/option identities and content, retained manual history, zero transport calls. The built Preview reader correctly scores the saved correct option. Book aggregate versions advance 3 → 5 while the protected quiz stays exact; no claim of unchanged aggregate metadata.
- **Selected-page Revert:** HTTP-seeded manual edits on two pages, actual browser Cancel then Confirm; the selected page restores its highest earlier explicit AI record, manual history remains, neighboring page is byte-for-byte unchanged and transport calls stay zero.
- **Packaged restart:** cosmetic, recovered TOC and fixed-layout fixtures read
  through actual bundled API and resources; stable rendered owner URL, current
  state, ZIP CRC/content and all member bytes checked before/after restart.

The source fixture's pre-edit preparation warnings were recorded. The scoped
probe initially assumed no such existing warnings; it was corrected to compare
new warnings against the saved baseline, while still requiring only upstream
warnings on unaffected neighbors. Failed fixture/harness attempts remain in
logs. A first cosmetic attempt used already-edited content and could not Save;
a fresh copy corrected that setup. The combined transport harness initially
omitted intermediate generator responses and one run used a wrong config path;
its final complete run supersedes those harness failures. The quiz probe also initially selected cards by persisted ID rather than the UI index, assumed whole-aggregate equality, and expected a Submit button despite standalone immediate scoring. Those assumptions were corrected against source and the independent review; the final complete reader journey above passed. These intermediate attempts were not
relabeled as product passes.

Other UI edge cases have mounted-component/HTTP evidence rather than new real
browser reproductions in this round: remaining quiz reorder/scoring permutations,
every Sectioning failure/revert/busy path, all deferred failures, and every
legacy locale/pending-save variant. No claim is made that an automated count
substitutes for private historical-book acceptance or the complete release
journey matrix.

## Independent review and downstream implications

A separate reviewer built its own requirement/history map from the original
specification, complete feedback and frozen heads, then reviewed the whole
final develop increment and public entry paths. It inspected UI/API admission,
worker/publication, persisted state and ownership/read/output behavior, not
only this evidence table. It reproduced R1 before the fix and rechecked the
three adversarial paths after the fix. Its final assessment reports no further
confirmed material in-scope defect, with the deferrals/platform limits above.
Reports and independent inventory/probes are in the local `independent/` folder.
The final test/evidence delta recheck found no remaining material overclaim after correcting AC-16 wording to distinguish fresh quiz IDs from proven unchanged Sectioning IDs. A later independent comparison confirms the existing quiz aggregate timestamp/version update is separate from the protected individual-quiz unit; it is disclosed here, not optimized away.

Future publication needs an owner-authorized push/remote base change to develop,
a fresh remote concurrency check and exact-head hosted CI. The local rewrite
must be published using force-with-lease against the then-verified remote head,
if still necessary. Downstream SPEC-0003 and other stacked work must reconcile
against this develop-based history rather than merge descendants back into it.
The narrow null correction is shared compatibility groundwork, not completion
of SPEC-0003's lifecycle. Keep the protected-quiz incomplete-output receipt
behavior when adapting downstream generator changes.

No unresolved product decision was silently substituted. The narrow prerequisite
was explicitly authorized; the six known failures and ratified legacy omissions
remain accepted qualifications. Within that agreed scope the implementation is
ready for owner review of the local changes. Docker and private/release
acceptance remain concrete outstanding verification, not hidden blockers caused
by SPEC-0001 approval or merge status.
