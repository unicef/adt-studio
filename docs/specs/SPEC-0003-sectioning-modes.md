---
id: SPEC-0003
title: Sectioning modes — B1 generation preferences and safe publication
status: in-review
owner: "@ksokolovic"
approvers: []
issues: ["#708"]
prs: ["#884"]
adr: "docs/DECISIONS.md#025-sectioning-generation-preferences-scoped-reset-and-per-page-publication"
created: 2026-09-22
updated: 2026-11-03
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

The November 2 integration first reconciled onto develop `f2e59a0d`, which contains merged
SPEC-0001 #879 (squash `c153ba7d`, reviewed head `811d1475`) and approved
SPEC-0002 #880 (final head `89a65f06`). The final refresh also includes develop
`4b9e40cc`'s documentation-only SDD threshold update; runtime behavior is unchanged.
SPEC-0003 previously inherited the obsolete
SPEC-0002 boundary `09f0d1c7`; only its final increment is reconciled onto develop.
SPEC-0002's actual approval is retained. Its merge is not SPEC-0003 approval or
proof of this integration. Reuse the merged admission, ownership, guarded drafts,
source tracking, versioned transactions and recovery; reverify combined behavior.
See the [final local integration and acceptance audit](../verification/spec-0003-final-audit-2026-11-02.md), including standard Docker runtime/export/restart evidence and remaining verification limits.
The [November 3 round-four local audit](../verification/spec-0003-round4-remediation.md)
supersedes the round-three readiness recommendation. Reader/package/UI repairs
and final checks pass, but corrupt historical identity data still blocks unrelated
Sectioning regeneration after reset. The subsequent verified-recovery implementation is tracked below; this earlier
checkpoint is not full-contract acceptance.
Historical reports and the remote PR description retain their dated attribution.

The [verified history recovery work record](../verification/spec-0003-history-recovery.md)
maps the owner's subsequent recovery direction to this contract. The shared
early safety check must run before reset/provider work. Recovery requires proof
of the original identity-bearing record and preservation of damaged evidence;
an older valid selected version alone is insufficient. The owner authorized exact-byte physical restoration with an immutable damage
audit as a narrow exception to the no-overwrite rule. This does not approve the
specification. Implementation and verification remain recorded in the work log.

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
rollback leaves the entire reset unchanged. No second filesystem reset journal is
needed for this database-only transaction. The configuration journal remains for
cross-file/database recovery of earlier transitions.

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

**Verified history recovery (owner-authorized, review pending):** capture original
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
Checkpointing readable legacy history is explicit and cannot prove an already
corrupt record. No new freshness system, lock or schema-version bump is introduced.

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
Compatible downstream freshness warnings remain usable under SPEC-0001. Package cache hits and new builds must validate the mandatory part window. A failed build must leave the previous published directory intact. A complete download contains the files required by its format and declared output languages; source coverage alone does not prove this.

Use the existing shared writer gate and per-page input/version revalidation.
Remove redundant SPEC-0003 locking/lifecycle enforcement; do not introduce a second
in-process lock. The literal earlier in-process-only suggestion conflicts with
supported prerequisite cross-process writers: replacing their gate permits lost
updates. The smallest safe reconciliation is to retain that shared guard and add
no extra lock subsystem. Preserve the final prerequisite's Linux incarnation,
namespace/container proof and recovery-sentinel safeguards.

**November 2 recovery correction (owner-authorized implementation, spec review
pending):** an independent real HTTP/SQLite reproduction showed that a live reader
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

This guarantee requires cooperating updated runtimes. A concurrently running older
build or raw SQLite client that ignores shared admission is unsupported; bounded
old-build readability on isolated copies is unchanged. A capability record does
not prove ownership against those uncoordinated processes. Startup must use the
single shared recovery boundary rather than separately deleting mutexes.

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

The current November round is **local only**: coherent local commits and evidence,
no push, remote retarget/title/body/comment/review request, merge or issue edit.
The proposed future base is develop. The publication procedure below applies only
after later authorization, not automatically at the end of this audit.

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

A fixed-layout rerender requires valid current `positioned-text` and `image-filtering` results for each page, with positive finite viewport dimensions. Missing, SQL/JSON-null or unreadable extraction input is not an explicitly empty page. Report it per page and retain that page's previous output; other ordinary-run pages may publish. An actual layout switch still requires every active page. An omitted classification is not a prune decision: an extracted or positioned illustration needs an explicit keep/prune decision, and every kept illustration needs a position. A validated empty positioned result and empty image classification can represent a truly blank source page. Legacy books with missing fixed inputs remain readable through their safely owned retained output; rebuilding those pages requires restoration of valid input or the extraction repair owned by SPEC-0010. Do not synthesize a blank success or recommend the deliberately unavailable existing-book Extract rerun.
