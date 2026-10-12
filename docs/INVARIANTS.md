# Invariants

Principles that only live in prose do not survive agent throughput. Every row here names a check.
Each spec that establishes an invariant adds its checker in the same change.

> **Not every check below exists yet**, and the `pnpm lint:invariants` currently enforces the SPEC-0010 extraction-reset rule only. Until
> then the checks that do exist run under `pnpm typecheck`, `pnpm test` and `pnpm lint`. Treat a
> row whose check is not yet implemented as a debt marker, not as enforcement.

| # | Invariant | Check | Runs | Established by |
|---|-----------|-------|------|----------------|
| 1 | The frontend imports only `@adt/types` | `apps/studio/tsconfig.json` references only `packages/types`, and its `package.json` declares only `@adt/types` — a direct import of any other package fails `pnpm typecheck` | every PR | existing |
| 2 | No unconditional `clear*` / `DELETE` of user-touched entities | storage-layer test + lint rule banning new call sites | every PR | SPEC-0001 |
| 3 | Sections and quizzes are created only via the ID factories | unit test over every creation path | every PR | SPEC-0008 (#834) |
| 4 | `PIPELINE` is the single source of stage/step truth | CI check: generated DAG section in ARCHITECTURE.md matches code | every PR | existing |
| 5 | Downstream input comparison; preserve protected work/history; scoped publication; visible warnings and Core TTS text fallback; skip is temporary and pruning persists | catalog execution/freshness, scoped speech, retained catalog, immutable asset and history tests; [AC-1–16 evidence](verification/spec-0001.md); human approval remains pending | `pnpm test`; Studio walkthrough and packaging checks before rollout | SPEC-0001 |
| 6 | Prompt output contracts | validator suite per prompt (page sectioning exists; extend) | every PR | SPEC-0003, SPEC-0004 |
| 7 | No provider key in logs or model-call records | log scrubber test + grep in CI | every PR | security chain (Block 1) |
| 8 | Manual and unknown-authorship units survive ordinary own-stage and upstream runs; guarded saves reject stale versions; replacement retires identities only on successful publication | `apps/api/src/routes/manual-edit-survival.test.ts`, `packages/pipeline/src/__tests__/catalog-execution.test.ts`, Studio draft conflict tests | `pnpm test`; human UI/release verification remains separate | SPEC-0002 (draft; review pending) |
| 9 | B1 mode transitions retain entities/media and gate persisted Storyboard input | `apps/api/src/services/sectioning-lifecycle.test.ts`, `sectioning-preflight-runners.test.ts`, `packages/pipeline/src/__tests__/sectioning-preflight.test.ts`, and `packages/storage/src/__tests__/sectioning-book-writer.test.ts` under `pnpm test` | every PR | SPEC-0003 B1 implementation (review pending) |
| 10 | Ordinary extraction admission never calls `clearExtractedData` | `scripts/check-invariants.mjs` checks the direct extraction, CLI DAG, stage route and runner; real-storage admission tests cover preservation | every PR | SPEC-0010 safe slice |
| 11 | Prompt mutations compare the loaded revision under a shared writer gate; reset/restore retain versions and failed publication never selects an orphan | `apps/api/src/routes/prompts-persistence.test.ts`, `packages/llm/src/__tests__/prompt-cache-contract.test.ts`, `apps/api/src/services/prompt-portability.test.ts` | `pnpm test` | SPEC-0011 (in review; implementation authorized) |
| 12 | Sectioning correspondence reads never patch content or add versions; unknown rendering provenance is never inferred as generated | `packages/pipeline/src/__tests__/sectioning-sync.test.ts` and `apps/api/src/routes/pages-sync.test.ts` | `pnpm test` | SPEC-0012 |
| 13 | Structured-text adapters make at most one provider request per facade attempt; SDK/parse repair and supported CLI continuations cannot multiply the configured budget | `packages/llm/src/__tests__/client-retry-integration.test.ts` (actual SDK over stub transport); CLI pre-egress gate tests and opt-in `claude-wire-budget.test.ts` / `codex-wire-budget.test.ts` with real installed executables; unsupported Claude alternate backends fail before spawn | `pnpm test` plus explicit executable probes in `docs/verification/spec-0013-provider-wire.md` (default skips are not wire evidence) | SPEC-0013 |

SPEC-0012 also verifies atomic source/render/metadata Save, expected versions,
scoped preservation and guarded repair with real SQLite/provider transport in
`apps/api/src/routes/pages-sync-save.test.ts` and
`apps/api/src/services/sectioning-repair.test.ts`. These are enforced by `pnpm test`;
the standalone invariant script does not yet independently enforce every row.
