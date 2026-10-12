# SPEC-0003 B1 — stacked implementation evidence

> Historical evidence. The October 12 product amendment supersedes the persisted-mode gates and whole-run publication described here. See the [current contract and complete acceptance audit](spec-0003-oct12-audit.md) and [new independent review](spec-0003-independent-review-2026-10-12.md). These earlier passing results do not certify the revised behavior.

Historical continuation report. For the subsequent review, fixes and refreshed verification, see [independent B1 review](spec-0003-independent-review.md). Publication statements below describe this earlier continuation.

Date: 2026-10-11. Human approval remains pending. This report supersedes the
functional-gap assessment in the October 10 reports, which remain historical
records. It is not spec approval or release certification.

## Branch, scope and attribution

The existing local PR branch `spec/SPEC-0003-708-sectioning-mode-lifecycle` now
stacks on published SPEC-0002 `373619dd2e7ef7cecf2653cecfda07029401f5e6`, which
contains SPEC-0001 `a10d3fa0da2766f91d217e8b7ad8f9ce4a8457d5`. Develop was
refreshed at `ef31494dc2951b92222c473960fecee2d91f9544`. The original local
continuation is recoverable at `backup/spec-0003-before-stack-20261011`
(`20ce95ed`); the original published head and SPEC-0010 snapshot also have backup
refs. Only SPEC-0003 commits were replayed onto the actual implementation
prerequisite; no descendant was merged into an ancestor.

Implementation commit: `9560f0af` plus the bundled-startup correction recorded
in the subsequent commit. Final runtime/test head: `e906ecc6`.
Later delivery commits change documentation, the acceptance screenshot and trailing
blank lines only; they do not change runtime behavior. The remote branch remains `spec/708-sectioning-mode-lifecycle`; PR #884 remains
open against develop at `e3737abe6bd32e09302571a8f3de153cff37a365`. No push,
force update, retarget, merge, title or description edit was made in this
continuation. Retargeting the old published head before publishing the matching
local stack would give a misleading diff. Review requests for `elasticsounds`
and `zignaggo` were already present and were left intact.

Reuse, rather than a parallel preservation subsystem:

- [SPEC-0001 / #879](https://github.com/unicef/adt-studio/pull/879): shared writer
  admission, catalog reconciliation, output signatures, usable-output warnings
  and retained physical assets.
- [SPEC-0002 / #880](https://github.com/unicef/adt-studio/pull/880): manual and
  unknown-origin protection, exact-version explicit replacement, identity
  allocation/retirement and page-level generation/translation transactions.
  The authored-output admission helper is shared by API and CLI now.
- [SPEC-0010 / #886](https://github.com/unicef/adt-studio/pull/886), published
  `876cc2aefccf86e7b3c01cae3a8c62a40ff5fe08`: adapted extraction input/manifest
  schemas, admission, source snapshot/inventory verification, extraction
  publication and its real-storage/CLI regressions. That PR was not modified.
  A circular import exposed by bundling was removed by extracting the existing
  pure figure-extraction configuration functions into a shared module.
- [#692](https://github.com/unicef/adt-studio/pull/692), by @KaReeeeeeeeEM:
  existing By Page generation validator and cache eviction/retry behavior
  retained and verified through counted transport calls.

Source issue [#708](https://github.com/unicef/adt-studio/issues/708) is referenced
informationally. The supplied roadmap/SDD remain firm references: this is the
B1 lifecycle increment; B2 modes and cross-page merge are outside this work.

## Behavior delivered

Mode changes preserve existing entities/assets and clear only completion.
Deliberate Sectioning uses the shared protection policy, validates retained
protected pages before any provider call, and publishes successful generated
pages only after translation, version/config/source revalidation and ID
allocation. Incompatible manual or unknown-origin pages require explicit
replacement; merely changing the mode grants no replacement permission.

Storyboard uses the persisted active page window, including parts, and the
same By Page preflight at API admission, queued execution, targeted rendering
and CLI/DAG execution. Publication pairs HTML and positioned-tree activation
in one transaction. Failure, cancellation, stale input or an incomplete batch
keeps the previous published output. Sectioning completion alone does not make
old Storyboard current: `storyboardPending` is cleared only by successful
publication for the whole active window. Preview/export reject that known
mode-incompatible state. SPEC-0001's usable catalog-output warnings continue
to allow compatible downstream output; project backup remains available.

CLI resume is deliberately bounded to Sectioning and Storyboard and requires a
verified complete extraction manifest. Both flags are required, in order:

```sh
pnpm pipeline my-book book.pdf --books-dir ./books \
  --from-stage sectioning --to-stage storyboard \
  --protected-replacements ./replacement-versions.json
```

Check `pnpm pipeline --help` for the remaining CLI options; model settings use the book/global configuration.
The optional JSON file is an array such as
`[{"node":"page-sectioning","itemId":"pg001","version":3}]`; use the actual
current protected records for the requested stage range. Supplying it explicitly
confirms those replacements. A stale/mismatched set rejects without replacing
content. Omit it to preserve protected pages. Storyboard-only resume uses both
flags set to `storyboard`. Unscoped existing-book pipeline resume and full
Extract reruns remain conservatively rejected; this implementation does not
claim generic preservation-safe execution of every downstream CLI stage.

## AC-to-evidence matrix

All statuses below describe local runtime evidence, not maintainer acceptance.
`Passed` includes the prescribed fail-closed behavior. Packaging, real-provider
and release limits follow the matrix. The before-edit AC map remains in the
preserved local draft `spec-0003-stacked.md`; its proposed amendments were not
adopted or silently applied to the published criteria.

Evidence keys (paths are relative to the repository):

- **L**: `apps/api/src/services/sectioning-lifecycle.test.ts`.
- **P**: `packages/pipeline/src/__tests__/sectioning-preflight.test.ts`.
- **R**: `apps/api/src/services/sectioning-preflight-runners.test.ts`.
- **U**: `apps/studio/src/hooks/use-sectioning-mode-confirmation.test.tsx`, which also
  exercises `use-book-config.ts` saves and query refresh.
- **W**: `packages/storage/src/__tests__/book-writer.test.ts`,
  `sectioning-book-writer.test.ts`, `book-writer-recovery.test.ts`.
- **S**: `apps/api/src/services/storyboard-publication.test.ts`.
- **E**: `apps/api/src/services/sectioning-existing-book.test.ts` (8 cases).
- **D**: `packages/pipeline/src/__tests__/sectioning-resume.test.ts` (8 cases).
- **X**: `packages/pipeline/src/__tests__/extraction-admission.test.ts` (29 cases).
- **C**: `packages/pipeline/src/__tests__/page-sectioning.test.ts`.
- **B**: interactive browser acceptance on the disposable `spec3-b1-acceptance`
  book, described below.

| AC | Status | Current evidence |
|---|---|---|
| 1 | Passed | L, E: Dynamic → By Page clears the DAG-derived Sectioning/downstream completion closure. |
| 2 | Passed | L: reverse transition invalidates the same closure; packaged API smoke also verifies reverse-mode staleness. |
| 3 | Passed | L, E: Extract completion, source pages and retained page-image bytes stay unchanged. |
| 4 | Passed | L, E, S: multi-version history, identities, old HTML/trees and referenced physical assets survive transitions; explicit replacement adds history. |
| 5 | Passed | L: unchanged effective mode does not invalidate. |
| 6 | Passed | L, U: unrelated/adjacent config saves retain independent fields and cause no mode invalidation. |
| 7 | Passed | L, W: active task/step or competing process returns BOOK_BUSY/409 before writes; admission lease lasts through deferred execution. |
| 8 | Passed | U, B: retained output opens the confirmation dialog, including after completion was cleared. |
| 9 | Passed | U, B: cancel sends no mutation and leaves Dynamic selected. |
| 10 | Passed | U: errors and ambiguous saves refetch persisted config without leaving the proposed selection active. |
| 11 | Passed | U, B: config/debug/status/page queries refresh; stale banner and stage indicators update after save. |
| 12 | Passed | P, R: missing latest Sectioning rejects before rendering. |
| 13 | Passed | P, R: zero sections reject before rendering. |
| 14 | Passed | P, R, E, B: multiple retained sections reject; protected pages need explicit replacement. |
| 15 | Passed | R, S, E, D: rejection causes zero renderer calls; old renderings/trees/media remain; CLI negative cases count zero transport calls. |
| 16 | Passed | E, D, B: exactly one valid persisted section allows positive fixed-layout and reflowable publication. |
| 17 | Passed | P, R: Dynamic preserves multi-section behavior. |
| 18 | Passed | P, R, X: historical/null/malformed data and unknown mode provenance fail safely without requiring an observed save. |
| 19 | Passed within supported resume scope | E: HTTP Sectioning → Storyboard, queued Storyboard and targeted rerender; D: real DAG and CLI child process, fixed/reflowable whole/part windows. Legacy unverified or unscoped CLI resume remains blocked safely (X, S), not claimed as successful regeneration. |
| 20 | Passed | Lingui extraction, five completed catalogs, strict compilation and Studio lint; B verifies English UI flow. |
| 21 | Passed | No package manifest or lockfile additions against published SPEC-0002. |
| 22 | Passed | L: global inheritance, override removal/default Dynamic and invalid-mode rejection with no mutation. |
| 23 | Passed for safety; automatic mutex recovery blocked | L: injected journal/YAML/lifecycle/SQLite failures and child-process exits; W: ordinary transaction SIGKILL and orphan recovery. Recovery succeeds only with provable ownership; anonymous SQLite mutex preserves lock/journal/DB and fails closed. No timeout deletion. |
| 24 | Passed | L, W, S, E, D: admission races, execution-time config/source/section/tree revalidation, stale explicit versions, cancellation, rollback and incomplete-batch rejection. |
| 25 | Passed | P, R, U: full failure count, bounded 20 displayed page identities, malformed/null input, translated actionable summary. |
| 26 | Passed | C: real LLM cache/client with counted stub transport calls; invalid cached multi-section response is evicted/retried, valid response reused. |

## Verification results

| Command/check | Result on the final runtime tree |
|---|---|
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test --maxWorkers 2` | **Passed: 325 files, 4,054 tests**, 270.67 seconds. Includes the bundled-startup regression. |
| `pnpm typecheck` | Passed. |
| `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm build` | Passed through the full-suite pretest build (TypeScript and runtime assets). |
| `pnpm lint` | Passed: zero errors; eight unused-suppression warnings. No claim that these warnings were baselined as unrelated. |
| `pnpm --filter @adt/studio extract` | Passed: 3,682 messages per locale; zero missing translations; final extraction makes no catalog diff. |
| `pnpm --filter @adt/studio compile --strict` | Passed. |
| `pnpm --filter @adt/desktop build:unpack` | Passed after the startup correction: macOS arm64 app, ad-hoc signing; notarization explicitly skipped. |
| Packaged Desktop API smoke | Passed: actual bundle starts under Node and Electron utilityProcess; health 200, mode save 200, authoritative stale state, incompatible preview 409. Isolated profile/book; no installed-app GUI acceptance claimed. |
| `pnpm --filter @adt/api build:server` and bundled server startup | Passed: real production bundle health and stale-state endpoints respond on loopback. |
| Docker `app` target/image smoke | Passed: `docker build --target app -t adt-studio:spec3-b1-local .`; final arm64 image `sha256:686f5dfa432956c3bbd29063444ccf56050b1d542e1e9373395d25730eca5c82`. Real nginx/API/browser rendering, stale preview/export refusal, successful Sectioning → Storyboard → preview/Web Publication for fixed and reflowable layouts; one stubbed provider call per flow. |
| Hosted CI of this local tree | Not run: no push. Published-head CI is listed separately below. |
| `git diff --check`, package/lockfile comparison | Passed; no dependency additions. |

Local command logs are under `/private/tmp/spec3-stack-*`; the final full test
log is `spec3-stack-full-verified.log`, Desktop build log is
`spec3-stack-desktop-final.log`, and the actual Electron utility-process result
is `spec3-stack-electron-utility.log`.

The first integrated full run found six stale assertions/fixtures, which were
updated to the new contract: completion is cleared while content remains;
new lifecycle metadata includes Storyboard readiness; extraction fixtures must
be valid PDFs; changing an existing extraction window is refused; and CLI
Sectioning publication includes translation. No test failure is dismissed here
as pre-existing. The next full run passed 324 files / 4,053 tests.

Packaging then exposed the circular asynchronous import missed by source
execution. The new `apps/api/src/extraction-bundle.test.ts` was run against
`9560f0af` and reproduced the unsettled top-level await failure; the same test
passes with the correction. The full suite was rerun after that fix.

There is no configured standalone invariant-check command on this branch.
Preservation, writer, identity, cache and publication invariant suites are
included in `pnpm test`. No nonexistent check is reported as passing.

## Interactive and artifact acceptance

A disposable copy of the repository's Raven PDF was extracted with the actual
extractor and seeded with two manual sections plus retained fixed-layout output.
Through Studio in the browser:

1. Open Sectioning settings; select By Page, cancel, and observe Dynamic retained.
2. Select By Page and confirm. Observe retained-output warning, Extract done and
   Sectioning/downstream completion cleared.
3. Run without replacing the protected page. Observe bounded incompatibility
   error, unchanged output and no provider call.
4. Check explicit protected-page replacement and rerun. Observe one section with
   newly allocated `pg001_sec003`, Sectioning done and Storyboard still pending.
5. Run Storyboard and observe published fixed-layout output at rendering v2,
   Storyboard done, and persisted `{mode:"page", sectioningReady:true,
   storyboardPending:false}`. Provider transport log contains exactly one call.

The first Storyboard attempt used a Node harness incorrectly marked as Electron
and failed safely before publication; restarting the harness with Node's real
browser renderer completed the flow. This is a harness correction, not a claim
that Node can perform Electron utility-process screenshots.

The [browser screenshot](assets/spec-0003-storyboard.png) records the published
Storyboard. A local copy is also retained at `/private/tmp/spec3-stack-storyboard.png`. Fixture books, logs and test transport
are under `tmp/spec3-stack-ui/` in the isolated checkout and are not committed.
API/DAG tests add reflowable, non-contiguous/part-window, concurrent edit,
queued, targeted and cancellation cases beyond this one-page UI walkthrough.

The final Docker `app` image was exercised on loopback with disposable mounted
books and an OpenAI-only stub transport. Both layouts returned health/Studio
200, stale preview 409, an export task failure while stale, and successful
regeneration followed by preview 200 and a completed export task. Reflowable
Web Publication contained 58 archive entries (6,758,209 bytes); fixed layout
contained 72 (7,013,031 bytes). Each manifest's single reading-order target
exists in its archive. Both runs preserved manual history; the fixed-layout
check additionally compared both prior Sectioning/rendering versions exactly,
source pages, original PDF hash and page pixels. All were unchanged. New
Sectioning/rendering versions and ready lifecycle state were present.

The initial container harness sent only a mode override, selecting the global
reflowable configuration through the API's full-config replacement contract.
The second run preserved all book overrides and verified fixed layout explicitly.
An initial archive check incorrectly expected a fixed-layout filename from the
reflowable run; checking the emitted manifest resolved that fixture assertion.
These harness corrections did not require production changes. The superseded
pre-fix image build was cancelled; all passing image results above use the final
corrected source. The final logs are `spec3-stack-docker-final.log`,
`spec3-stack-docker-smoke.log`, `spec3-stack-docker-fixed-smoke.log` and
`spec3-stack-docker-fixed-storage.json` under `/private/tmp/`. The temporary
container and local acceptance servers were stopped; the local image and
fixture evidence remain available for review.

## Functional boundaries, decisions and release limits

- The successful B1 existing-book workflow is implemented for API and verified
  scoped CLI/DAG runs. The old blanket Sectioning rejection is removed only
  behind shared protection and persisted preflight. Full generic CLI resume,
  unsafe re-extraction and legacy CLI books without extraction identity remain
  a **safe rejected slice**, with previous state retained. B2 is not implemented.
- A crashed ordinary SQLite transaction can leave an anonymous mutex. A mode
  journal does not prove that an older reader has stopped. Without ownership
  and reader coordination, automatic recovery remains blocked and all recovery
  evidence is retained for inspection. There is no timeout-based lock removal.
- The [September 30 review](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5368403884)
  proposes warnings/skipping and informational lifecycle semantics that
  materially differ from the published AC-12–16, AC-18–19 and AC-25. This work
  follows the explicitly requested published strict contract. Those amendments,
  B1/B2 spec identity and ADR 025 remain human review decisions.
- Hosted CI for this local stack is **not run**, because no push is authorized.
  Freshly read PR #884 hosted test/i18n/docker results are green for published
  `e3737abe` only: [run 36195031032](https://github.com/unicef/adt-studio/actions/runs/36195031032).
  Published dependency test/i18n/docker checks are also green for
  [SPEC-0001 run 38094566774](https://github.com/unicef/adt-studio/actions/runs/38094566774)
  and [SPEC-0002 run 38128103123](https://github.com/unicef/adt-studio/actions/runs/38128103123);
  none of those runs certifies this integrated local head.
- No live provider, partner-book corpus, real power-loss durability, network
  filesystem, Windows/Linux Desktop GUI, signed installer, macOS notarization
  or release workflow verification is claimed. English browser acceptance and
  translated catalog compilation do not establish visual QA in all five locales.
