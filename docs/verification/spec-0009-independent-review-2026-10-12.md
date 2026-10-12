# SPEC-0009 independent implementation review

Review scope: the complete published specification and all 19 criteria, recovered Phase A, changes since published SPEC-0013 `c4ed8222088261f5a3d5663095d1bf743a896858`, shared-service integration and acceptance evidence. A separate reviewer agent performed an adversarial read-only review; the implementation agent made fixes. Human approval remains pending.

## Findings and rechecks

| Finding | Severity | Observable failure | Fix and regression evidence |
|---|---|---|---|
| R1 | P1 | Validation submission omitted configured provider credentials | Existing API header builder reused; `client.test.ts` checks the actual fetch request |
| R2 | P1 | Selected repair could commit output then fail writing whole-book mode state | Selected page scope retains mode barrier; lifecycle rename-failure regressions |
| R3 | P2 | Missing-book repair requests could create storage | Read/write admission verifies database existence; no new files regression |
| R4 | P2 | Explicit validation could display the pinned old assessment or reuse assessment cache | Fresh assessment query, precise query invalidation and route-pin clearing; `ValidationView.test.tsx` and browser acceptance |
| R5 | P2 | Imported/restarted request receipts could remain running forever | Durable owner token; missing/replaced owner becomes interrupted without automatic paid resume |
| R6 | P1 | Terminal receipt write failure could leave false running/retention claims | In-memory terminal evidence retained, uncertain restart state described honestly; three injected failures |
| R7 | P2 | Selected render invalidated unrelated downstream consumers | Compare actual before/after consumer signatures; unchanged step/database rows asserted |
| R8 | P2 | Build bookkeeping written after assessment made its artifact hash immediately stale | Exclude only post-assessment build bookkeeping; content/assets remain in the hash |
| R9 | P2 | Browser-audit fallback could publish evidence after artifact changed | Final hash check outside the browser catch boundary; package regression |
| R10 | P1 | Package filesystem publication preceded the route's assessment/SQLite evidence commit | Existing staged package publication extended to an immutable assessment receipt; rollback, SIGKILL before/after commit, cleanup failure and reader barrier regressions. This was a cross-resource boundary gap, not absence of filesystem staging |
| R11 | P2 | Cache recovery after a later manual edit could mistake committed generation for rejected output | Recover from immutable output version receipt rather than the active pointer; edit/restore regressions |
| R12 | P2 | Reviewer findings could be associated with session creation output rather than the artifact actually reviewed | Package UUID carried by loaded document and runtime soft navigation; server captures matching snapshot for each record version; stale Preview saves reject while retaining drafts; A→B, forged/legacy and human-to-repair tests |
| R13 | P2 | Moved stable IDs still inferred their page from the old prefix in Preview and assessment | Package stamps proven owner, Preview freezes loaded identity/owner, new assessments/browser rechecks use artifact ownership. Independent reproduction confirmed old-owner save 409; moved-owner review/admission/render regression passes |

All material findings were fixed and rechecked by the separate reviewer. The reviewer independently ran 11 foundation tests, the artifact-binding regression and reproduced R13 using production helpers and disposable SQLite. The combined review-fix run passed 149 tests across nine files; the later moved-identity/fixed-layout run passed 93 tests across five files.

The reviewer also strengthened evidence: compare every pre-existing historical database row against the result (so deletion cannot escape the assertion), use a distinct fresh-output marker in editor/Preview/package, and avoid claiming packaged provider-request counts that were not measured. A fixed-layout test now proves Save leaves package bytes unchanged, then compares explicitly repackaged content excluding only its intentionally renewed artifact UUID.

## Review boundary

The final full-suite/platform results and AC audit are recorded in [the continuation evidence](spec-0009-full-continuation.md). Passing tests are implementation evidence, not human specification approval, issue closure, accessibility certification or signed-installer release certification. Live paid provider calls were not made. Independent review found no remaining material correctness or data-safety gap in the reviewed contract.

Final separate review of runtime/probe commits through `c13f3533`, complete specification, all 19 criteria and evidence documents: high-confidence readiness, conditional on the final full-suite pass and exact pushed-head hosted CI. The reviewer inspected confirmation/completion screenshots, representative/browser reports, final Docker/Desktop reports and the matching Desktop baseline errors. No further implementation change was requested.

The final full suite subsequently passed: **4656 tests across 385 files**, with 25 tests/two files explicitly skipped. No runtime/probe change followed the final independent audit; only the actual verification result and publication metadata were recorded.
