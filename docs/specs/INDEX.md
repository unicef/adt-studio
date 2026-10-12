# Specs

One row per spec. Status moves with the spec's front matter; keep the two in sync in the same PR.
Statuses: draft · in-review · approved · in-progress · implemented · verified · superseded.

This table is not the whole list of taken numbers. A spec proposed after it was last
updated appears only in its PR title (`SPEC-NNNN: …`) until that PR merges, and it
already holds its number — check both before taking one
([SPEC_DRIVEN_DEVELOPMENT.md §5](../SPEC_DRIVEN_DEVELOPMENT.md#5-writing-a-spec)).

| Spec      | Title                                                           | Status | Owner       | Needed by |
|-----------|-----------------------------------------------------------------|--------|-------------|-----------|
| SPEC-0001 | Catalog-based freshness and scoped regeneration | in-review | @ksokolovic | Block 1 |
| [SPEC-0002](SPEC-0002-manual-edit-preservation.md) | Manual-edit preservation for translation, quiz, sectioning, TOC | draft  | @ksokolovic | Block 1   |
| [SPEC-0003](SPEC-0003-sectioning-modes.md) | Sectioning modes — B1 lifecycle and persisted-output safety | in-review | @ksokolovic | [Reviewed B1 implementation evidence](../verification/spec-0003-independent-review.md); protected regeneration, fixed targeted rendering and bounded CLI resume verified; approval pending; B2 deferred |
| SPEC-0004 | Style guide, Styles panel, token-enforced rendering             | draft  | TBD         | Block 2   |
| SPEC-0005 | Acceptance harness over the acceptance set                      | draft  | TBD         | Block 1   |
| SPEC-0006 | Cloudflare publishing: scope, ops surface, security             | draft  | TBD         | Block 2   |
| SPEC-0007 | Accessibility harness as a blocking CI gate                     | draft  | TBD         | 0.9.0     |
| SPEC-0008 | Stable identifiers and reading order (retrospective)            | draft  | TBD         | Block 1   |
| [SPEC-0009](SPEC-0009-validation-fix-routing.md) | Validation findings and safe fix-routing | in-review | @ksokolovic | Block 1 |
| [SPEC-0010](SPEC-0010-safe-cli-reruns.md) | Safe CLI reruns and extraction admission | in-review | @ksokolovic | [Full implementation evidence](../verification/spec-0010-full-resume.md); safe extraction and shared full-book resume on SPEC-0003/0002/0001; approval pending |
| [SPEC-0011](SPEC-0011-prompt-persistence.md) | Explicit prompt scope and durable prompt persistence | in-review | @ksokolovic | Block 1 |
| [SPEC-0012](SPEC-0012-sectioning-storyboard-sync.md) | Sectioning and Storyboard synchronization | in-review | @ksokolovic | Block 1 |
| [SPEC-0013](SPEC-0013-page-failure-recovery.md) | Bounded LLM retries and page-scoped failure recovery | in-review | @ksokolovic | Block 1 |
| [SPEC-0015](SPEC-0015-nano-banana-image-models.md) | Nano Banana image models | in-review | @elasticsounds | #579 / #904 |


SPEC-0009 has [Phase A and Phase B implementation evidence](../verification/spec-0009-full-continuation.md) and a [separate independent review](../verification/spec-0009-independent-review-2026-10-12.md). Human approval and release verification remain separate; the specification remains in review.

Legacy notes, from before this process existed, now in [`docs/analysis/`](../analysis/):
[SECTIONING_CROSSWORD_BUG.md](../analysis/SECTIONING_CROSSWORD_BUG.md),
[SECTIONING_VALIDATION_FAILURES.md](../analysis/SECTIONING_VALIDATION_FAILURES.md)
(May 2026, implemented). They are bug analyses, not specs.
