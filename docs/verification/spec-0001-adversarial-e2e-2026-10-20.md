# SPEC-0001 adversarial end-to-end round — 20 October 2026

This additional round found real preservation defects after the earlier gate.
They are fixed and independently rechecked. The earlier readiness assessment was
not evidence that these cases were safe. **No confirmed non-deferred defect remains
in the bounded paths tested here; the original full spec remains partially
delivered under the accepted deferrals and pending acceptance gates.** Nothing
was pushed, posted, approved or merged.

## Revision and verification boundary

- Started at `25131f04a913fa25e9c7b925883ba7a4a601a6dc`.
- Identity repair: `03f661d5f60000b69f7e822cb0a7535d669cb7f1`.
- Final production/test source: `8bacfbbb27803f735133cbd3ddf32220155b9175`.
- Remote PR #879 remains `91886d5bf96183f59ec06ba0435fdc5386bbc173`, based on
  develop, open with review required; final read-only refresh found no change.
- Refreshed develop remains `0efe1c2501a478049701fd221ab94fc97cdf50aa`.

This supplements the [earlier final gate](spec-0001-final-gate-2026-10-20.md),
[feedback remediation](spec-0001-remediation-2026-10-20.md), and
[four worked examples](spec-0001-worked-examples-2026-10-18.md). Their dated UI,
export, feedback and deferral evidence is retained, not relabeled as newly run.
The complete branch's automated suite was rerun on the final source above.
The local plan, probes, fixture copies and raw evidence remain outside Git.

## Edge classes derived from previous failures

| Class | Reproduced result and disposition |
|---|---|
| Identity presence versus truthiness | New empty HTML IDs bypassed historical reservation and could inherit an unrelated retained manual translation. Cloning a legacy empty ID changed its source ID but left its HTML/catalog identity empty. Newly introduced empty/whitespace identities are now rejected; clone mapping handles an explicitly present empty attribute. Unchanged legacy local IDs/history remain untouched. Four independent real SQLite assistant/API probes pass. |
| Acknowledgment versus current draft | Storyboard and Easy Read could clear edits typed after a Save began. Responses now acknowledge only their exact submitted snapshot; synchronous refs cover edits and responses in one React batch. Successor drafts remain saveable against the response's own version. |
| Persistence versus navigation | Save & leave callbacks could resolve before persistence or after a handled failure. Existing guard callbacks now await actual persistence, reject failure/busy saves, and stay when newer edits remain. Open caption text counts as a draft before Done. Caption discard/restore clears that active draft as well. |
| Guard advancement versus concurrent refresh | Glossary successor saves need both the returned version and its corresponding identity signature. The API returns its exact publication signature; the UI does not adopt a later GET's guard. Real SQLite and packaged API tests prove successive own saves succeed and an intervening writer still causes 409. |
| Internal selectors versus route navigation | Language tabs could discard unsaved translations. Switching is disabled/guarded while translation/speech drafts or saves remain; reverting to the original value unlocks it. Caption filtering could unmount the draft or its navigation registration. Dirty/saving page editors now remain mounted and visible through search, decorative and section filters. |
| Late response versus editor scope | A delayed Glossary response from book A could rebase book B's draft onto A's version/signature. Language and Glossary acknowledgment, error and completion handling are scoped to their original book/language. Caption page keys include book and page. Independent late-response tests pass. |
| Review evidence versus current applicability | Added actual-storage Keep rejection cases after output edits, language disabling and section exclusion. Obsolete acceptance returns 409 without extra entity versions or provider calls. |
| Serialized writers versus stale authored screens | A separate real API probe confirmed that sequential stale source-screen saves can still overwrite active authored text, retaining versions. Writer admission alone cannot detect that. SPEC-0002 Decision 10 explicitly owns source `baseVersion` enforcement; the actual published #880 implementation was inspected. This branch must not be represented as providing that adjacent guarantee by itself. |

The empty-ID, navigation, filter and scope changes clarify existing preservation
promises. They do not introduce a migration framework, new lock, draft subsystem,
or new approval step. Spec narrative records the decisions; approval and AC text
remain unchanged. Historical malformed-ID repair remains deferred. New nonblank
opaque IDs are not silently trimmed/rekeyed.

Not every hypothesis was a defect. Provider-rendered unexpected blank IDs were
already rejected, and retained whitespace-only IDs already triggered reservation.
Their tests preserve those protections without claiming newly repaired failures.

## Independent review

One reviewer independently reproduced the identity failures, then implemented
that narrow repair. A second reviewer independently reran four repaired real
SQLite probes and reviewed identity paths. The first reviewer separately found
a same-React-batch race in the initial Storyboard fix; its unchanged reproducer
passes after synchronous draft-ref updates.

The second reviewer found the Language selector, Caption filter and Glossary
book-scope failures. After repair, all three original probes passed unchanged,
as did **30 targeted repository tests**: **33 passes** in the final bounded
recheck, with two filtered skips excluded. The earlier independent pass ran
106 focused tests plus four Easy Read/Storyboard probes. These overlapping
counts are not added to the full-suite total. Review-file hashes match the
committed production files. No actionable finding remains from those probes
or repair-delta reviews; this is not an exhaustive historical-state guarantee.

## Fresh real UI and persisted artifacts

Built Studio ran in Chrome against real Hono routes, services, SQLite and files.
An isolated historical-shaped fixture modeled two pages, explicit ownership,
stable IDs, multiple versions, manual French/Easy Read entries, per-language
speech and retained media. After setup, editor mutations, failures, retries,
navigation, filtering and invalid-ID submission used the real UI. A local
transport harness delayed selected writes and injected explicit HTTP 409s;
successful retries reached the production API. It counted actual external fetch
calls. No provider credentials or real provider calls were needed.

| Journey | Observed UI and persisted result |
|---|---|
| Storyboard Save A, type B before response | B remains dirty after A is acknowledged; second save and reload preserve B. Same-batch variant additionally tested at the component boundary. |
| Easy Read Save A, type B before response | B survives acknowledgment, saves as the next version, and survives reload. Own-version versus intervening-writer behavior is independently tested. |
| Glossary Save A, type B before response | B survives; subsequent Save & leave succeeds with the own-response version/signature. |
| Save & leave failure/retry in Storyboard, Easy Read, Glossary, Captions and Language | 409 leaves the route and draft intact. Retry persists the identical request payload and navigates. Caption case starts with an open textarea without clicking Done. |
| Language selector | Original French draft loss was reproduced before repair. Repaired UI disables the English tab while French is dirty, retains exact text, and enables it again after a successful save. |
| Caption search: zero results and only another page matches | Edited page, textarea and Save remain visible. Attempted navigation still opens the existing unsaved-changes guard. Explicit Discard & leave removes only the test draft. |
| New blank ID in raw HTML | Real route returns 409; version remains v5; rejected HTML stays available for correction. Explicit discard restores saved HTML. |

**68 persisted-artifact assertions passed:** every baseline entity version still
exists unchanged; unaffected active entities are identical; expected edits are
persisted; five rejected-write/retry pairs carry identical payloads; the invalid
HTML is absent from saved state; **20 original audio files and six image files
remain byte-for-byte identical**. No absent/empty video fixture is counted.
All Save, retry, filter and navigation activity made **zero provider calls**.

The UI flows span the frozen repair working tree. The final compiled UI was
reloaded for the caption filter/guard check; Language's dirty-tab flow preceded
only its later defensive cross-book-finally guard, which is covered by final
independent scope tests and the complete suite. These are representative
fixtures, not original customer books. Tiny images and tone audio do not validate
model semantics, voice quality, visual fidelity or the full historical population.
Cross-book late-response cases are controlled mounted-component tests, not claims
of a reproduced real-router book-switch race.

The four complete worked examples, generation/cache counts, downloaded ZIPs and
restore/export walkthroughs remain the separately dated preceding-round evidence.
This round adds adversarial draft/identity journeys; it does not claim all earlier
UI variants were repeated again.

## Checks on final source

| Check | Result |
|---|---|
| `pnpm test`, including pretest build | **Passed: 353 files / 4,374 tests**, 209.55 seconds |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Passed |
| `pnpm lint` | Passed; zero errors, eight unused-disable warnings |
| `pnpm build` through pretest; Studio production build | Passed |
| Lingui extraction and `compile --strict` | Passed; all five locales translated, zero missing |
| Focused editor/API checks | Passed: seven files / 58 tests; included in full-suite total |
| Independent final repair recheck | Passed: three original probes plus 30 regression tests |
| Working-tree whitespace check | Passed |
| Dedicated invariant command | None exists; relevant invariant regressions ran in full suite |
| macOS arm64 unpacked Desktop | Build passed; first packaging attempt failed parsing pnpm dependency output. Exact dependency command then returned valid JSON; packaging-only retry passed with ad-hoc signature. No cause established for the initial parser failure. |
| Newly packaged API smoke | Passed on a separate copied book: two image inventories, 77 output rows; own-successor glossary versions 4/5, stale guard 409, final successor retained |
| Clean Docker `app` target | **Blocked**: fresh Docker 29.8.0 check shows zero VM space available (139.0G total / 135.5G used / 100%). No pruning performed. |
| Full Electron-window UI, signed/notarized installers, live provider quality, hosted CI for local commits | **Not run in this round** |

Intermediate failing probes and test-development failures remain in local logs.
A first full run before the final selector fixes passed 352 files / 4,360 tests;
it is superseded by the final run above. The Desktop parser failure is reported,
not labeled a proven pre-existing failure or erased by the successful retry.

## AC-to-evidence matrix

“Passed slice” refers to implemented behavior verified by current automated tests
and the dated UI evidence. **Blocked full contract** explicitly means a ratified
deferral or original acceptance gate still prevents claiming the entire original
criterion complete. No known failed repair remains from this round.

| AC | Status | Evidence / remaining limit |
|---|---|---|
| 1 | Passed slice; blocked full optimization | Cosmetic/input tests and prior UI/export; fresh saves make zero calls. No-op Save optimization deferred. |
| 2 | Passed slice | Current preservation/scoped-run tests, prior changed-text walkthrough; fresh successor/failed-save tests. Provider combinations not exhaustive. |
| 3 | Passed slice | Current glossary/image consumer tests and prior worked example; fresh real UI and packaged glossary successor saves. |
| 4 | Passed slice; blocked legacy repair | New blank-ID/clone regressions and real UI; retained history/artifacts. Positional, pruned-leaf and historical malformed-ID recovery deferred. |
| 5 | Passed slice | Current canonical-input/context suites. Same asset ID with different media content remains accepted limitation. |
| 6 | Passed slice; blocked classification | Current usable-warning/missing-input tests; prior dependency-expansion UI. Systemic preparation classification deferred. |
| 7 | Passed slice; blocked original-book acceptance | Fresh draft/selector/failed-save preservation, obsolete Keep rejection and exact history assertions. Historical books/ownership repair pending. |
| 8 | Passed slice; blocked measurement | Current actual-transport cache tests and prior zero-call repeat UI. Large-book measurement/projection cache deferred. |
| 9 | Passed slice; blocked broader guarantees | Current publication/concurrency tests and scope-specific save guards. Uncertain-owner recovery deferred; stale authored source-screen guards belong to SPEC-0002. |
| 10 | Passed slice; blocked publication ordering | Existing real-filesystem failure/cancel tests pass. New-audio-before-timings change remains separately ratified work. |
| 11 | Passed slice; blocked release gate | Current physical snapshot/restore tests, fresh unchanged media assertions, packaged API pass. Clean Docker release verification blocked. |
| 12 | Passed slice; blocked historical acceptance | Current packaging suites and prior Preview/downloaded ZIPs. Original-book acceptance and ownership repair remain pending. |
| 13 | Passed slice; blocked classification | Current requested-language/manual/fallback tests. Provider-wide systemic classification deferred. |
| 14 | Passed slice | Current actual preparation/audio retry/cache tests and prior UI evidence. Live provider quality not run. |
| 15 | Passed slice; blocked bulk endpoint | Current inline/status tests; fresh obsolete Keep rejection and draft controls. Bulk review endpoint deferred. |
| 16 | Passed slice | Current skip/cancel/exclusion/restore tests and prior dated UI; fresh exclusion-change acceptance rejection. No new all-variant UI replay claimed. |

## Remaining scope and confidence

The earlier feedback ledger still accounts for all iterations: 61 obligations
since the last review request, 15 accepted deferrals, and the earlier ten feedback
records separately read. No new remote feedback appeared during this round.
Accepted deferrals remain: uncertain writer recovery; audio-before-timings;
systemic preparation classification; large-book measurement/projection caching;
no-op Save; server quiz plan; ownership repair; positional activity identity carry-
over; pre-schema-14 compatibility; pruned-leaf ownership; bulk review endpoint;
unassigned sign-video listing; Storyboard caption editing/mirroring; stale-page
Storyboard selection; historical blank-drift recovery. Their follow-up drafts
remain local, with filing due at merge. Reviewer-owned follow-up work was not
silently absorbed or declared finished.

Original De-codable pg006 remains with elasticsounds, as instructed. Frankenstein,
ancientegypt-2, named integration approval, Tanzania doctor field validation and
applicable release checks remain pending. The narrow legacy ownership fallback
remains an accepted compatibility assumption, not historical proof.

Confidence is **high in the specific repaired and tested preservation paths**,
and bounded for the entire historical-book population and full original spec.
This round's discoveries are a reason to retain those boundaries, not to claim
100% certainty after another green suite. Local changes are ready for the user's
review of this evidence; publication remains withheld as requested.

Raw evidence: primary checkout `.local-docs/spec0001-adversarial-e2e-20261020/`:
`PLAN.md`, independent reports/probes, full/focused check logs, final PR snapshot,
UI screenshots/HTTP/transport logs, real SQLite copies, 68-assertion script/result,
Desktop failure/retry logs and packaged API smoke. These are excluded from Git.
