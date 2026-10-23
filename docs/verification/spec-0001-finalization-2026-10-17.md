# SPEC-0001 local finalization — 17 October 2026

**Follow-up:** the [18 October UI report](spec-0001-worked-examples-2026-10-18.md)
completes the four worked examples, resolves download confirmation and records a
new caption-discovery correction. This report retains its original dated results.

**The original full specification is not fully implemented or accepted.** All four
implementation slices are present. The current Note 7 A/B corrections are
implemented locally, with the explicit Note 7 D deferrals and the acceptance limits
below. Neither passing tests nor complete feedback accounting changes that status.
Human approval remains pending. Nothing from this finalization was pushed; no PR
comment, description change, review request, issue filing or merge was performed.

## Revisions and feedback coverage

- Existing PR: <https://github.com/unicef/adt-studio/pull/879>, branch
  `spec/735-per-section-staleness`; remote head `91886d5bf96183f59ec06ba0435fdc5386bbc173`.
- Tested combined runtime: `9e36bda3c903556c8c9a3137afb0717885a21e04`.
  Current develop `543e2b0dc6c2f46685f8093de4d5fb9697be1f59` is integrated without
  rewriting history. Its final increment is PR #910's prompt-label sanitization.
- New metadata correction: `06f7c4ea45273d7be9e2589ecf5eb1e5c90be8b4`.
  Earlier local corrections are `fa11f7de` (legacy baseline), `92e5cfba`
  (ownership/read admission/glossary), `22184920` (ratified scope), `bcb7ae29`
  (speech wording), `a8a6876b` (caption authority), and `79ae6ed3`
  (unused Preview projection). Develop integration also includes `5574e545`.
- Last requested review cutoff: October 14, 08:35:25Z, comment `6164313797`.
  Latest refresh: eight reviews, twenty discussion comments, zero inline comments;
  all IDs and bodies unchanged. Seven post-request messages decompose into 92
  mapped occurrences and 61 distinct obligations/decisions, including fifteen
  explicitly deferred obligations. Older notes and both Teams requirements remain
  regression requirements, not discarded history.
- The detailed plan and atomic source-to-disposition ledger remain **outside Git**:
  `/private/tmp/spec0001-finalization-20261017/PLAN.md` and
  `FEEDBACK-RECONCILIATION.md` beside it. Independent raw-feedback accounting
  found no omitted actionable item within that snapshot. This is bookkeeping
  assurance, not behavioral acceptance or a completion percentage.

## Corrections found during acceptance

Metadata language Save still started summary regeneration in Studio and removed
current Quiz/Glossary/TOC and translated-image references in the API. These paths
matched integrated develop, but violated this spec's no-generation-on-Save and
retention contract. They were fixed rather than dismissed as inherited behavior.

Save now sends only metadata. Publication and generator warning updates are
transactional; existing content versions, manual captions, image manifests/files
and catalog attempt history remain usable. Only a change in the normalized
**effective** editing language marks source generators for Keep/Run review.
Global/book `editing_language` overrides and default-English resolution are
respected. Raw language-change response flags remain compatible. Summary
regeneration remains an explicit action; saving does not certify its freshness.
Packaging still refreshes for bibliographic changes.

Shared rerun, structural-edit, unsaved-change, language and glossary-image warnings
now describe possible attention instead of asserting deletion and mandatory reruns.
All changed strings were extracted and translated in en, es, fr, pt-BR and sq.

The mounted metadata form regression failed before the fix by issuing a
summary-generation POST after PUT. The real SQLite regression failed because saved
generators became null. Both pass after correction. Independent review found the
editing-language override case; that correction and global/book/default-language
controls pass too. The independent reviewer ran 25 focused tests and separate
preservation, effective-language and injected atomic-rollback probes, finding no
remaining blocker in this bounded scope. This is not an independent full-branch,
live-browser or release certification.

## Verified commands

Run from the implementation checkout with Node 24.13.0 and pnpm 10.32.1.
Set `DEVELOPER_DIR=/Library/Developer/CommandLineTools` on this host. An initial
combined-suite invocation omitted it: 22 Git-dependent tests failed on the Xcode
license check. With the correct toolchain, the affected 38-test set and the full
4,250-test suite passed. Both failed and successful logs are retained; this was
an invocation error, not a source fix or an unsubstantiated pre-existing defect.

| Check | Result |
|---|---|
| Pristine fetched `91886d5b`: `pnpm test --maxWorkers=2` | 339 files / 4,211 tests passed; retained baseline. |
| `06f7c4ea`: `pnpm test --maxWorkers=2` | 343 files / 4,249 tests passed, 264.63 seconds. |
| Combined runtime: `pnpm test --maxWorkers=2` | 343 files / 4,250 tests passed, 271.01 seconds, with `DEVELOPER_DIR=/Library/Developer/CommandLineTools`. |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Both passed at the combined runtime. |
| `pnpm lint` | Passed, zero errors and eight reported unused-disable warnings. Final base delta changes API only. |
| `pnpm build` | Passed; also performed by the combined full-suite pretest. |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio exec lingui compile --strict` | Passed: 3,758 messages; zero missing across five locales. |
| `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @adt/desktop build:unpack` | Passed on the combined runtime: macOS arm64, ad-hoc signing, no notarization. |
| Packaged API smoke | Passed on the combined runtime: bundled API boots; books HTTP 200, 230 catalog outputs, run revision present. |
| Docker `app` build | Blocked: Docker filesystem 140 GB total, 136 GB used, zero available (100%). Untouched `node:22-slim` reproduced apt failure in earlier diagnosis. Final read-only capacity check still reports 100%. No shared-cache deletion or weakened package verification. |
| Separate invariant command | No such command exists in repository scripts; relevant architecture/invariant source review and tests were used. |

Full-suite logs contain expected jsdom media-method messages; those are not real
browser playback tests. Desktop verification is an unsigned macOS arm64 package
and its bundled API, not signed-installer or live Electron-window acceptance.
Docker CI's `api` target is not evidence that the combined `app` image passes.

## Real UI evidence and production differences

Chrome used isolated book copies against the actual API and Studio. External
provider requests were intercepted at the fetch transport boundary: only a
schema-specific deterministic quiz response was allowed; all other external
requests were blocked. Original books were untouched. No real paid calls were made.

| Data and difference represented | Observed journey and persisted evidence | Acceptance limit |
|---|---|---|
| Four-page catalog fixture with manual French translation and Easy Read lacking provenance | Language opening establishes the allowed baseline without changing authored content. Actual UI landing-page quiz generation and menu Add Quiz both succeed. SQLite has qz001/qz002, two versions; French collection is identical to its pre-UI value. Two successful generate-one requests make one actual quiz transport call, with cache reuse on the second. | The actual ancientegypt-2 archive was unavailable. This verifies both controls and cache behavior on representative data, not the original-book retest. |
| Same fixture | Embedded Preview renders text/image; Next Page opens a quiz. Export UI generates a valid 80-entry ZIP containing four original sections plus both quizzes. | Browser final filename/download-history completion was not confirmed. |
| Restore fixture: source A/clone/B restored to A/B while HTML retains older indices | Actual UI selects/edits/saves B; storage assertions preserve A, orphan HTML/answers, previous versions and manual French answer. Legacy unowned activity with qualifying leaves can be duplicated; export includes both owned activities and discloses the omitted orphan. | Models specific historical structures; not actual Frankenstein or De-codable pg006. |
| Authentic Momo, twenty saved pages, schema 14, pruned/non-rendered pages | Storyboard shows historical page5; embedded Preview shows the cover and Next Page reaches pg005 as reader page2/16. Native Export produces a valid 92-entry ZIP containing sixteen expected rendered sections and original pg005 text. Read-only doctor found no unowned/duplicate/rekey/lease issues. | One real book, not all historical formats. Tanzania unavailable; no claim of pre-schema14 certification. |

UI-triggered ZIP bytes were recovered from Chrome temporary download files and
validated, including ZIP CRCs and expected sections. The automation download wait
stalled; later native-window access failed. DOM-based navigation subsequently
reached the new-book wizard, but the PDF upload was blocked because the browser
extension lacks file-URL access. No extension permission was changed. The exact
cause of final download
registration is unconfirmed, and no product patch was inferred from this alone.
Screenshots, isolated databases, transport records, exported ZIPs and assertions
are retained under the local evidence directory, especially `ui-followthrough/`.

**Still not completed through the real UI in this round:** new-book wizard to
first Extract, baseline busy/retry, rapid caption edits with an in-flight Save,
concurrent glossary rename, the complete Keep/edit/replace/check action matrix,
and all four full worked-example sequences. Automated coverage exists, but does
not substitute for these journeys. De-codable pg006 remains assigned to
elasticsounds by the user; Frankenstein and the actual ancientegypt-2 observation
also require final original-book acceptance.

## AC-to-evidence matrix

“Passed” below means the stated automated contract was verified, with limits
explicitly retained. “Blocked” identifies an unmet original contract/acceptance
portion; “not run” identifies the outstanding live portion. These are not spec
approval or release results.

| AC | Status | Evidence and remaining boundary |
|---|---|---|
| AC-1 | Passed (automated) | Canonical-signature/catalog-freshness API tests; cosmetic source saves retain output and attempt history. Metadata form/storage regressions prove no implicit generation and effective-language preservation. Full live Example1 still not rerun here. |
| AC-2 | Passed (automated); live sequence not run | Scoped execution, protection/context and review-reuse tests. Live B edit preserves unrelated/manual output, but the complete French Keep → unchanged-audio reuse UI sequence remains pending. |
| AC-3 | Passed (automated) | Glossary identity/catalog/caption tests cover definition and image membership without Storyboard edits. Full live Example3 remains pending. |
| AC-4 | Blocked for complete historical contract | Stable-ID reconciliation, retirement/shared-reference/restore tests pass; live restore/duplicate passes. Positional activity carry-over, pruned-leaf ownership and historical blank-drift recovery are explicitly deferred. |
| AC-5 | Passed (automated) | Model/prompt/voice/context signature tests; cosmetic/entity-version independence. New effective editing-language override controls pass. |
| AC-6 | Passed (automated) | Scoped runner and Core TTS tests preserve usable warned inputs, isolate missing dependencies, count phrases and reuse matching audio. |
| AC-7 | Blocked for complete historical/live acceptance | Baseline, provenance, protected Keep/replace, stale-review and reopen tests pass. Qualifying legacy fixture works; ambiguous content remains retained but omitted. Complete live review matrix and actual historical books pending. |
| AC-8 | Passed (transport/cache tests); measurement not run | Recording-transport no-op/retry tests and actual UI quiz two requests/one provider-call cache result. Representative 100-page cost/metadata measurement explicitly deferred. |
| AC-9 | Passed (automated) | Shared selectors, writer admission, source/target/exclusion conflicts and publication checks protect unrelated/manual output and reject obsolete results. |
| AC-10 | Passed for previous-output preservation | Filesystem cancellation/failure/cache tests retain old playable bytes, timings and neighbors. Publishing newly synthesized audio before Word Highlighting remains #958 follow-up. |
| AC-11 | Passed (automated) | Real filesystem restore/cache-cleanup/corrupt-restore/package-invalidation tests, including exclusive-copy fallback. |
| AC-12 | Blocked for complete acceptance | Packaging/HTTP disclosure tests, real embedded Preview/navigation and valid UI-exported ZIPs pass. Chrome final download registration and final original-book acceptance remain unconfirmed. |
| AC-13 | Blocked for systemic-failure portion | Requested-language display-text fallback, manual preservation, bounded phrase accounting and no cross-language substitution pass. Auth/quota/provider-wide classification remains SPEC-0013/#889. |
| AC-14 | Passed (automated) | Actual transport-count fallback/retry/cache tests distinguish first attempt, unchanged failure, explicit retry and identical effective speech reuse. |
| AC-15 | Passed (automated); full live matrix not run | Shared summary/action/status tests and observed baseline/disclosure. Five locales complete. Full live action matrix and Note7 bulk endpoint follow-up are not certified complete. |
| AC-16 | Passed (automated) | Skip/cancel/late publication/exclusion/pruning/restore tests preserve protected work and distinguish disabled/not-applicable from Missing. |

### Four worked examples

1. **Cosmetic Save:** automated canonical/API coverage passed; no fresh complete
   live walkthrough in this round.
2. **One text string:** automated scoped/protection/context/reuse coverage passed;
   live owned-B edit and unrelated preservation passed, full audio cycle pending.
3. **Glossary definition plus image:** automated catalog/glossary/caption coverage
   passed; full live sequence pending.
4. **Delete/add text plus image:** automated explicit Example4 and structural/
   restore coverage passed; live restore/duplicate is partial evidence only.

## Outstanding decisions and release work

The fifteen Note 7 D obligations remain explicitly deferred: uncertain leases;
new-audio publication order; systemic preparation classifier; large-book measure/
projection caching; no-op Save optimization; quiz plan; ownership claim/repair;
positional activity carry-over; pre-schema14 compatibility; pruned-leaf ownership;
bulk review endpoint; unassigned sign-language listing; Storyboard caption field/
mirroring; stale-page Storyboard selection; and historical blank-drift recovery.
Thirteen local follow-up drafts group these fifteen obligations; none are filed.

Before treating the ratified scope as accepted: finish the live journeys above,
collect the designated original-book results, and obtain the integration
maintainer's approval. Before field release: test the Docker `app` image with
sufficient space, run doctor on Tanzania data, publish the recorded release
limitations, and complete dependency/follow-up coordination. No new material
product decision was silently made in this pass. Full original-spec completion
would additionally require the deferred work; it cannot be declared from this PR's
automated results.
