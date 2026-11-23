---
id: SPEC-0003
title: Sectioning modes — B1 generation preferences and safe publication
status: approved
owner: "@ksokolovic"
approvers: ["@gbergengruen"]
issues: ["#708", "#1214"]
prs: ["#884"]
adr: "docs/DECISIONS.md#025-sectioning-generation-preferences-scoped-reset-and-per-page-publication"
created: 2026-09-22
updated: 2026-11-23
---

## Approved product amendment

[The October 12 consolidated review](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5486273946)
and [September 30 product decisions](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5368403884)
replace the former persisted-cardinality/lifecycle contract. The owner explicitly
authorized these amendments and implementation before formal approval.
[@gbergengruen approved the amended contract on November 18](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5957765294).
This is specification approval, not PR approval or release verification.

**By Page controls Sectioning generation, not saved content.** Issue #666 reported
accepting multiple generated sections. Merged #692 fixes that generation/cache
boundary. #708 broadened it into a persisted-content restriction, preventing
intentional editing and usable older books. The authorized #708 amendment is recorded
here and in the [original acceptance-criteria mapping](#original-acceptance-criteria-mapping):
replace its blocking criteria with generation validation, informational preference
tracking, missing-only ordinary Sectioning, explicit reset/replacement and
incremental Storyboard publication. This contract supersedes the original
mode-invalidation and saved-cardinality requirements.

SPEC-0003's B1 scope stays Dynamic/By Page. B2 modes and automatic cross-page merge
remain deferred; manual structural editing remains supported. Roadmap/SDD stable
editing/history and review principles remain firm references, reconciled with
these newer product decisions and the owner's sequencing override.

## Prerequisites and policy refinement

SPEC-0003 builds on merged SPEC-0001 #879 and approved SPEC-0002 #880 on develop.
Their integration does not approve SPEC-0003. Reuse their admission, ownership,
guarded drafts, source tracking, versioned transactions and recovery.

The shared early safety check must run before reset/provider work. Recovery requires proof
of the original identity-bearing record and preservation of damaged evidence;
an older valid selected version alone is insufficient. The owner authorized exact-byte physical restoration with an immutable damage
audit as a narrow exception to the no-overwrite rule. This does not approve the
specification.

This deliberately refines SPEC-0002 AC-8/15: **all existing Sectioning is kept by
ordinary runs**, including AI pages. Revert manual edits still restores the
chosen saved AI version, but does not authorize subsequent automatic replacement.
Explicit replacement names exact page and current rendering/tree versions, and
includes consent to resetting active Storyboard (manual edits included). Other
entities keep SPEC-0002's ordinary replacement policies. Do not alter shared
translation/quiz/TOC behavior or modify sibling PRs silently.

Carry SPEC-0001's ratified legacy-owner qualification: unverifiable or contradictory
rendered ownership stays in raw storage/history/assets, is omitted from
preview/export with a warning, and is never inferred from array position or moved
leaves. Ordinary missing authorship alone does not omit usable content. The
original unrestricted legacy guarantees remain qualified. The merged narrowly
mutually unique legacy-leaf and historical fixed-layout projections remain
accepted compatibility assumptions; contradictory explicit ownership never falls
back to inference. Read projection is not historical reconstruction or freshness
certification. Capture projected owners against the pre-edit tree on writes. Keeping this safety rule is independent of removing mode gates.

## Product and transaction contract

### Preferences and older books

Compare effective mode through the execution config resolver (absent means
Dynamic; removing a book override reveals the inherited setting). Validate with
shared Zod schemas before mutation. Selecting a preference starts no generation,
changes no entities/assets, and does not make usable output stale or inaccessible.
An informational changed/unknown indicator is separate from attempts and actual
content coverage. External/inherited changes use the same projection. Confirm/cancel
copy must describe preference only; explicit replacement is a separate action.

Missing, old or unreadable lifecycle bookkeeping is unknown information, never
an initialization prerequisite. Reads do not manufacture generation provenance.
Keep durable configuration journaling and recovery of earlier journal formats;
new preference saves do not erase completed attempts or content freshness.
The known persisted legacy mode `section` resolves to Dynamic, including global
inheritance and Settings responses, without rewriting YAML on open. New saves
still accept only `dynamic` or `page`; unknown persisted values remain errors.

### Sectioning selection and explicit reset

Ordinary runs fill missing pages and preserve every existing Sectioning record,
including empty, manual, unknown and AI records. An unreadable existing record
must be reported/retained, not guessed missing. Scope uses extracted source pages
and actual part windows, not inferred contiguous PDF page numbers.

Replacement is a distinct opt-in, off on every dialog open. Show affected page
IDs/numbers and exact Sectioning, rendering, render-tree and editable-activity versions. Explain that
current Storyboard for those pages, including manual edits, must be rebuilt.
The request carries the frozen named snapshot plus a receipt for the book,
effective configuration and persisted page window. The receipt binds the selected generation inputs, including image decisions and extracted image identities, and the outline or the inputs from which this run must rebuild it. A newly selected input needs fresh consent. A run may use its own successful outline rebuild only after checking that the reviewed inputs are still selected. Settings Save & Re-run first
asks before saving; cancellation there changes nothing. If its acknowledged Save
changes the receipt, show a second fresh default-off replacement confirmation.
Cancelling that second dialog retains saved preferences but resets no content and
starts no generation. If only saved entity versions change, retain the original
frozen versions so admission rejects the conflict; never silently refresh consent. Reject stale, duplicate, outside-
window or otherwise invalid consent before provider calls/reset; revalidate queued
work when execution begins and inputs again at publication. Ordinary missing-page
work must not broaden replacement to other existing pages.

**Reset commit boundary:** after valid explicit consent and successful execution
admission, before any generation, one SQLite transaction deactivates the named
pages' active HTML, positioned trees and editable activities using versioned null records and clears
only the affected completion claims. Do not delete history, physical media or
Sectioning. Cancel before confirmation/admission changes nothing. After commit,
the reset is intentional and survives cancellation, failure or restart; old
Storyboard stays recoverable in history, not active input. SQLite transaction
rollback leaves the SQLite reset unchanged. Completion invalidation also writes
`.sectioning-lifecycle.json` before deleting completion records; a later SQL
failure may leave that informational readiness conservatively stale. It never
certifies old output as current. No second reset journal is needed: SQLite owns
entity/selection atomicity and lifecycle state is informational. The configuration
journal remains for cross-file/database recovery of configuration transitions.

Editable activities are part of that page's Storyboard reset, including enabled
step-by-step answers. Bind their selected version to consent and reject stale
editor saves using the draft's captured activity version. An old same-index,
same-type activity must never become current for a regenerated semantic section.
Compare the actual downstream generator inputs through SPEC-0001's shared source
tracking in this transaction; retained Glossary/Quiz output needs review when its
input disappears, independently of cleared execution attempts.

Generate each selected page through #692's existing validator/cache/retry path.
Publish successful Sectioning using SPEC-0002's guarded per-page transaction,
retiring identities/references only with that new semantic version. Failure or
cancellation before a page publishes preserves the previous authored Sectioning
unit and its identities; it does not undo the separately confirmed Storyboard
reset or claim a completed new book. Successful pages remain committed. Same-run
TOC consent propagation remains exact and cannot follow an external change.

### Rendering and structural edits

Render the current valid saved tree in either mode, including manually split,
added, cloned, merged or deleted sections. Section counts may be informational
warnings with bounded page lists; they never gate rendering. Missing/unreadable
page input is reported individually and unrelated pages continue. Keep actual
input-integrity, HTML, reading-order and accessibility validation/retries.
Reflowable rendering uses the saved semantic tree. The established fixed-layout
renderer continues using the saved positioned PDF inputs and publishes its
positioned tree with HTML; accepting arbitrary semantic counts does not promise
that a semantic split changes PDF geometry or produces separate fixed pages.

An unreadable historical payload cannot safely supply spent identities for
replacement. Check the shared reservation history before Sectioning reset or
provider work, and again at execution/publication. Merely selecting an older
valid version is not proof of identities reserved by the damaged version.

**Verified history recovery (owner-authorized; approved November 18):** capture original
identity-bearing payloads with their book, node, item, version, insertion
incarnation and byte digest. Recovery is a separate explicit inspect/confirm
operation using shared writer admission and one SQLite transaction. Restore only
an exact pre-damage witness; retain the damaged SQLite type/raw bytes and witness
in an immutable audit. This narrow physical-restoration exception does not permit
arbitrary entity edits, guessed IDs, silent history deletion or inferred ownership.
Keep versions/authorship; append a byte-equivalent current version only when the
repaired version was selected, so old editor baseVersion guards reject. Retired
versions never become current through repair. Bind consent to the book, exact
observed damage, witness and current versions; reject stale/cross-book requests,
and make identical retries idempotent. Recovery changes existing admission and
package proofs but grants no regeneration or freshness acceptance.

If trusted evidence is missing, contradictory or corrupt, refuse affected
ID-allocating work before reset/provider calls while retaining usable output.
Unexpected missing rows are not repaired by guessing. Safely witnessed intentional
retirements still reserve their identities through the existing factories.
Healthy unrelated Storyboard work and genuine no-op Sectioning retain access.
On 2026-11-04 the owner delegated the outstanding older-build compatibility
decision; the selected amendment automatically checkpoints readable, previously
untracked identity history once on the first ordinary book access. Startup
interrupted-step housekeeping only updates existing telemetry; it neither installs
history tracking nor marks legacy capture complete. Tracking installation, exact-byte witnesses and the completion marker commit together.
Capture does not change entities, current selections, assets, freshness, or
regeneration consent. Malformed rows remain unverified without preventing capture
of readable siblings. Existing proof is never replaced; tracked changes and later
older-writer records still require explicit checkpointing. Neither automatic nor
explicit capture can prove already corrupt or missing history. Recovery and
regeneration remain explicit. No new freshness system, lock or schema-version
bump is introduced.

Integrity-object loss must remain detectable across reopen: installing missing
tables/triggers is not evidence of uninterrupted tracking. Refuse recovery,
checkpoint and identity allocation after such loss; keep ordinary usable reads
available. After this initial capture or a healthy explicit checkpoint, sequential
older-build deletion/clear keeps verified identity reservations and must not be
refused after that build has already deleted its image files. This is identity
continuity, not undo of an intentional destructive action or backup of its media.
It cannot protect rows created and deleted wholly by an older runtime, nor
already lost evidence. Noncooperating concurrent old runtimes remain outside the
existing shared-admission guarantee. The implementation and bounded recheck of
this amendment are recorded in the local review ledger.
Part import validates source continuity before target mutation and preserves
retired source identities in the existing reservation history. Inspection uses
bounded, incremental reads; scoped allocation must not load unrelated payloads.

Structural operations use stable ownership when retaining rendering. Historical
HTML is not current input after reset and cannot be reassigned by index. Keep
index bounds validation, entity/answer/catalog identities and physical assets.
Do not reset a book for routine structural edits or an ordinary Storyboard rerun.

Ordinary Storyboard publishes each successful **page** immediately, including
first generation. In one transaction pair its HTML and correct semantic/positioned
render-tree selection. Publish before progress makes the page available/clickable.
A later failure, Skip or cancellation keeps already-published pages; a failed
page in a same-layout rerun keeps its previous active pair.

Only an actual fixed/reflowable layout switch uses whole-active-window all-success
publication. Compare the actual existing output layout, not a generation mode or
lifecycle flag. A targeted task cannot switch a subset into mixed layout. Missing,
failed, skipped, cancelled or stale required input leaves the old layout pair
active and reports the incomplete switch. No previous active output means first
generation, which is incremental. Successful fixed → reflowable publication
deactivates positioned trees transactionally and retains their history.

### Coverage, output readers and coordination

Derive completeness from actual included sections with safe owned, usable HTML,
not a page-ID set, a lifecycle flag, a successful patch or retained package files.
A targeted patch must not complete a book with other included output missing.
Library/sidebar/stages/preview/export distinguish usable partial output from
complete coverage. Genuinely missing output and inherited ownership safety remain
visible; removing mode/provenance gates must not certify incomplete packages.
Compatible downstream freshness warnings remain usable under SPEC-0001. Package cache hits and new builds must validate the mandatory part window. A failed build must leave the previous published directory intact. Source coverage alone does not prove that a bundle can be read; the bundle itself is checked.

**November 15 packaging amendment (product-owner decision; approved November 18):**
packaging fails gracefully, subject to retained ownership proof and the accepted
D2 identity-loss limitation below. A build or download is otherwise refused when the bundle
could not open at all: a missing or unreadable page document, page list, entry
file, language dictionary, reader script or page-shell stylesheet, or, in a
derived format, an unreadable package, navigation or media-overlay document.
Anything short of that is repaired or reported, never refused:

- **Repair on write.** Writers remove or normalise what the target format cannot
  hold (characters XML forbids, `xlink:` attributes without a namespace, comments
  containing `--`) instead of emitting a file a strict reader rejects.
- **Missing content resources are warnings.** A resource that book content
  refers to but the bundle lacks (an image, media file, font, narration file, or
  a stylesheet linked from a page body) leaves a gap on that page only. The build
  succeeds and replaces the previous package, and a `missing-asset` packaging
  warning names the page, the document and the reference. The warning is stored
  with the build and repeated on cache hits. Status and downloads accept such a
  bundle. A Preview build that reported no such warning is still held to the full
  check, so a resource that later disappears from the bundle is restored by a
  rebuild.
- **Unreadable content styles contribute nothing.** CSS inside book content that
  cannot be parsed is ignored, as a browser ignores it; it does not refuse the
  page it styles.
- **One bad page does not withhold a book.** A book page of a derived export that
  is not well-formed is delivered with the rest of the publication. EPUB
  preparation reports an `unreadable-page` warning naming each affected document
  after format repairs; Studio shows it before sharing.
- **D2: missing persistent book identity remains a narrow export limitation.**
  Live Preview and project backup remain available, but formatted packaging and
  downloads refuse when the persisted book UUID is unavailable. Two absent UUIDs
  do not prove common origin; a receipt with a null identity cannot authorize a
  retained package. Existing artifacts remain intact. ID-allocating work stays
  refused as specified under verified history recovery.

No reference is followed outside the bundle in any mode. This amendment replaces
the earlier sentence that required every referenced file for a complete download.

Use the existing shared writer gate and per-page input/version revalidation.
Remove redundant SPEC-0003 locking/lifecycle enforcement; do not introduce a second
in-process lock. The literal earlier in-process-only suggestion conflicts with
supported prerequisite cross-process writers: replacing their gate permits lost
updates. The smallest safe reconciliation is to retain that shared guard and add
no extra lock subsystem. Preserve the final prerequisite's Linux incarnation,
namespace/container proof and recovery-sentinel safeguards.

**November 2 recovery correction (owner-authorized implementation; approved
November 18):** an independent real HTTP/SQLite reproduction showed that a live reader
without a writer lease can hold the anonymous WASM mutex while startup removes it.
Note 7 B6's absence-of-live-writer assumption is insufficient. Extend the same
shared lease to every database opener, including nonmigrating schema and extraction
reads, for the complete connection and prepared-statement lifetime. Same-process
read borrowing must not grant writer-operation authority or block ordinary
published-page visibility. Independent processes must honor the shared admission.
Register exact database filenames durably before opening them; only a registered
mutex of a proven-dead coordinated owner may be recovered. Unknown/legacy mutexes,
ambiguous process identity, unregistered paths and interrupted recovery retain
evidence and fail closed. Never delete locks by timeout, delete WAL/journals, or
claim a successful close while outstanding statements can still use SQLite.

**November 11 crash correction:** publish complete reservation and lease records
atomically. A reservation with a proven-dead creator can have one exclusively
claimed successor; competing reapers must not unlink and recreate its admission
boundary. Revalidate the original reservation before changing any owner or mutex,
and atomically retire that boundary before cleaning completed records. Interrupted
capability registration retains a complete prior or next lease. Anonymous legacy
reservations and unverified records remain preserved and refused. This extends
the same admission protocol; it grants no content or freshness authority.

This guarantee requires cooperating updated runtimes. A concurrently running older
build or raw SQLite client that ignores shared admission is unsupported; bounded
old-build readability on isolated copies is unchanged. A capability record does
not prove ownership against those uncoordinated processes. Startup must use the
single shared recovery boundary rather than separately deleting mutexes.

Expanded existing-book CLI resume is deferred to SPEC-0010. Preserve fresh CLI
execution and its validator/publication integrity, and safe refusal before
mutation/provider calls for unsupported existing-book runs here. Inspect #886 and
#888 for focused reuse with attribution; never merge descendants into this PR.
The Studio/API Extract re-runs of the [Extract re-run amendment](#extract-re-run-amendment--proposed-2026-11-23)
(RAC-20–24) apply only to a book that holds nothing but Extract output. They are
not a downstream resume and add no CLI path.

All remaining user-visible HTTP/SSE codes and parameters have common localized
Studio handling in en, pt-BR, es, fr and sq. Obsolete mode-gate errors are removed.

## Revised acceptance criteria

### November 17 recovery and repair clarification (owner-authorized; approved November 18)

Stranded books with unverifiable or legacy lock owners have an explicit **Recover
a copy** action. Refuse known-live owners. Preserve the original directory and all
lock evidence, copy to a new user-visible label, verify source stability and the
copied SQLite database, and retain quarantined lock evidence plus an audit in the
copy. Incomplete copies remain hidden/refused. This does not silently unlock the
original, delete ambiguous locks by time, or make noncooperating writers safe.
The owner explicitly accepts that a same-host lease with a currently live PID
and no verifiable process-incarnation evidence also refuses copy recovery, even
when that PID may have been reused after reboot. This includes current
macOS/Windows leases as well as legacy leases. File timestamps do not authorize
an override. This narrow limitation was accepted on November 17, 2026; it does
not itself grant formal non-author approval. The November 18 review subsequently
approved this contract; PR acceptance remains separate.
Valid explicit configuration repairs preserve the invalid original YAML inside
the book and revoke readiness conservatively, without generation or content reset.
Generation guards compare relevant settings; unrelated downstream/scheduling
settings do not invalidate Sectioning or Storyboard results.

### Criteria

Original AC-1–26 are preserved and individually mapped below. Checkboxes remain
unset pending final PR approval; the reviewer's accepted live/test evidence is
recorded under Approval and remaining follow-ups. Passing verification alone does
not grant approval.

- [ ] RAC-1 Generation/cache validation in By Page rejects/retries anything other than one section; valid cache reuse remains unchanged with transport counts.
- [ ] RAC-2 Both modes render valid saved trees of any section count, including manual edits, without an unrelated targeted-render blocker.
- [ ] RAC-3 Missing/old lifecycle permits older-book read/render/export without initialization, AI calls on read, content changes or invented provenance.
- [ ] RAC-4 Missing/unreadable page input is reported per page; unrelated runnable pages complete in both layouts and active part windows.
- [ ] RAC-5 Ordinary Sectioning fills missing pages only; all existing records and unaffected pages/versions/assets remain unchanged.
- [ ] RAC-6 Explicit replacement is default-off, lists exact affected versions, and rejects stale/invalid consent at immediate and queued execution before reset/calls.
- [ ] RAC-7 Confirmed reset deactivates scoped active Storyboard transactionally, preserves histories/assets and previous authored Sectioning on failed/cancelled generation, and remains truthful after crash/restart.
- [ ] RAC-8 Dynamic → By Page and reverse, explicit regeneration → split/add/clone/merge/delete → Storyboard succeeds without positional reuse of old HTML; Cancel changes nothing.
- [ ] RAC-9 Fresh and same-layout Storyboard publish each successful page and HTML/tree pair immediately; API and Studio expose the first page while the next is slow.
- [ ] RAC-10 Later failure, Skip or cancellation keeps published pages and a failed same-layout page's prior output; stale publication changes nothing.
- [ ] RAC-11 Actual layout switches publish the full active window atomically, including fixed-tree deactivation; partial/targeted/failed switches retain the old layout.
- [ ] RAC-12 Partial section patches cannot claim full included-output coverage; reset old HTML/history cannot establish new currentness or package completeness.
- [ ] RAC-13 Preview/export retain usable content regardless of preference/lifecycle, keep inherited owner warnings and genuinely missing-work handling, and agree with library/sidebar/stage coverage.
- [ ] RAC-14 Effective preference changes/removal/inheritance are consistently informational; unrelated/no-op/cosmetic saves preserve content freshness and completed attempts, Extract and bytes.
- [ ] RAC-15 Shared writer/version guards prevent competing immediate/queued/targeted publication; config journal/reset recovery retains evidence and never deletes ambiguous locks by timeout.
- [ ] RAC-16 Remaining UI/HTTP/SSE errors and parameters translate in all five locales; obsolete restrictions/errors are removed.
- [ ] RAC-17 Fresh CLI/DAG remains safe; expanded existing-book resume is deferred/refused here, except the Studio/API Extract resume, retry and replace of RAC-20–24; the CLI refuses every existing book. No B2 modes, automatic merge, new dependency or competing freshness/lock subsystem.
- [ ] RAC-18 Inherited authorship, draft, restore, stable ID/audio/TOC-consent, current-read and scoped cache guarantees survive integration, subject to the explicit legacy-owner qualification.
- [ ] RAC-19 Subject to ownership proof and D2, packaging and downloads refuse only a bundle that could not open. A missing content resource, unreadable content styles or characters the format cannot hold produce a built, downloadable bundle; missing resources are named in a `missing-asset` warning that survives cache hits. EPUB preparation warns about unreadable page documents without dropping their content. Missing persistent book identity refuses formatted export while retaining live Preview, project backup and existing artifacts. No reference is followed outside the bundle.
- [ ] RAC-20 Extract runs again on an existing book only while the book holds nothing but Extract output and pre-Extract configuration (an *Extract-only book*). Any Sectioning or later output, current or historical, any downstream attempt record, media, identity-history record, part ledger, imported source or unrecognized file or table refuses the run before any change or provider call, with the existing code and message. CLI/DAG runs and direct extraction admission are unchanged.
- [ ] RAC-21 Resume: when extraction is complete, or an older book has pages and no extraction record, and the Extract stage is not complete, only the steps that are not done or skipped run, on the existing pages. Nothing is cleared, the PDF is not read, existing page image lists are not rebuilt, and pages already segmented or cropped are not processed again.
- [ ] RAC-22 Retry: a failed, cancelled or interrupted extraction is discarded and extracted again with the current settings. From the first change until the new extraction completes, the book carries an extraction record that is not complete, so a crash, failure or cancellation at any point leaves a book that can be retried. A missing or changed source PDF or an invalid page window is refused before anything is discarded.
- [ ] RAC-23 Replace: a complete extraction is replaced only after an explicit confirmation that states what is discarded, bound to the current extraction. A stale request, a request on a part book, or one that would wait behind other work is refused and changes nothing. The source PDF, configuration, fonts, typography, prompts, LLM cache, LLM log and project identity are kept.
- [ ] RAC-24 Step status reports which of resume, retry and replace are available for the book, and the reason when none is. Studio offers exactly those, lets Extract settings be saved without starting a run, shows the page list again after a refused or failed run, and translates every new text in the five locales.

## Original acceptance-criteria mapping

The authorized amendments replace the original behavior where marked revised or
superseded. This mapping preserves requirement traceability; it is not a test
report or an approval of superseded gates.

| Original criterion | Disposition → revised criterion |
|---|---|
| AC-1: Dynamic to By Page invalidates Sectioning and every downstream step. | Revised → RAC14 |
| AC-2: By Page to Dynamic invalidates the same dependency closure. | Revised → RAC14 |
| AC-3: Extract completion and extracted data remain unchanged. | Retained → RAC14/18 |
| AC-4: Every existing content version and referenced media byte survives a mode change. | Retained → RAC7/14/18 |
| AC-5: Saving an unchanged effective mode causes no invalidation. | Retained → RAC14 |
| AC-6: An unrelated config edit causes no mode invalidation. | Retained → RAC14/18 |
| AC-7: A mode transition during active/conflicting work returns 409 with no mutation. | Shared guard retained → RAC15 |
| AC-8: Studio confirms a transition when retained or completed downstream output exists. | Revised → RAC6/14 |
| AC-9: Cancel leaves configuration unchanged and sends no mutation request. | Retained → RAC6/8 |
| AC-10: A failed update restores/refetches the persisted selection and surfaces the error. | Retained → RAC14/18 |
| AC-11: Successful transitions refresh config, debug config, step and relevant page/stage state. | Revised → RAC-12/13/14 |
| AC-12: By Page preflight rejects a missing latest Sectioning result. | Superseded → RAC4 |
| AC-13: By Page preflight rejects zero sections. | Superseded → RAC2/12 |
| AC-14: By Page preflight rejects multiple sections. | Superseded → RAC2 |
| AC-15: Any preflight failure preserves all rendering versions and starts no rendering call. | Revised → RAC9/10 |
| AC-16: Exactly one valid section per source page permits Storyboard subject to other prerequisites. | Retained and broadened → RAC1/2 |
| AC-17: Dynamic mode continues to accept multiple sections. | Retained → RAC2 |
| AC-18: Historical/imported inconsistencies are caught without an observed config transition. | Superseded → RAC3/13 |
| AC-19: API, queued, targeted and DAG/CLI paths enforce the same rule, including fixed layout. | Revised with explicit CLI limit → RAC4/17 |
| AC-20: All new UI copy is translated in the five supported locales. | Expanded → RAC16 |
| AC-21: The implementation adds no dependencies. | Retained → RAC17 |
| AC-22: Effective override removal/default resolution is correct; invalid modes change nothing. | Retained → RAC14 |
| AC-23: Injected file/DB failures and restart at each journal boundary never expose new mode with old current status. | Revised → RAC7/15 |
| AC-24: Admission races and post-preflight edits cannot publish output based on obsolete configuration or section versions. | Retained → RAC6/10/15 |
| AC-25: Errors contain the full failure count and at most 20 displayed page identities, including malformed/null results. | Revised → RAC4/16 |
| AC-26: Invalid cached multi-section responses follow #692's eviction/retry behavior; valid cache reuse remains possible. | Retained → RAC1 |

## Verification

Exercise all nine consolidated-review scenarios through actual public entry points,
real SQLite/filesystem, independent-process faults, stubbed transport counts and
unaffected-scope comparisons. Run focused then full tests/build/root and runtime
typechecks/lint/available invariants; extract and strictly compile five catalogs.
Use representative disposable books, actual browser flows, standard combined
Docker runtime/export/restart in both layouts, and packaged Desktop API/resources.
Separate these from paid providers, signed releases and full cross-platform GUI.

Keep raw logs and review reports outside version control. Record concise commands,
results, tested commits and verification limits in the PR discussion, including
hosted CI for the published commit. ADR 025 follows the approved contract;
independent human PR acceptance remains required.

## Approval and remaining follow-ups — 2026-11-18

[Guillermo's re-review](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5957765294) explicitly approves this specification,
including the recovery-copy/PID qualification, configuration-repair versioning
exception and SPEC-0002 AC-8 amendment. He takes over the outstanding human
re-review under SDD §9. In his [follow-up at `336e78a02`](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5961857461),
he considers elasticsounds' original acceptance items 1–9 covered by the combined
live pass, earlier reviews and RAC-tagged tests, and dismissed the October 12
request for changes. The live pass confirms R6, splitting in By Page, incremental
publication during an ordinary same-layout rerun, retained output after a later
failure, scoped Dynamic-to-By-Page replacement, incomplete partial coverage and
missing-only ordinary Sectioning. It ran on a qa784 copy at `dac4a1684`; the
reviewer explicitly accepts it for `336e78a02` because the intervening eight
commits do not change those paths. Multi-section retry, the reverse transition,
per-page missing Sectioning and the locale walkthrough remain test-backed rather
than newly exercised live. Fixed layout and parts were not run live in that pass.
The remaining asks below and final PR approval are separate from this acceptance
evidence and the approved specification.

The shared busy message and recovery dialog describe unverifiable ownership as
possibly still in use, without asserting a confirmed active writer. They advise
finishing active work and closing other book apps before retrying, then restarting
the computer if necessary. The shared message now directs a persistently blocked
user to **Library → select the book → Recover a copy** before suggesting restart
if recovery is also refused. A lock from another computer may require this copy
workflow; restart is not a universal remedy. The guidance does not relax the
approved live-PID and unknown-owner safeguards.

For his cold-Library performance request, use option **(b)**: Library summaries
reuse only a current, already-verified in-memory Storyboard model. Otherwise,
books with completed Storyboard/package telemetry or a saved package report
`storyboardVerificationPending` and withhold Storyboard, package and Preview
completion. Extracted-only books retain their normal next-step guidance; an
absent package remains known incomplete. Returning to Library through the app
refreshes summaries after detailed book access. Studio labels this state **Not yet verified**
and offers opening the book to verify Storyboard and Preview. It is not known
missing output or a repair instruction. Full book access and actionable
stage/Preview/export paths keep their existing checks. Database changes, selected
page windows and part proof changes prevent stale model reuse. No persistent
summary proof or ownership bypass is added. RAC-13 distinguishes this unknown
summary from both verified completeness and known incompleteness.

PF-1–3 and UX-1 are accepted follow-up work. WIN-1 was a required pre-release gate;
it was run on Windows and accepted by the product owner on 2026-11-22. The
original-book comparison requested for B1 was run on 2026-11-20 and confirmed the
finding; by product-owner disposition its fix is follow-up work, not a merge
condition. Each item has issue tracking:

| Follow-up | Scope and boundary |
|---|---|
| [PF-1 — #1162](https://github.com/unicef/adt-studio/issues/1162) | First detailed book open after each API restart, warm Library, step-status and idle admission/read overhead. The reviewer measured qa784 (175 MB DB) at **2.0 s first open versus 0.007 s on develop**. Finished books show Not yet verified until opened, including after each Desktop launch. Compare exact builds on the same books; retain ownership, actual coverage and same-version external-write invalidation. |
| [PF-2 — #1163](https://github.com/unicef/adt-studio/issues/1163) | Page-list, package-status and packaged-asset overhead. Preserve busy/ownership refusals even for byte-identical application assets; coordinate overlapping page-list work with #996. |
| [PF-3 — #995](https://github.com/unicef/adt-studio/issues/995) | Reuse the existing config/embedded-startup issue for live reader `assets/config.json` work and repeated mounting requests, which can delay activity conflict reloads. This PR exposes pending reload honestly; it does not claim to remove that endpoint cost. |
| [UX-1 — #1164](https://github.com/unicef/adt-studio/issues/1164) | A preserving Move/Remove-from-Library action for an unusable original and a friendlier recovered-copy label/rename workflow. Do not bypass the original's lock or delete its evidence. |
| [WIN-1 / N1 — #1165](https://github.com/unicef/adt-studio/issues/1165) | **Completed and closed on 2026-11-22.** The actual Windows lease smoke test (Windows 11, NTFS, Defender real-time protection on, at `e38a860f8`) passed 150/150 checks on the bare API process and 99/99 on the packaged desktop app: open, edit, kill/restart, preservation and known-live-owner control, with no book left `BOOK_BUSY` and no transient rename error. See the [record](../verification/spec-0003-windows-smoke-2026-11-20.md) and the product owner's [acceptance](https://github.com/unicef/adt-studio/issues/1165#issuecomment-7082529578). Accepted limits: no reboot, installer, signed build or kill during a long pipeline run or export, and no kill isolated during lease release. This was a tracked release gate, not an implemented automated release-workflow check. |
| [B1 — #1166](https://github.com/unicef/adt-studio/issues/1166) | **Confirmed, not resolved.** The matched comparison on elasticsounds' original 102-page, 237-section book was run on 2026-11-20 ([evidence and scripts](https://github.com/unicef/adt-studio/issues/1166#issuecomment-7048664665)): `collectSpentContentIds` takes 3.0 s against 0.88 s on develop `af7972c72`, and `reconcileSectioningIdentities` 2.9 s against 1.75 s per page. The cost follows the number of saved whole-book catalog copies (132 `text-catalog` versions, 74% of one scan), not per-page version depth, and a synthetic book reproduces it, so the original fixture is no longer needed. The fix is follow-up work under this issue. Preserve identity/history verification in it. |

The original-book B1 benchmark and the actual Windows smoke were not part of this
closeout. Both were performed afterwards, on 2026-11-20; the table above records
their results. The approved runtime/admission contract is unchanged. These are
traceable follow-ups to the linked reviews, not newly completed optimizations.
The exact qa784/other reviewer-book measurements are his WSL2 results; local
controlled-fixture timings do not certify those datasets, Electron startup,
Windows/macOS reboot, Docker recreation or signed releases. The accepted direct
`/adt/` redirect for develop-built packages lasts until Studio Preview rebuilds
them; normal Preview rebuild/reopen behavior is unchanged.

## Extract re-run amendment — proposed 2026-11-23

**Status: proposed by @gbergengruen in #1214. Not part of the approved contract
until a non-author maintainer approves it.** RAC-20–24 and the three edited passages
(the CLI-resume paragraph, RAC-17 and the fixed-layout input qualification) are
the whole amendment. No other criterion changes.

### Problem

SPEC-0003 refuses every Extract run on a book that already has pages, and every
stage run on a book whose extraction did not complete. Both refusals are in
`prepareSectioningRun` (`packages/pipeline/src/sectioning-lifecycle.ts`), which
runs before each stage run. The refusal protects downstream work, but it also
applies where there is no downstream work to protect. Checked on develop
`5d3889cb5`:

| Case | State of the book | What happens today |
|---|---|---|
| A | The PDF extraction failed, was cancelled, or the process died: `extraction.json` is `failed` or `extracting`. | Every stage is refused with `EXTRACTION_INCOMPLETE`, permanently. Recover a copy carries the same record into the copy. Studio offers Retry on a book with no pages, and the API refuses it. |
| B | Extraction completed and a later Extract step failed or never ran (metadata, book summary, book outline, the four image passes). | Retry is disabled because the book has pages. If metadata or the summary failed, Sectioning refuses the book too ("Cannot rebuild the book outline before Extract prerequisites complete"). |
| C | Extract completed and nothing after it exists. The user wants a different page range, spread mode, figure-extraction mode or watermark setting. | Refused. The Extract settings stay editable, and "Save & Re-run" is enabled and is the only way to save the General tab. |

In all three the only way forward is a new book from the same PDF. Nothing in the
old book is worth keeping in case A, and in cases B and C the book holds only
what Extract produced.

### Rule

Extract may run again from Studio or the API only on an **Extract-only book**: a
PDF-sourced book that holds nothing but Extract output and pre-Extract
configuration. The check is read-only and fails closed. It refuses when the book
has any of the following:

- a node that Extract does not own, current or historical, other than retained
  configuration (font registry, font assignment, typography, the legacy output
  baseline);
- an attempt record for a step outside the Extract stage;
- a sign-language video, an audio or video file, an identity-history record, or
  an image created by a later stage;
- a Sectioning lifecycle that is marked ready, a pending Sectioning transition,
  a part ledger (split coordinator), an imported-ADT source, or any file or
  table the check does not recognize.

A refused book gets today's `SECTIONING_REGENERATION_BLOCKED` response with
today's messages. Books with downstream work remain the subject of SPEC-0010
and #1211; this amendment does not relax that refusal.

### Three actions

| Action | Offered when | Effect |
|---|---|---|
| **Resume** (case B) | Pages exist, the extraction record is complete or absent, and at least one Extract step is not done or skipped. | Runs only the steps that are not done or skipped, on the existing pages. Clears nothing and does not read the PDF, so it also works on an older book without an extraction record and on a book whose spreads were re-applied. The image passes run only for pages that lack that pass's result. |
| **Retry** (case A) | The extraction record is `failed` or `extracting`. | Discards the failed attempt's Extract data and extracts again with the current settings. |
| **Replace** (case C) | Pages exist, the extraction record is complete or absent, and the book is not a part. | The same reset on a usable extraction. Requires the confirmation below. |

A book in case B is offered both Resume and Replace. A part book is offered
Resume and Retry only: its page window is fixed, and changing its other
extraction settings would make it unmergeable.

A resumed image-meaningfulness pass re-judges the images each page currently
keeps, because that pass leaves no per-page record. A manual keep decision can
therefore be overturned by the resumed pass; earlier versions stay restorable.
Studio's Extract view shows the run card instead of the page grid while the
stage is failed or interrupted, so such edits are not made from there.

### Consent and binding

The run request names the action and the extraction it applies to: the
`attemptId` of the current extraction record, or `null` when the book has none.
A request without that field is refused exactly as today, with today's codes,
so existing callers see no change. A request whose action is not available or
whose `attemptId` no longer matches the book is refused before any write with
`EXTRACTION_RERUN_STALE`. The field is accepted only on a run from Extract to
Extract. Retry and Replace are never queued: if a run is active or queued for
the book, the request is refused.

Studio asks for confirmation before Replace. The dialog states that the
extracted pages, their images and the edits made in Extract (image decisions,
crops, segments, added images, book details) will be discarded, with counts, and
that the PDF, settings, fonts and prompts are kept. Its default action is Cancel.

### Reset order

Retry and Replace run inside one writer lease, in this order:

1. Check the binding and the Extract-only rule.
2. Resolve the extraction inputs as initial admission does: readable PDF that
   matches the project identity, valid page window, mandatory part window.
   A refusal here leaves the book untouched.
3. Write the extraction record as `failed`. A book with no record gets one.
4. Delete the Extract rows in one transaction, then the Extract image files.
   Retained: source PDF, configuration, fonts, typography, prompts, LLM cache,
   LLM log, project identity.
5. Check that the destination holds nothing the new extraction would collide with.
6. Start the new attempt with a new `attemptId` and extract.

From step 3 until the new extraction completes the book has a record that is
not complete, so an interruption at any point leaves case A, which Retry
handles. The book is never left without a record.

### Unchanged

- `extractPDF`, extraction admission, `inspectExtractionDestination` and the
  CLI/DAG path. A direct call still returns `reused` for a matching complete
  extraction and refuses a failed one without clearing it. The reset is a
  separate, explicitly requested operation.
- Every refusal for a book that is not Extract-only, and every existing error
  code and message.
- Entity versioning of downstream content: no downstream content exists on a
  book these actions accept.

Replace deletes Extract's own node history. This is the one place the amendment
departs from "never overwrite": the alternative offered today, a new book from
the same PDF, keeps none of it either, and the action is confirmed and limited
to books with no other content.

### Out of scope

Tracked separately, not changed here: interrupting a running extraction from
Studio's Cancel; re-running only the image passes after changing image filters;
Extract settings saved on an extracted book without re-extracting;
`spreads/apply` leaving `extraction.json` out of date; the Extract stage of a
coordinator after a part merge; a per-page record for image meaningfulness;
any re-extraction of a book with downstream work (SPEC-0010, #1211).

### Rollout

Tracked in #1214. Four implementation PRs, in draft until this amendment is
approved: (1) the Extract-only check and the step-status report, with no
behavior change; (2) Resume; (3) Retry; (4) Replace.

## Test plan

Test titles carry `RAC-n` tags at the relevant behavior boundary. Tags identify
coverage, not human approval. All Vitest files below run under `pnpm test`; API
and pipeline suites use real SQLite/filesystem with deterministic provider stubs.
The existing `i18n` CI job separately checks extraction, lint and strict compilation
of `en`, `pt-BR`, `es`, `fr` and `sq`; English macro-mocked tests alone do not prove
translation completeness or quality.

Admission checks in the export and lifecycle suites assert the typed
`BookBusyError` contract independently of its user-facing wording, while retaining
their content-preservation, no-task-publication and lock-release assertions.

| Criterion | Automated coverage and boundary |
|---|---|
| RAC-1 | `packages/pipeline/src/__tests__/page-sectioning.test.ts`: invalid By Page cache eviction, feedback retry and valid-cache transport reuse. |
| RAC-2/3 | `apps/api/src/services/sectioning-existing-book.test.ts`: older saved trees of varying cardinality, both modes, no lifecycle initialization; history first-open/repair controls remain in storage tests. |
| RAC-4 | Same file's real batch HTTP missing/null/unreadable inputs; fixed inputs and active part windows in `storyboard-publication.test.ts` and `sectioning-reset-readers.test.ts`. |
| RAC-5 | Existing-book mode matrix and `routes/manual-edit-survival.test.ts`: missing-only ordinary runs retain AI/manual/unknown records and neighbors. |
| RAC-6 | Existing-book exact receipts, duplicate/outside-stage/outside-window controls, queued execution and cross-book rejection; Studio replacement-dialog tests cover default-off/cancel behavior. |
| RAC-7 | `packages/pipeline/src/__tests__/sectioning-reset-crash.test.ts` invokes the real reset probe in CI: injected rollback, SIGKILL inside/after commit, retained media/history and ambiguous-lock refusal. Existing-book failure/cancellation tests cover committed reset. |
| RAC-8 | Existing-book Dynamic↔By Page tests exercise explicit regeneration then split, add, clone, merge, delete and Storyboard through actual routes, retaining neighbors/media and rejecting positional reuse. Dialog tests cover cancellation before submission. |
| RAC-9/10 | `sectioning-preflight-runners.test.ts` and existing-book loopback HTTP controls: early page visibility, later failure/Skip/cancellation, stale input refusal and retained previous output. |
| RAC-11 | `storyboard-publication.test.ts`: full-window layout switches, fixed-tree retirement, failed/partial/targeted switch refusal and transactional rollback. |
| RAC-12/13 | Existing-book partial-render test checks page, Library, stage and export disclosure; package/export tests check retained output and bounded owner warnings. |
| RAC-14 | `sectioning-lifecycle.test.ts`: inheritance/override removal, preference/no-op saves, config journal faults and unchanged attempts/content; invalid prior config repair is separately conservative. |
| RAC-15 | Reset crash test, `sectioning-book-writer.test.ts`, `book-recovery-copy.test.ts` and lifecycle tests cover same/cross-process admission, killed transactions/copies, live/unknown-owner distinction and preserved evidence. |
| RAC-16 | `apps/studio/src/lib/sectioning-error.test.ts` checks typed HTTP/SSE mapping and bounded parameters; CI `i18n` verifies all five catalogs. Human terminology, focus/keyboard and translation review remain distinct. |
| RAC-17 | `pipeline-dag-page-range.test.ts`, `cli-invalid-pdf.test.ts` and preflight tests cover actual fresh CLI/DAG windows and existing-book refusal without provider calls/source replacement. B2/automatic merge/full CLI resume remain excluded. |
| RAC-18 | `history-recovery.test.ts`, manual-edit survival, Storyboard draft and editable-activity conflict suites cover exact-byte audited repair, IDs, current selection, successor drafts and full-activity conflict choices. SPEC-0001 legacy-owner and SPEC-0002 D1–D6 qualifications remain unchanged. |
| RAC-19 | `routes/package.test.ts`, `export-service.test.ts`, CSS/resource/XML suites: malformed CSS across build/cache/export and supported import, warning persistence, ownership/path constraints, D2 and `PACKAGE_INPUTS_CHANGED` retaining the old bundle. |
| RAC-20 | *Planned.* New storage predicate tests: an Extract-only fixture is accepted; one case per downstream trace (node, step record, table row, file, image source, part ledger, imported source) is refused. `apps/api/src/routes/stages.test.ts` "rejects unsupported full extraction…" and "blocks unsafe extract regeneration…", `extraction-admission.test.ts`, `sectioning-resume.test.ts` and `pipeline-dag-page-range.test.ts` stay unmodified and green. |
| RAC-21 | *Planned.* Real-storage runner tests with stub providers: only pending steps call a provider, the PDF is not opened, a manual keep/prune decision and existing segments and crops survive, a stale request is refused before any write and a request without the field is refused as today. |
| RAC-22 | *Planned.* Fault injection after each reset step leaves a retryable book; a missing or changed PDF is refused with the failed attempt's data intact; an accepted book passes the post-reset check. |
| RAC-23 | *Planned.* Route tests: old `attemptId`, part book and active-run requests are refused with unchanged bytes; fonts, typography, configuration, LLM log and cache survive a replace. Studio dialog tests cover default-off, cancel and the discarded counts. |
| RAC-24 | *Planned.* Step-status route tests per state; Studio tests for the run card, the settings bar and the page-list cache after refusal and after a failed queued run; CI `i18n`. |

Run `pnpm typecheck`, `pnpm --filter @adt/runtime typecheck`, `pnpm lint`,
`pnpm --filter @adt/studio extract`, `pnpm --filter @adt/studio exec lingui compile --strict`,
then `pnpm test --maxWorkers=2`. Platform-specific skips and their separate Linux
evidence must be reported for the exact tested head. These commands do not certify
Windows, hardened Electron GUI, external LMS/SCORM hosting, signed releases or
non-author specification/PR approval.

### Fixed-layout input qualification

A fixed-layout rerender requires valid current `positioned-text` and `image-filtering` results for each page, with positive finite viewport dimensions. Missing, SQL/JSON-null or unreadable extraction input is not an explicitly empty page. Report it per page and retain that page's previous output; other ordinary-run pages may publish. An actual layout switch still requires every active page. An omitted classification is not a prune decision: every positioned illustration, and every extracted illustration with recorded placement, needs an explicit keep/prune decision. Kept placed illustrations require their draw items and readable book-owned assets. Unused shared PDF resources, derived crop/segment assets and images added to a page from elsewhere in the book do not require positions and do not invalidate an otherwise valid page; a fixed page draws only its positioned items. A validated empty positioned result and empty image classification can represent a truly blank source page. Legacy books with missing fixed inputs remain readable through their safely owned retained output; rebuilding those pages requires restoration of valid input, an explicit Replace while the book is still Extract-only (RAC-23), or the extraction repair owned by SPEC-0010. Do not synthesize a blank success, and do not recommend an Extract rerun once Sectioning or later output exists.
