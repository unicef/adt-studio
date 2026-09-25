# SPEC-0011 implementation evidence

The persistence, resolution, migration and editor slice is implemented locally on
`spec/629-prompt-persistence` for existing PR #887. **The full integrated spec is
not declared complete:** shared freshness/host-input comparison is unavailable,
and Docker runtime persistence has not been exercised. The documented safe
fallback explicitly tells users to regenerate affected outputs. Human approval
is pending: the spec remains `in-review`, approvers are empty and ADR 027 is proposed.

## Preparation and scope

The complete published spec, issue #629, PRs #887/#644 and their discussions were
read. Neither PR had comments or reviews. Current develop was refreshed at
`737d331418d13f930955504e8288ee26ec1b20ba`; the final remote check found it unchanged.
Published #887 remains `bb37a583c9080315a23aed6a0c9925d140d6d739`. A recoverable local
ref, `backup/spec-0011-published-20260925`, preserves that head. Only the SPEC-0011
commit was rebased onto develop, preserving its spec, INDEX row, ADR and ADR indexes
and removing unrelated inherited specification ancestors. No descendant was merged.

PR #644 remains open and unchanged at `64770d098958a7cc2e4aad79dcd10d5fadc405a1`.
Its four commits by Kemal Sokolovic were reused with `cherry-pick -x` attribution,
then adapted to current model configuration and the expanded contract. Local
implementation commits include `929d73f2` (shared store/resolution), `19f1e731`
(editor migration) and `8f5e3ade` (archive/deployment and parity refinements).
The source issue is informational; no closing keywords were added.

Actual dependency review found #879 (`375081fc`) and #880 (`5eeaab68`) were
specifications, not working freshness/preservation services. #886 was a document
ancestor, not an implementation prerequisite. No separate freshness subsystem
was introduced. Current AGENTS, architecture, guidelines, invariants and applicable
ADRs were read alongside the supplied Path to 1.0 and SDD reference materials.
The user's explicit sequencing override authorizes implementation before approval.
The main checkout's uncommitted drafts and other implementation worktrees were
left untouched.

The AC-to-current-behavior/change/verification map was committed **before editing**
in `192a9884`. The final evidence below updates its outcomes. Baseline before the
source changes: `pnpm build` and the original prompt API/resolver/editor-focused
suite passed (72 tests). Those baseline results are distinct from final evidence.

## AC-to-evidence matrix

“Passed” is development acceptance for the stated fixture, not human approval or
release verification. “Blocked” identifies the remaining full-contract gap even
when the permitted fallback or another part of that criterion passed.

| AC | Status | Concrete evidence / limits |
|---|---|---|
| 1 | Passed | Shared `PromptPersistenceInfo`, global and book editors display actual source/candidate, logical destination and dirty state. Live browser verified global labels and save destination. |
| 2 | Passed | `prompts-persistence.test.ts`: independent processes reload the winner with bundled files chmod read-only; Electron host harness saves in isolated user data and survives API process restart. |
| 3 | Passed | Resolver tests and API model-first/reset fixtures agree with the real engine. Stage, targeted, agent and actual CLI transport fixtures cover root parity. |
| 4 | Passed | Bundled model variant still outranks a book generic; API returns the real source/name. Editor displays that identity and warns about generic precedence. |
| 5 | Passed | Save/reset/restore require revisions (428); stale mutations return current state (409). Global controller and book draft tests preserve loaded revisions and drafts. |
| 6 | Passed | Concurrent independent Node writers produce exactly one 200 and one 409; mixed Save/Reset/Restore also has one winner. Immutable selection identity catches A → B → A. Real SIGKILL fixtures retain the authoritative selection and require explicit stopped-writer gate recovery. |
| 7 | Passed | Stale identical requests conflict; re-read then identical Save creates no second version. Clients do not auto-retry writes and re-read after ambiguous failures while retaining the draft. |
| 8 | Passed | Fault injection before initial and subsequent pointer rename leaves the prior content active; reload never promotes an orphan. Missing/corrupt new pointers fail explicitly. Editor error tests show no successful save or lost draft. |
| 9 | Passed | Save/reset/restore retain all historical bytes and fresh selection IDs. Live browser reset retained its saved version and the visible restore control selected it again. |
| 10 | Passed | API validation/legacy tests, persistent model-folder collision checks, symlink escapes, resource aliases and overlapping roots are rejected. Model metadata is validated before migration. Concurrent model aliases saving different prompts are rejected under the writer gate, including book-local ownership. |
| 11 | Passed | Deferred-save tests retain newer global/book typing; network/conflict failures retain drafts. The real global route regression test exercises Stay and Save & leave. Live navigation exposed and verified the shared guard fix. |
| 12 | Passed | `prompt-generation-parity.test.ts`: real stage worker, targeted renderer and agent renderer send editor-selected bytes to stubbed HTTP transport and store those bytes in call logs. `prompt-cli.test.ts` launches the actual compiled CLI and captures its model-specific include at transport. |
| 13 | Blocked | Real cache test counts provider fetches: template/include changes miss, unchanged/restored content hits, unrelated entries survive, and in-flight logs retain captured bytes. Save makes zero transport calls. Shared freshness is absent; the implemented explicit regeneration notice is the specified safe fallback. |
| 14 | Passed | Real filesystem migration covers idempotence, source retention, same-name/different-byte conflict, invalid model metadata, interrupted publication/retry, and newer target versions/flat-file selections. |
| 15 | Blocked | macOS unpacked build and real Electron utility-process harness pass with read-only packaged prompts and isolated user data. Docker defaults/configuration are updated, but no daemon or Docker app is available for a container/volume restart test. |
| 16 | Passed | API fixture with a different writable root still reads bundled sibling templates; Electron harness checks returned template bytes against packaged `templates`. CLI keeps the same bundled-parent derivation. |
| 17 | Blocked | Real ZIP export/import preserves book versions, selection, page identity and actual SQLite call-log messages. Export snapshots under the prompt gate and excludes the gate; a concurrent subsequent save cannot change the archive. Import warns about host globals. Automatic identification/comparison of changed host-global inputs awaits shared freshness. |
| 18 | Passed | Lingui extraction: 3,629 messages, zero missing in `es`, `fr`, `pt-BR`, `sq`; English source complete. Lint has zero errors. No manifest/lockfile dependency changes. |

Primary regression files:

- [Persistence and migration API contracts](../../apps/api/src/routes/prompts-persistence.test.ts)
- [Process death and competing mutation recovery](../../apps/api/src/routes/prompts-recovery.test.ts)
- [Resolver compatibility](../../packages/llm/src/__tests__/prompt.test.ts)
- [Transport cache and in-flight capture](../../packages/llm/src/__tests__/prompt-cache-contract.test.ts)
- [Generation path parity](../../apps/api/src/services/prompt-generation-parity.test.ts)
- [Actual CLI entry](../../packages/pipeline/src/__tests__/prompt-cli.test.ts)
- [Archive portability and concurrent save](../../apps/api/src/services/prompt-portability.test.ts)
- [Global editor draft behavior](../../apps/studio/src/components/app/screens/settings/globalPrompts.test.tsx)
- [Book draft behavior](../../apps/studio/src/components/pipeline/components/PromptViewer/promptDraftSave.test.ts)
- [Editor model parity, restore and navigation](../../apps/studio/src/components/pipeline/components/PromptViewer/PromptViewer.test.tsx)
- [Configured base-model classification](../../apps/studio/src/components/pipeline/stages/book/GlobalPromptsSettings/promptSettings.test.ts)
- [Global route navigation](../../apps/studio/src/routes/_app.settings.prompts.test.tsx)
- [Electron host smoke harness](../../scripts/prompt-persistence-desktop-smoke.ts)

## Additional confidence review

An adversarial review reproduced a model-ownership race: two requests using model
IDs that sanitize to the same folder, but saving different prompt names, both
returned 200. Their initial ownership checks ran before either acquired the writer
gate. The fix in `7b00c8ba` rechecks ownership inside the gate and includes book-local
selections. The regression failed before the fix (`[200, 200]` instead of
`[200, 400]`) and passes for both global and book scopes afterward; the losing
request leaves no version directory. No user-visible strings were added.

`81f12d80` adds real child-process SIGKILL tests immediately before and after the
atomic pointer rename. Before publication, readers retain the prior selected
bytes; after publication, they read the newly committed bytes. Both retain old
versions and a gate owned by the terminated process. After the test confirms that
writer is dead, explicit operator recovery plus a re-read/identical retry creates
no duplicate version. These are process-crash tests on macOS, **not power-loss or
Windows durability proof**. Another test races Save/Reset/Restore against one
loaded revision and asserts one winner with all earlier version bytes retained.

The transport-boundary cache test now also changes the selected main template,
checks that an unrelated prompt still hits its cache, and restores the original
effective bytes under a new selection ID without another provider call. Focused
API checks passed 76 tests across three files; the expanded cache check passed.

## Full implementation review

The [review report](SPEC-0011-review.md) records eight corrected findings against
the original specification and cross-system behavior. Source commit `a4671d0c`
fixes reverted typing during Save, model-preview parity, alternate-reset revision
bypasses, late cross-book restore responses, disabled/pending restore controls,
ambiguous reset/restore response reconciliation, false no-op copy feedback and
misleading navigation rerun wording. The added regressions and existing navigation
checks pass 27 tests across six focused files. All five locales remain complete.
No spec approval, freshness implementation or release verification is implied.

## Final commands and results

The final application/test source is `a4671d0c`; subsequent changes record
documentation. Packaged Desktop and live-browser evidence below was collected at
`8f5e3ade`, before the additional API ownership and Studio review fixes; it was not rerun for those fixes.

| Check | Result |
|---|---|
| `PATH=/Library/Developer/CommandLineTools/usr/bin:$PATH pnpm test --maxWorkers=4` | Passed: **289 files, 3,652 tests**, including pretest build. The explicit PATH selects working Git; the default Xcode shim refuses to run without a license acceptance. No system license was accepted or changed. |
| `pnpm typecheck` | Passed. |
| `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm lint` | Passed with 0 errors and 8 unused-suppression warnings; no claim that these warnings were independently baseline-tested. |
| `pnpm build` | Passed, including runtime bundle build. |
| `pnpm --filter @adt/studio build` | Passed after review fixes; production Vite/Lingui bundle compiled. Chunk-size and plugin-timing warnings remain informational. |
| `pnpm --filter @adt/studio extract` | Passed, zero missing translations across all five locales. |
| `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @adt/desktop build:unpack` | Passed on macOS arm64; ad-hoc signed, notarization skipped. |
| Electron harness against final packaged resources | Passed: global/book saves, API restart, packaged prompt hash unchanged after chmod read-only, correct user-data roots and template lookup. Harness selects packaged adapter mode explicitly; this is not an installed-app/full-renderer launch test. |
| `pnpm --filter @adt/desktop typecheck` | Failed in web check: three TS2307 errors for `@root/scripts/release-version.mjs` / `release-source-notes.mjs`. Reproduced identically on a source archive of unchanged develop `737d3314` using the same installed dependencies. Desktop node typecheck passes. |
| Live Studio browser | Verified source/destination/dirty feedback, Save, reload, navigation guard, reset and retained-version restore; tested at 1280×720 and corrected the clipped restore control. A later browser refresh after rebuild hit browser-control timeouts; final automated UI and full-suite tests passed. |
| Docker daemon/runtime | Blocked: `docker info` cannot connect; no Docker app is installed. No container smoke claimed. |
| Dedicated invariant command | Not available: `pnpm lint:invariants` remains planned in this repo. Existing tests/typecheck/lint and the new documented invariant cover available checks. |
| Diff / spec metadata | Whitespace, local evidence links, all 18 ACs, INDEX status and proposed ADR metadata checked. |

Representative fixtures use the repository's `tests/fixtures/raven.pdf`, real
SQLite/filesystem storage and real ZIP export/import. Transport is stubbed, so no
paid model run or full representative-book output-quality acceptance is claimed.
No new hosted CI has run because implementation commits have not been pushed.
Docker, Windows/Linux runtime, installer upgrade, notarization and release checks
remain not run or unavailable. No spec approval or release-verification status is set.

## Delivery and remaining decisions

All implementation commits stay on the named local branch in the isolated worktree.
**No push or merge.** The existing PR title/body is updated to describe this combined
scope and clearly state that code is local. The remote PR still has its original
spec head and document-stack base; retargeting it before uploading the rewritten
head would expose unrelated ancestors. After push authorization, recheck the remote
head, use its exact lease if rewriting, and retarget #887 to develop in the same
publication step. Do not create a replacement PR. `elasticsounds` remains requested.

The original spec ratification questions remain human-owned. Operational choices
are documented in [PROMPT_PERSISTENCE.md](../PROMPT_PERSISTENCE.md): conservative
root-wide gates, explicit stopped-writer recovery, collision errors instead of
silent overwrite, preservation of all sources/history and no in-place old-binary
downgrade. No acceptance criterion was weakened to fit implementation. The missing
shared freshness integration and deployment evidence are disclosed above.
