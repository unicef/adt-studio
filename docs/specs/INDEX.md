# Specs

One row per spec. Status moves with the spec's front matter; keep the two in sync in the same PR.
Statuses: draft · in-review · approved · in-progress · implemented · verified · superseded.

| Spec      | Title                                                           | Status | Owner       | Needed by |
|-----------|-----------------------------------------------------------------|--------|-------------|-----------|
| SPEC-0001 | Per-section staleness and scoped regeneration                   | draft  | @ksokolovic | Block 1   |
| SPEC-0002 | Manual-edit preservation for translation, quiz, sectioning, TOC | draft  | @ksokolovic | Block 1   |
| [SPEC-0003](SPEC-0003-sectioning-modes.md) | Sectioning modes — B1 lifecycle and persisted-output safety | in-review | @ksokolovic | Block 1 lifecycle; Block 2 expansion deferred |
| SPEC-0004 | Style guide, Styles panel, token-enforced rendering             | draft  | TBD         | Block 2   |
| SPEC-0005 | Acceptance harness over the acceptance set                      | draft  | TBD         | Block 1   |
| SPEC-0006 | Cloudflare publishing: scope, ops surface, security             | draft  | TBD         | Block 2   |
| SPEC-0007 | Accessibility harness as a blocking CI gate                     | draft  | TBD         | 0.9.0     |
| SPEC-0008 | Stable identifiers and reading order (retrospective)            | draft  | TBD         | Block 1   |
| [SPEC-0009](SPEC-0009-validation-fix-routing.md) | Validation findings and safe fix-routing | in-review | @ksokolovic | Block 1 |
| [SPEC-0010](SPEC-0010-safe-cli-reruns.md) | Safe CLI reruns and extraction admission | in-review | @ksokolovic | Block 1 |
| [SPEC-0011](SPEC-0011-prompt-persistence.md) | Explicit prompt scope and durable prompt persistence | in-review | @ksokolovic | Block 1 |
| [SPEC-0012](SPEC-0012-sectioning-storyboard-sync.md) | Sectioning and Storyboard synchronization | in-review | @ksokolovic | Block 1 |

Legacy notes, from before this process existed, now in [`docs/analysis/`](../analysis/):
[SECTIONING_CROSSWORD_BUG.md](../analysis/SECTIONING_CROSSWORD_BUG.md),
[SECTIONING_VALIDATION_FAILURES.md](../analysis/SECTIONING_VALIDATION_FAILURES.md)
(May 2026, implemented). They are bug analyses, not specs.
