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
| SPEC-0002 | Manual-edit preservation for translation, quiz, sectioning, TOC | draft  | @ksokolovic | Block 1   |
| SPEC-0003 | Three sectioning modes and auto cross-page merge                | draft  | TBD         | Block 2   |
| SPEC-0004 | Style guide, Styles panel, token-enforced rendering             | draft  | TBD         | Block 2   |
| SPEC-0005 | Acceptance harness over the acceptance set                      | draft  | TBD         | Block 1   |
| SPEC-0006 | Cloudflare publishing: scope, ops surface, security             | draft  | TBD         | Block 2   |
| SPEC-0007 | Accessibility harness as a blocking CI gate                     | draft  | TBD         | 0.9.0     |
| SPEC-0008 | Stable identifiers and reading order (retrospective)            | draft  | TBD         | Block 1   |
| [SPEC-0015](SPEC-0015-nano-banana-image-models.md) | Nano Banana image models | in-review | @elasticsounds | #579 / #904 |
| [SPEC-0019](SPEC-0019-cli-pipeline-engine-selection.md) | Explicit pipeline engine selection for Codex and Claude Code | draft | @lucas7maciel | #903 |

SPEC-0001 product clarifications were ratified in October 16 review Note 7; its
status remains `in-review` pending integration approval and final historical-book
acceptance. Development verification is not release verification.
The [October 22 corrective evidence](../verification/spec-0001-oct22-timing-corrections.md)
records legacy timing/editor fixes and clarifies which acceptance checks remain pending.
The [develop integration evidence](../verification/spec-0001-develop-integration-2026-10-22.md)
records conflict resolution, full checks and real UI/packaging verification; it does
not change the approval or historical-book acceptance status.

The [timing/locale correction evidence](../verification/spec-0001-timing-locale-2026-10-22.md)
records two additional regression fixes and their full-suite, UI and packaging
checks without changing those acceptance limits.

Legacy notes, from before this process existed, now in [`docs/analysis/`](../analysis/):
[SECTIONING_CROSSWORD_BUG.md](../analysis/SECTIONING_CROSSWORD_BUG.md),
[SECTIONING_VALIDATION_FAILURES.md](../analysis/SECTIONING_VALIDATION_FAILURES.md)
(May 2026, implemented). They are bug analyses, not specs.
