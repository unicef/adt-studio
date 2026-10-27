# Stable editing core: completion gates and remaining gaps

This is a dependency/integration audit, not acceptance certification for every
PR. Remote heads were refreshed on 2026-10-12. SPEC-0001 receives a separate
independent behavioral review in this task; other entries combine published
source inspection with their current evidence reports. No other PR is modified.
Human specification approval, implementation review and release certification
remain separate gates. The roadmap and SDD companion are firm planning references.

## Inspected heads and real continuation order

| Order | PR / spec | Inspected head | Current evidence and required continuation |
| --- | --- | --- | --- |
| 1 | #879 / SPEC-0001 | `c2742aeba2e181390487367c97fa56e34fd47661` before this completion pass | Status integration and independent findings are corrected at runtime `9d8bde0d`; final re-review found no remaining reproduced defect. Unknown-owner compatibility remains qualified; publication requires exact-head CI. The detailed AC matrix is in `spec-0001-completion.md`. |
| 2 | #880 / SPEC-0002 | `f21413a6cb5225aab5f2be1fea48390fe8c48fde` | Manual walkthrough is recorded, but its current evidence explicitly lists four independent gaps. Carry forward #879's identity/publication fixes; resolve TOC draft identity and combined-run consent. Reuse downstream fixed-layout retention/Preview fixes rather than duplicate them. |
| 3 | #884 / SPEC-0003 | `a5670d468d9945924503242b17992cb9b3e2ee57` | Current independent report describes the complete supported B1 increment. Recheck the September 30 amendment with the spec owner; preserve its documented fail-closed resume boundaries and pair retention. Revalidate after upstream integration. |
| 4 | #886 / SPEC-0010 | `3a7ad4a33b18db8aac851c093712ce4d5112ec4d` | Full supported resume contract is reported; changed/legacy/incomplete extraction fails closed. Require a fresh delegated independent review in continuation: the previous independent-review requirement was fulfilled by self-review, not a separate reviewer. Recheck CLI/direct/API/queued entry paths after upstream integration. |
| 5 | #887 / SPEC-0011 | `a1259013aa2a19bcc6f19e9a28fbc3a42e760e04` | Full AC evidence and independent review are published. Repeat effective prompt/config change races with #879's direct Easy Read publication guards integrated. |
| 6 | #888 / SPEC-0012 | `d9dac25357dd971e4c970ebf19edc778468fb976` | Full scoped contract is reported. It already resolves Preview identity by rendered owner; coordinate #879's shared catalog/reading-order resolver with its stronger synchronization evidence, without treating identity as generation provenance. |
| 7 | #889 / SPEC-0013 | `c4ed8222088261f5a3d5663095d1bf743a896858` | Its latest full-continuation report supersedes earlier partial status. Preserve real transport retry budgets and direct CLI behavior when integrating shared publication/fallback changes. This audit does not independently rerun all 18 ACs. |
| 8 | #885 / SPEC-0009 | `d295cf4e32c7057e5bc19db15631f1d941cbb5e8` | Its latest full-continuation and October 12 independent report supersede earlier incomplete Phase B status. Preserve recovery receipts, moved IDs and transaction fixes; rerun combined recovery/freshness tests after integration. |

None of these descendant heads contains `c2742aeb` as an ancestor. Their green
checks do not validate this newer upstream implementation. Document-review stack
order is not evidence of a working dependency; integrate published prerequisites
in the order above, preserving recoverable refs and concurrent remote work. Do
not merge descendants into ancestors to acquire a fix. This table does not
instruct changes to those PRs without their task authorization.

## Prioritized behavioral gaps

| Priority | Gap / reproducible case | Owner and acceptance gate |
| --- | --- | --- |
| P1 | Retained activity A/B HTML is paired with the latest source array after reorder, so manual answer translations attach to the opposite answer. | Fixed and independently reproduced/rechecked in #879's completion pass. Carry the shared resolver into every descendant. Gate on real API reorder, prune, restore and package output—not a catalog-only assertion. |
| P1 | A stale TOC draft can retain position-keyed entry identity after another writer changes the list. | #880 owns correction. Its current evidence/source inspection reports the gap; do not count the successful ordinary manual walkthrough as coverage. Gate on two-writer draft rebase/save and preserved target links. |
| P2 | Combined stage range can skip explicitly confirmed TOC replacement because authorization does not reach the actual generation step. | #880 owns consent propagation; preserve the confirmation's target/version scope and test the real combined runner. |
| P2 | Protected fixed-layout rendering can survive a skipped rerun while its matching positioned source tree is removed. | Already addressed in #884; integrate the existing implementation into the appropriate upstream/descendant continuation with attribution. Verify pair persistence and preview/export after restart. |
| P2 | Shared Easy Read references can duplicate generation and alternate signatures; direct Easy Read/Gemini routes use different publication/context rules from the main runner; corrupt cached audio may be skipped indefinitely. | Corrected in #879's completion pass. Descendant source inspection shows the older shared-source merge/direct-route patterns; those branches need integration and fresh transport/storage evidence. No claim that every descendant was independently reproduced. |
| P2 | Status acceptance previously omitted stale-existing output/sidebar behavior, and packaging cache trusted image size/mtime. | Corrected in #879. Gate on Save → read model → sidebar → review → restart and changed bytes with unchanged file stats. |
| P2 | Identityless or contradictory legacy rendered ownership cannot be reconstructed safely from current position or moved leaf IDs. | #879 retains raw content/history, omits unsafe section associations and discloses them. This differs from ordinary legacy missing freshness evidence, whose usable owned output remains visible and protected. The user delegated the safe omission choice with documentation; original AC-7/12 remain qualified pending spec-owner ratification or a safe repair workflow. Never fabricate an owner or generation provenance. |

## Completion process for each continuation

1. Freeze the exact source/dependency heads and map every AC plus narrative,
   examples, compatibility and non-goals to observable evidence before editing.
2. Trace every public entry point through admission, worker, publication,
   persistence and read model. Include direct item routes, CLI and packaged API.
3. Write regressions for the counterexample first. Count provider requests at
   the transport boundary; use real SQLite/files when preservation matters.
4. Give an independent reviewer the original spec, not only the author's
   completion table. Require adversarial cases and re-review after fixes.
5. Run applicable full tests, types, lint, build, invariants, five-locale
   extraction, representative books, Docker and Desktop. Label unavailable
   platform/live-provider checks honestly.
6. Publish to the same PR only after no known material contract defect remains,
   then verify CI on that exact head and request human review. Keep a failed,
   blocked or not-run matrix row visible; it cannot become passed by prose.

The earlier misses came from incomplete end-to-end traceability and tests whose
fixtures kept source/render order aligned, along with review that did not test
all public entry paths and cache failure states. More passing unit tests alone
would not prevent repetition. The independent counterexample review and explicit
compatibility matrix are required completion gates, not optional follow-up work.

The live `develop` index also contains reserved/draft SPEC-0004–0008 and an
in-review SPEC-0015. It is not a complete inventory of unmerged spec PRs; no
implementation or approval is inferred from a reserved number or merged code.
SPEC-0014/0015 and later roadmap work were not behaviorally audited here.
