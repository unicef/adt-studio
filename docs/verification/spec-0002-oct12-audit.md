# SPEC-0002 integration and acceptance audit — 2026-10-12

Status: independent source review and final local/platform acceptance complete.
Exact published-head CI and the review request are recorded in the PR comment.
No specification approval or release certification is claimed.

- Starting published #880: `f21413a6cb5225aab5f2be1fea48390fe8c48fde`.
- Refreshed #879 prerequisite: `aefe41855ae63d89c09db5553c50f48eb01b190d`
  (runtime checkpoint `9d8bde0d`; hosted test/Docker/i18n run `38226029890`).
- Actual old prerequisite boundary: `a10d3fa0`; replayed only 28 SPEC-0002
  commits onto the new prerequisite, producing integrated baseline `9cecf188`.
- Recoverable refs: `backup/spec0002-local-before-oct12`,
  `backup/spec0002-published-before-oct12`, `backup/spec0002-old-prerequisite-oct12`.
- #884 `a5670d46`, #886 `3a7ad4a3` and #888 `d9dac253` inspected; none merged or
  modified. The pair-retention rule is adapted from #884; direct preview uses
  #888's shared reading-order lookup plus #879's stable-owner metadata.
- User-authored quiz grouping, single-page Revert, confirmation copy and compact
  TOC badge are preserved. Title/body of PR #880 remain untouched.

## Final source assessment

Implementation source checkpoint: `7b53e448` on SPEC-0001
`aefe41855ae63d89c09db5553c50f48eb01b190d`. This is a qualified implementation
of the four preservation units, not unrestricted legacy compatibility, approval
of the specification, completion of issues #736/#144, or release certification.
The PR remains separate from #879 and based on `spec/735-per-section-staleness`.
No descendant branch was merged into #880.

### Feedback-to-fix results

| Feedback | Correction | Regression / acceptance evidence |
|---|---|---|
| F1 — retained HTML/answers assigned new section identities | Inherit #879 stable rendered owners; direct preview uses the shared reading order and its actual owner metadata, adapted from #888. Never resolve by current position or moved leaf. | `manual-edit-survival.test.ts`: actual HTTP replacement/reorder/prune/restore, new URL 404, original activity answer/catalog IDs, manual translation/audio, neighboring versions, history and physical files. Unknown/conflicting ownership remains raw/history-visible and is omitted from output with warnings. |
| F2 — TOC draft recovery edits the wrong chapter | TOC-specific identity policy treats changed targets, document replacement, order/membership and ambiguous IDs as whole-document conflicts. Original draft remains intact until an explicit choice; independent edits merge only under verified identity. | Mounted `TocView.recovery.test.tsx`: rejected Save → recovery → next Save across reorder, insertion/removal, retargeting, regeneration, duplicate IDs and unrelated edits. Two real browser tabs exercise retargeting and independent chapter edits. |
| F3 — protected fixed-layout page loses positioned source | Preserve `fixed-layout-sectioning` with retained HTML; publish/retire matching trees only inside successful transactions. Minimal rule adapted from #884. | HTTP neighboring success/failure/cancellation tests compare actual SQLite versions and both payloads before/after reopen, then preview and filesystem export. Combined app and bundled Desktop exercise fixed owner `pg001_sec009` despite semantic owner `pg001_sec001`. |
| F4 — combined Sectioning → TOC replacement skips work | Exact named consent advances only to a TOC version committed by that same run's retirement transaction. A competing version fails explicitly; no refreshed blanket consent. | Real stage-range test reaches TOC generation once; in-run HTTP Save returns 409. A separate SQLite writer causes refusal before generation/publication and retains its document. Container transport counts separately confirm combined generation. |
| Independent — restore races and ambiguous identities | Lock editor while restore/refetch is pending; refuse dirty restore. Retain duplicate legacy translation/TOC content for reads/history, reject ambiguous mutation before generation, permit known-valid history recovery. | Mounted VersionPicker/editor tests and real SQLite Save/restore/ordinary-run regressions, including forged provenance and no-op AI/manual/unknown saves. |
| Independent/browser — retained content inaccessible or omitted after rerun | Studio preview/validation/export/TOC/glossary/captions use current stored outputs, not attempt status. Export includes retained features and waits for availability queries. Optimistic run cache clearing uses the shared backend invalidation policy. | Actual entry/Export confirmation tests; independent pending-query/queue probes; real browser export includes manual quiz, glossary and audio. Page summary tests select current SQL NULL and JSON null correctly; history never masquerades as current content. |
| Independent — manual TOC points at pruned target | Output projection keeps heading/hierarchy and removes only unavailable navigation. Restoring the actual owner restores the link without changing the TOC. Empty saved TOC stays empty. Webpub uses a real HTML contents resource for unlinked headings. | `toc-reading-order.test.ts`: HTTP Save → guarded prune → preview 404/unlinked heading → ADT/Webpub package → guarded restore → working link; exact TOC/rendering versions preserved. Mounted reader does not navigate/prefetch missing links. Independent reproduction failed before correction and passes after. |
| Independent — repeated TOC targets corrupt reader search | Distinct presentation keys for each list row; no new persisted identity scheme. | Real mounted `TocContent` filters repeated/unlinked targets then clears search; each authored heading appears once. Independent reproduction failed before correction and passes after. |
| Independent/self-audit — Webpub TOC overwrites a legacy page named contents | Allocate the first unused derived TOC filename and register that exact resource; leave entity IDs and original pages unchanged. | Original independent real-filesystem probe failed before the fix; committed `webpub-toc-preservation.test.ts` preserves both existing pages, source ADT and reading-order URLs across repeated exports. |

The four published findings were reproduced on the integrated baseline before
fixing them (F1 returned old HTML at a new URL; F2 reapplied an indentation change
to a reused target; F3 lost the positioned tree; F4 completed with zero TOC calls).
Later independent/browser findings were fixed and rechecked rather than described
as unrelated because they were inherited or missed by an earlier passing suite.

### AC-to-evidence matrix

“Passed” means the stated implementation contract is exercised at this checkpoint.
It does not check the specification's human approval boxes. Three rows remain
**blocked for the unrestricted legacy guarantee**; the listed verifiable-owner
paths pass under the delegated SPEC-0001 safety policy. No failed material
implementation finding is being carried as a pass.

| AC | Status | Observable evidence / limits |
|---|---|---|
| 1 | Passed | Real translation PUT: changed/new entries stamped by server, unchanged tags retained, forged tags ignored, canonical/legacy language guards, current/history versions and zero generation on Save. |
| 2 | Passed under delegated reconciliation | Real stub transport plus filesystem cache at 120 and 8,850 entries. Fixed windows precede eligibility filtering; protected/current inputs absent; ordinary reruns zero requests/cache hits/provider calls/cost. Controlled full-eligibility passes isolate one changed window. Mathematics STD 5 harness is separately not run. |
| 3 | Passed | Quiz PUT, quiz ID lifecycle and survival suites preserve quiz/option IDs, stamp actual changes only and reject stale/invalid writes. |
| 4 | Passed | Repeated real HTTP runs retain manual/unknown pages 6–8 quiz group, options, translations, recordings and explicit reading-order row. No regrouping, duplicate alternative or protected-group call; AI neighbors replace with fresh IDs only after publication. |
| 5 | Passed with no-op clarification | Meaningful TOC Save stamps whole document manual; generation stamps AI; no-op AI/manual/unknown saves retain provenance. New/ambiguous/stale documents and history are covered. |
| 6 | Passed | Named confirmation/cancel behavior plus actual combined stage range reaches TOC generation; manual prior version survives success, failure and cancellation. |
| 7 | Passed with no-op clarification | Sectioning PUT and clone/split/merge/cross-page/delete/AI edit protect whole affected page records; render-only AI edit protects its owner; no-op preserves original provenance. |
| 8 | Passed | Ordinary actual run skips protected pages without model calls, versions or identity retirement; eligible neighboring AI pages generate. Fixed positioned tree/HTML pair survives all neighbor outcomes. |
| 9 | Blocked for unrestricted legacy output; qualified paths passed | Real Save → run route/admission/preparation/worker → current/history → preview/export covers all six types, own-stage and upstream runs. Stable known owners pass. Unverifiable/conflicting legacy rendered owners are retained raw but omitted from preview/export with warning. |
| 10 | Passed | Four manual badges and owner-reviewed controls retained. Five catalogs fully translated; extraction, strict compilation and lint pass. New failure flows exercised in actual browser. |
| 11 | Blocked for unrestricted legacy output; qualified paths passed | Unknown authorship is protected without migration. Built pre-change API and its own runtime resources read/preview/export an isolated newly saved book; current reopen leaves all identities/authorship/history intact. Ambiguous legacy mutation refuses safely. Old-build editing/resume is not promised. |
| 12 | Passed | Guarded restore preserves provenance; selected-page Revert restores eligible AI only, retains manual history and neighbors. Dirty/busy/stale/cancel/missing-baseline paths and pending restore/refetch are tested. |
| 13 | Passed | Delete-last keeps empty manual page; cross-page merge stamps both pages and rejects stale target before either changes; ordinary rerun does not refill/duplicate moved content. |
| 14 | Passed | Retired source translations and section/TOC references leave active membership only through successful publication; prior rows/assets remain restorable. Restored TOC with unavailable target has no guessed link. |
| 15 | Passed | Default-off Sectioning replacement names exact protected pages/versions; UI reopening resets opt-in. Missing/stale snapshots or concurrent writers cannot acquire consent. |
| 16 | Passed | Failure/cancel before publication retains active manual units; injected SQLite publication failure rolls back retirement/references; successful quiz/page replacement retires old identities and retains history/assets. |
| 17 | Blocked for unrestricted legacy output; qualified paths passed | Current-version preview/web export preserves manual text, quiz answer IDs/scoring, fixed positioned content and real TOC destinations. Pruned targets retain headings, restore reactivates links, empty document stays empty. Known-owner browser ZIPs pass; unsafe legacy-owner omission remains qualified. |
| 18 | Passed | All four PUTs/restore require matching baseVersion; missing400/stale409/busy409 with no writes. Guarded drafts survive refetch/navigation/conflict, whole-document TOC choices, Save & leave, and independent edits; both HTTP and separate SQLite writers are tested. |
| 19 | Passed within explicit scope | Registered DAG persistence tests stamp all four generated outputs AI. This is not full CLI preservation, resume or completion of SPEC-0010. |

#### Translation accounting

The 8,850-entry experiment has 177 original fixed windows. After correcting entry
4,407, both ordinary current-output reruns make **0 adapter requests, 0 cache hits,
0 provider calls and 0 cost**. Controlled full-eligibility passes make 177 adapter
requests each: first **176 cache hits + 1 provider call + 0.015 fixture cost**;
second **177 cache hits + 0 provider calls + 0 cost**. Every unaffected request body
is identical. A separate validation-retry regression measures 1 adapter request, 2 actual
HTTP calls, 2 per-attempt logs and 0.03 synthetic cost; protected text is absent
from both bodies and the following ordinary run adds no calls/logs/cost. None of this creates force-fresh behavior, submits protected
content, measures live billing or substitutes for the missing representative-book
acceptance harness.

### Independent review

A separate read-only reviewer received the original spec, source issues and
published feedback, the prerequisite/integrated heads and public entry points.
It built its own requirement map and probed UI → HTTP → worker/transaction →
SQLite/files → preview/package. It found material defects beyond F1–F4, including
restore/duplicate guards, retained export/queue behavior, pruned TOC navigation
and repeated-target reader search. These were fixed by the sole implementation
writer and returned to that reviewer at frozen commits.

The final reviewer verdict at `7b53e448` is **no remaining material source
correctness/data-loss finding in the qualified contract**. Latest rechecks:
3/3 independent reader probes; 2 files/5 committed reader/HTTP tests; earlier
4 files/148 preview/package tests; 2 independent prune/escaped-title probes.
The subsequent test-only retry addition at `4d824bd5` was independently inspected
and its catalog suite passed 10/10. These overlapping counts are not a unique
suite total. [The independent report](spec-0002-independent-review-2026-10-12.md)
contains its own AC map, severity, counterexamples and checkpointed commands.
The final Webpub collision correction at `7b53e448` was then independently
rechecked: original collision probe 1/1 and affected committed suites 3 files/126
tests passed. All F1–F4 and additional R1–R8 findings are closed in the qualified
source assessment; platform execution is recorded separately below. The reviewer
also inspected the final full-suite and Docker/Desktop/browser/restart evidence
for claim consistency and found no material inconsistency; it did not independently
execute those platform runs.

### Commands and platform acceptance

Run from the isolated branch checkout; Mac Git commands use
`DEVELOPER_DIR=/Library/Developer/CommandLineTools`. No paid provider calls or
mutation of the owner's original books. Platform fixtures and representative-book
copies are disposable. The exact-head hosted run is reported in the publication
comment, independently of local evidence.

| Command / check | Result |
|---|---|
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test` at `7b53e448` | **330 files / 4,097 tests passed**, 186.43 s. Includes all new regressions and inherited SPEC-0001 tests. `pretest` executes `pnpm build` (TypeScript and actual reader bundle). |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Passed on final production source `7b53e448`. |
| `pnpm lint` | Passed: zero errors; eight unused eslint-disable warnings, reported without asserting a baseline origin. |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio exec lingui compile --strict` | Passed: 3,750 messages in each of en/es/fr/pt-BR/sq, zero missing translations. Extraction left no uncommitted catalog delta. |
| `node scripts/probes/spec-0002-compatibility.mjs --baseline ../spec-0002-evidence/compat-before` | Passed against actual built `ef31494dc2951b92222c473960fecee2d91f9544` API **and its own built reader assets**. Isolated current Save → old read/preview/export → current reopen; all four units, tags, IDs and history unchanged. |
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools SKIP_NOTARIZE=ALL CSC_IDENTITY_AUTO_DISCOVERY=false npm_config_cache=/private/tmp/spec0002-oct12-npm-cache pnpm --filter @adt/desktop build:unpack` | Passed, final production source. Unpacked macOS arm64 `.app`; signing explicitly skipped. |
| `node /private/tmp/spec0002-oct12-desktop.mjs` | Passed using the **actual packaged** `Contents/Resources/api/api-server.mjs`, packaged prompts/config/reader/WASM/runtime dependencies and disposable books. Save200, stale409, restore200, preview/export, API process restart, exact current/history equality, 129 representative-book outputs. Launched bundled API with Node; not a full Electron GUI check. |
| Desktop ZIP inspection | Passed: fixed owner `pg001_sec009`, correct TOC/page destinations, quiz scores keyed by retained `qz001_o0/1/2`, protected glossary definition, exact audio bytes; actual bundled Webpub export retains unlinked heading via its valid contents resource. ZIP SHA-256 `8a42b4730f51798ad0e3bbf717ec66231e4f2c874d152de0f43c860d574c0ab1`. |
| `docker build --target app -t adt-studio:spec0002-oct12 /private/tmp/spec0002-oct12-context-90dqdvgv` | Passed. All 1,870 non-documentation build-context files match source `7b53e448`. Image/manifest digest `sha256:518f072e2f54aec2207b957c629d391a71be343702f301387e8fc452e53e554f`. Standard combined `app` target with API, nginx, reader and Studio. |
| `docker run -d --name spec0002-oct12 -p 127.0.0.1:4253:80 -v /private/tmp/spec0002-oct12-books-g20f_r7t:/app/books -v /private/tmp/spec0002-oct12-config.yaml:/app/config.yaml:ro -e OLLAMA_BASE_URL=http://host.docker.internal:4256/v1 adt-studio:spec0002-oct12` | Healthy, actual bundled server behind nginx. Disposable fixture and representative books; provider URL is a local stub. |
| `node /private/tmp/spec0002-oct12-runtime.mjs` | Passed on final container: ordinary protected fixed-layout run makes zero transport calls and preserves exact pair/current/history. Confirmed combined run makes 2 Sectioning, 1 quiz, 1 glossary and **1 TOC** transport call; competing Save409, current AI targets correct, prior manual TOC retained. |
| `node /private/tmp/spec0002-oct12-browser.mjs` | Passed in actual Chromium against the final container: two-tab target conflict409 → retained draft → explicit document choice → next Save200; unrelated concurrent edits both retained. Fixed owner preview, correct/incorrect quiz verdicts, retained glossary/audio/quiz export flags, fixture and representative-book export downloads; 55/315 outputs respectively unchanged, zero browser page errors. |
| `docker restart spec0002-oct12`; `node /private/tmp/spec0002-oct12-runtime.mjs --restart` | Passed: all compared current values, versions/history and positioned owner preview/export survive the actual container/API restart. |
| `python3 /private/tmp/spec0002-oct12-zip-check.py` | Passed on actual browser downloads: all nonempty TOC/page destinations exist; fixed owner `pg001_sec009`, retained quiz scoring IDs, protected glossary and exact audio bytes. Fixed ZIP SHA-256 `5b4721f3b10561d6274d831778051eb2ddcf21b72f213ca9364e114fc5aae7f3`; representative ZIP `c68da0c1c5d7717b7484603ca958e45ce4a2f8a5f3e30cfa4e966227908c7ed5`. |
| Invariant checks | No separate invariant runner exists in this tree; documented invariants are covered by the real-route/storage suites, typechecks and lint. |

The final complete run supersedes a command at `09a86c12` which accidentally
omitted `DEVELOPER_DIR`: 22 Git-dependent script tests failed with the explicit
Xcode license error. Re-running the full suite with the required environment
passed; that failure was not labeled a pre-existing code defect. Earlier failed
adversarial probes remain before/after evidence, not claimed passing runs.

Local raw logs, screenshots, ZIPs and disposable harnesses are retained in
`tmp/spec-0002-evidence/` next to the isolated checkout. They are not all committed
fixtures. The committed route/component/transport regressions and this report
are the reproducible source evidence. Platform checks use final production tree
`7b53e448`; later documentation commits do not change runtime source.

### Remaining qualifications and downstream implications

- SPEC-0001's unverifiable/contradictory rendered-owner fallback retains raw data,
  history and assets, omits unsafe preview/export content with warnings, and
  never infers ownership from position. Original SPEC-0001 AC-7/12 and affected
  SPEC-0002 AC-9/11/17 remain qualified pending ratification or a safe repair flow.
- The no-op stamping clarification and AC-2 reconciliation implement the owner's
  delegated instructions; human specification approval remains pending. Spec and
  INDEX stay draft; original acceptance checkboxes remain unchecked.
- Ambiguous legacy duplicate translations/TOC remain readable, but mutation fails
  closed. Restore a known unambiguous version or repair the source book before
  continuing. No automated choice between protected edits is invented.
- Source-retirement publication still follows AC-14. Read-only TOC projection
  does not rewrite that document or relax consent. Webpub's HTML contents
  fallback follows [Readium's contents-resource policy](https://readium.org/webpub-manifest/#6-table-of-contents).
  EPUB/PNLD still have their existing unresolved-heading conversion limitation;
  AC-17 specifies preview/web export, not format-wide navigation preservation.
- Easy Read uses SPEC-0001's shared ownership/freshness/protection work; it is not
  a fifth new unit here. Full Storyboard rerun preservation/mode-transition
  lifecycle remain downstream coordination work (#144/SPEC-0003). Safe full CLI
  resume belongs to SPEC-0010; AC-19 establishes only AI stamping here.
- #884/#886/#888 must reconcile their incremental diffs onto this rewritten #880
  stack and avoid replaying obsolete prerequisite commits or duplicating these
  focused fixes. Their existing implementations were inspected for reuse, not
  modified or certified by this audit.
- Not run: unavailable SPEC-0005 `pnpm acceptance`/Mathematics STD 5 harness;
  paid-provider quality/billing; full Electron GUI; signed/notarized installers;
  Windows/Linux desktop execution; released-artifact upgrade certification.
  Local Docker and bundled-API checks do not establish those results.

**Completion statement:** the four-entity implementation and known material
review findings are resolved in the exercised, qualified contract. This is a
qualified implementation, not a claim that the unrestricted original legacy
preview/export promise or every release/platform acceptance requirement is done.

---

## Pre-edit requirement map

The map below was recorded before rebasing or editing production code. It is a
plan for acceptance, not a claim that its checks have passed.

# SPEC-0002 renewed acceptance audit — 2026-10-12

Prepared before integration/application edits. Target `f21413a6`, old prerequisite
`a10d3fa0`, new prerequisite `aefe4185` (runtime `9d8bde0d`), develop `410d4b2f`.
The source spec, owner amendments and review `5486314026` are the contract.
Historical passes are not fresh acceptance. A separate reviewer builds its own map.

## Feedback-to-fix plan

| Finding | Current behavior/evidence | Required correction and public-entry acceptance |
|---|---|---|
| F1 P1 | Published review reproduces old HTML/answers attached to newly minted Sectioning IDs; updated #879 resolves shared stable owners but direct Preview needs inspection | Inherit shared resolver; adapt smallest #884/#888 Preview/publication correction. Real Sectioning HTTP replace/reorder/retire, catalog answer identity, translation/audio, current/history, prune/restore, preview/package. Conflicting/unknown owners retained raw and omitted with warning; no positional inference |
| F2 P1 | Generic id-keyed TOC draft merge treats positional toc_001 as identity across chapter changes | TOC-specific conflict policy, preserve whole draft on changed targets/replacement. Mounted editor reject Save → recover → next Save with reorder, insert/remove, target replacement and independent concurrent edits; retain owner-reviewed conflict controls |
| F3 P1 | Preparation clears positioned trees while protecting HTML/page records | Adapt paired rendering/tree preservation from #884 without importing descendant subsystem. HTTP ordinary Sectioning skip, mixed success/failure/cancel, restart and fixed-layout preview/export; pair unchanged until successful replacement |
| F4 P2 | Section retirement versions the TOC; later same-run consent no longer matches, worker silently skips | Authorize only exact same-run transformation lineage or explicitly fail with renewed-confirmation requirement. Actual stage-range calls, model counts, current/history; external version/contents changes must not acquire consent |

## Pre-edit AC map

| AC | Current observable/source behavior; required audit/correction | Public entry points and concrete verification |
|---|---|---|
| 1 | Per-entry guarded server stamping exists; integrate new legacy/source guards without weakening | Translation PUT → catalog service/storage; changed/new/unchanged/forged/no-op, stale aliases/source removal; zero model calls on Save |
| 2 | Fixed 50-entry windows and current-output skipping exist; preserve delegated reconciliation | Translate route/run/worker plus real stub transport/cache; 8,850 entries, no-op, missing/changed, protected-only, retry accounting, unchanged neighbor versions |
| 3 | Quiz save preserves IDs/options and stamps content changes | Quiz PUT → saveQuizOutput; guards, exact stamping, duplicates/invalid legacy, history |
| 4 | Owner amendment skips complete protected page groups, not individual pages | Quiz full/empty/repeated runs and generate-one; actual generation counts; group order/overlap/settings changes, no regrouping, IDs/option answers/audio/reading order preserved |
| 5 | Whole TOC guarded save and AI publication exist | TOC PUT/generation; forged tags, history, no provider calls on Save |
| 6 | Single-stage confirmation passed owner walkthrough; F4 affects combined path | Named TOC run plus Sectioning→TOC; frozen consent, zero calls on cancel/refusal, fresh AI on successful replacement |
| 7 | Structural routes stamp page record; updated ownership must not regress | PUT/clone/split/merge/cross-page/delete/AI-edit → saveStoryboardNode; actual stored versions and ID factory/retirement |
| 8 | Protected source pages skip model; F3 clears paired positioned output | Sectioning run preparation + worker; protected current/history/HTML/tree byte equality and zero calls; eligible neighbor generated |
| 9 | Existing six-type save/run test has aligned fixtures; F1/F3 need adversarial identity layouts | Real Save → HTTP own/upstream runs → read/history → preview/export, including captions/glossary prerequisite behavior |
| 10 | Four badges and owner-reviewed compact TOC pill exist | Preserve UI changes; extract/strict compile five catalogs, lint and browser new failure flows |
| 11 | Unknown provenance protected; old-read probe exists | Ordinary legacy runs and built old API isolated read/preview/export/current reopen. Carry #879 unknown-owner omission qualification explicitly |
| 12 | Restore tags and owner-added single-page Revert exist | Restore HTTP guards, stale/busy/missing AI, neighbor unchanged, history retained; F1 restored stable owner, F3 restored paired content |
| 13 | Empty/manual source and destination records handled | Real delete-last/cross-page merge→run; both protected, moved content once, source/render mismatch safe |
| 14 | Active membership retirement leaves history; F1 association and F4 TOC guard remain | Source removal/section retirement→catalog/read/history/restore; physical assets and inactive identities retained without reassignment |
| 15 | Frozen named page/version consent, default off; owner wording retained | Existing dialog plus real range API; no authorization widening on background refetch or external writes |
| 16 | Per-unit transactions defer retirement; F3 pairing requires audit | Failure/cancel/injected publication rollback, duplicate requests, restart; fresh quiz IDs only at success, section/reference retirement atomic |
| 17 | Existing preview/export tests aligned; F1/F3 violate consumers | Real web package/reader destinations/quiz scoring, old-vs-new section URLs, stable answers and assets; unknown-owner omission remains qualified |
| 18 | Guarded drafts preserve newer independent edits; F2 unsafe TOC identity | All four saves, active worker/queued/external writer, restore; actual TOC editor recovery/next Save, Save & leave/navigation and refetch |
| 19 | CLI persistence AI stamps exist; no full resume guarantee | Registered DAG persistence tests; verify no authorship/lineage schema conflict with updated base; preserve safe refusal scope |

## Narrative, prerequisites and publication gates

- Reuse writer admission, freshness, stable owner resolution and transactions.
  Preserve #879 regressions for Easy Read, glossary IDs, audio bytes/timings,
  deleted-book admission, legacy duplicate reads, paired locations and NULLs.
- #884 `a5670d46`, #886 `3a7ad4a3`, #888 `d9dac253` are reference implementations;
  inspect and attribute focused adaptations only. Never merge a descendant here.
- Keep authored content, stable identities, raw history and physical assets;
  read/navigation does not mutate them. Authorship is separate from lineage/review.
- Preserve owner-reviewed quiz batching and single-page Revert semantics. Full
  Storyboard preservation, old-build edits and full CLI resume remain non-goals.
- #879's unknown/contradictory rendered-owner fallback retains raw/history/assets
  but omits unsafe preview/export associations with warnings. This qualifies
  SPEC-0002 preview/export compatibility too; do not mark it passed by wording.
- Independent adversarial review and recheck of fixes required before push.
  Run focused then full tests/types/lint/build, Lingui, real book/new browser
  failures, old-build probe, combined Docker export/restart, unpacked Desktop
  bundled API/resources. No paid providers or user-book mutation. Record limits.
- Preserve PR title/body and spec approval metadata. Exact-head CI and a concise
  review comment follow publication to the same branch; no merge or issue close.
