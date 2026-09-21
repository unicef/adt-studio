# Invariants

Principles that only live in prose do not survive agent throughput. Every row here has a check.
Each spec that establishes an invariant adds its checker in the same change. `pnpm lint:invariants` runs every checker below.

| # | Invariant | Check | Runs | Established by |
|---|-----------|-------|------|----------------|
| 1 | The frontend imports only `@adt/types` | dependency lint | every PR | existing |
| 2 | No unconditional `clear*` / `DELETE` of user-touched entities | storage-layer test + lint rule banning new call sites | every PR | SPEC-0001 |
| 3 | Sections and quizzes are created only via the ID factories | unit test over every creation path | every PR | SPEC-0008 (#834) |
| 4 | `PIPELINE` is the single source of stage/step truth | CI check: generated DAG section in ARCHITECTURE.md matches code | every PR | existing |
| 5 | Staleness semantics (per-section, input-version comparison, never delete) | contract tests in `packages/pipeline/test/staleness.contract.test.ts` | every PR | SPEC-0001 |
| 6 | Prompt output contracts | validator suite per prompt (page sectioning exists; extend) | every PR | SPEC-0003, SPEC-0004 |
| 7 | No provider key in logs or model-call records | log scrubber test + grep in CI | every PR | security chain (Block 1) |
