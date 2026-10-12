---
id: SPEC-0003
title: Sectioning modes — B1 generation preferences and safe publication
status: in-review
owner: "@ksokolovic"
approvers: []
issues: ["#708"]
prs: ["#884"]
adr: "docs/DECISIONS.md#025-sectioning-mode-changes-preserve-content-and-gate-rendering"
created: 2026-09-22
updated: 2026-10-12
---

## Authorized product amendment (review pending)

[The October 12 consolidated review](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5486273946)
and [September 30 product decisions](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5368403884)
replace the former persisted-cardinality/lifecycle contract. The owner explicitly
authorized these amendments and implementation before formal approval. Status
remains `in-review`; no human approval or release verification is inferred.

**By Page controls Sectioning generation, not saved content.** Issue #666 reported
accepting multiple generated sections. Merged #692 fixes that generation/cache
boundary. #708 broadened it into a persisted-content restriction, preventing
intentional editing and usable older books. The proposed #708 amendment is recorded
here and in the [verbatim original-AC mapping](../verification/spec-0003-oct12-audit.md):
replace its blocking criteria with generation validation, informational preference
tracking, missing-only ordinary Sectioning, explicit reset/replacement and
incremental Storyboard publication. The source issue itself is unchanged.

SPEC-0003's B1 scope stays Dynamic/By Page. B2 modes and automatic cross-page merge
remain deferred; manual structural editing remains supported. Roadmap/SDD stable
editing/history and review principles remain firm references, reconciled with
these newer product decisions and the owner's sequencing override.

## Prerequisites and policy refinement

This PR remains stacked on SPEC-0002 #880 `09f0d1c7`, including SPEC-0001 #879
`aefe4185`. Reuse their writer admission, stable ownership, versioned transactions,
protection and freshness; publication does not imply approval. Their evidence is
historical until rechecked on this integration.

This deliberately refines SPEC-0002 AC-8/15: **all existing Sectioning is kept by
ordinary runs**, including AI pages. Revert manual edits still restores the
chosen saved AI version, but does not authorize subsequent automatic replacement.
Explicit replacement names exact page and current rendering/tree versions, and
includes consent to resetting active Storyboard (manual edits included). Other
entities keep SPEC-0002's ordinary replacement policies. Do not alter shared
translation/quiz/TOC behavior or modify sibling PRs silently.

Carry SPEC-0001's legacy-owner qualification: unverifiable or contradictory
rendered ownership stays in raw storage/history/assets, is omitted from
preview/export with a warning, and is never inferred from array position or moved
leaves. Ordinary missing authorship alone does not omit usable content. The
original unrestricted legacy guarantees remain qualified pending ratification or
safe repair. Keeping this safety rule is independent of removing mode gates.

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

### Sectioning selection and explicit reset

Ordinary runs fill missing pages and preserve every existing Sectioning record,
including empty, manual, unknown and AI records. An unreadable existing record
must be reported/retained, not guessed missing. Scope uses extracted source pages
and actual part windows, not inferred contiguous PDF page numbers.

Replacement is a distinct opt-in, off on every dialog open. Show affected page
IDs/numbers and exact Sectioning, rendering and render-tree versions. Explain that
current Storyboard for those pages, including manual edits, must be rebuilt.
The request carries the frozen named snapshot. Reject stale, duplicate, outside-
window or otherwise invalid consent before provider calls/reset; revalidate queued
work when execution begins and inputs again at publication. Ordinary missing-page
work must not broaden replacement to other existing pages.

**Reset commit boundary:** after valid explicit consent and successful execution
admission, before any generation, one SQLite transaction deactivates the named
pages' active HTML and positioned trees using versioned null records and clears
only the affected completion claims. Do not delete history, physical media or
Sectioning. Cancel before confirmation/admission changes nothing. After commit,
the reset is intentional and survives cancellation, failure or restart; old
Storyboard stays recoverable in history, not active input. SQLite transaction
rollback leaves the entire reset unchanged. No second filesystem reset journal is
needed for this database-only transaction. The configuration journal remains for
cross-file/database recovery of earlier transitions.

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
replacement. Report that page individually and require restoration of a valid
historical version; other runnable pages continue. Retain its raw history and
media. An explicitly confirmed reset still has the commit semantics above.

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
Compatible downstream freshness warnings remain usable under SPEC-0001.

Use the existing shared writer gate and per-page input/version revalidation.
Remove redundant SPEC-0003 locking/lifecycle enforcement; do not introduce a second
in-process lock. The literal earlier in-process-only suggestion conflicts with
supported prerequisite cross-process writers: replacing their gate permits lost
updates. The smallest safe reconciliation is to retain that shared guard and add
no extra lock subsystem. A writer death is not proof readers have exited; an
anonymous SQLite mutex remains fail-closed with recovery evidence, never deleted
by timeout. Proven ownership/recovery follows the prerequisite mechanism.

Expanded existing-book CLI resume is deferred to SPEC-0010. Preserve fresh CLI
execution and its validator/publication integrity, and safe refusal before
mutation/provider calls for unsupported existing-book runs here. Inspect #886 and
#888 for focused reuse with attribution; never merge descendants into this PR.

All remaining user-visible HTTP/SSE codes and parameters have common localized
Studio handling in en, pt-BR, es, fr and sq. Obsolete mode-gate errors are removed.

## Revised acceptance criteria

Original AC-1–26 are preserved and individually mapped in the linked audit.
Unchecked boxes retain pending acceptance/review metadata; actual test verdicts
belong in the evidence matrix, not an invented approval.

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
- [ ] RAC-17 Fresh CLI/DAG remains safe; expanded existing-book resume is deferred/refused here. No B2 modes, automatic merge, new dependency or competing freshness/lock subsystem.
- [ ] RAC-18 Inherited authorship, draft, restore, stable ID/audio/TOC-consent, current-read and scoped cache guarantees survive integration, subject to the explicit legacy-owner qualification.

## Verification and publication

Exercise all nine consolidated-review scenarios through actual public entry points,
real SQLite/filesystem, independent-process faults, stubbed transport counts and
unaffected-scope comparisons. Run focused then full tests/build/root and runtime
typechecks/lint/available invariants; extract and strictly compile five catalogs.
Use representative disposable books, actual browser flows, standard combined
Docker runtime/export/restart in both layouts, and packaged Desktop API/resources.
Separate these from paid providers, signed releases and full cross-platform GUI.

A separate reviewer receives original/amended specs, original ACs, both full
reviews and exact integrated heads, builds its own map and adversarial probes,
then rechecks fixes at frozen heads. Preserve PR title/body; publish only to #884,
verify exact-head hosted CI and request @elasticsounds review in a comment. Do not
merge or close source issues. ADR 025 and spec approval remain pending.

### Fixed-layout input qualification (review F7)

A fixed-layout rerender requires valid current `positioned-text` and `image-filtering` results for each page, with positive finite viewport dimensions. Missing, SQL/JSON-null or unreadable extraction input is not an explicitly empty page. Report it per page and retain that page's previous output; other ordinary-run pages may publish. An actual layout switch still requires every active page. A validated empty positioned result and empty image classification can represent a truly blank source page. Legacy books with missing fixed inputs remain readable through their safely owned retained output; rebuilding those pages requires restoration of valid input or the extraction repair owned by SPEC-0010. Do not synthesize a blank success or recommend the deliberately unavailable existing-book Extract rerun.
