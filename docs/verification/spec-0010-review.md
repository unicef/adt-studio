# SPEC-0010 implementation review — 2026-09-25

Historical review checkpoint: publication was subsequently authorized on
2026-09-26. See [the implementation evidence](../specs/SPEC-0010-implementation-evidence.md)
for current branch naming and dependency refresh, and PR #886 for published head
and hosted checks. The "not pushed" statements below describe this review's time.

This is a fresh behavioral review of local implementation head `47c3fbfc`, with
remediation committed on `spec/810-safe-cli-reruns`. It is not a human approval
or a claim that the complete specification is implemented. No commits are pushed.
The remote PR #886 still contains specification head `d906d7f3`; local work is
based on refreshed develop `737d3314`. The main checkout and other PRs are unchanged.

## Scope and method

Reviewed the complete SPEC-0010, issue #810 and its discussion, PR #886, actual
#879/#880/#884 heads and discussion, AGENTS, architecture, guidelines, invariants
and ADR 026. The supplied roadmap/SDD references require the complete
import → generate → edit → export → reopen loop, retained history/media, and
truthful separation of implementation, human approval and release evidence.

The before-edit AC map remains in
[implementation evidence](../specs/SPEC-0010-implementation-evidence.md#before-edit-acceptance-map).
This review traced common admission → API/CLI orchestration → direct extraction
→ storage/manifest publication → read guards and archive restore, plus the
background writer, queued work, cancellation, configuration and Studio error paths.
Additional verification targeted AC-1/2/5/6/9/10/11/18 without changing the spec.

## Findings and remediation

### P1 — archive aliases could overwrite the importing process's writer record

`importProject` skipped only literal `.book-writer.json` and recovery names.
An entry such as `./.book-writer.json` or `nested/../.book-writer.json` resolved to
the active record after passing the root-containment check. A real ZIP regression
overwrote that record and failed at lease release with a JSON parsing error,
leaving imported content and a poisoned ownership record. Replacing an ownership
record also defeats the proof on which independent writer exclusion relies.

The importer now filters normalized destinations, including case and trailing
period/space aliases on supported filesystems, before writing. Four alias cases
verify successful import without copied control records and normal subsequent
writer admission. No separate lock mechanism was introduced.

### P2 — collision-renamed project imports invalidated otherwise intact extraction

Importing `book` while it already existed selected `book-2`, renaming the PDF and
DB but leaving `extraction.json` pointing to `book.pdf`. A real extraction → ZIP →
import → reuse test failed with `EXTRACTION_ASSETS_INVALID`.

Import now relocates only the source asset filename in existing provenance,
retaining the source/input hashes, attempt ID, page/image/node inventories and
historical versions. Complete imported inventories are validated against the
actual restored database and asset bytes before acceptance. A corrupt image
rejects and cleans up only the new import. Legacy archives gain no invented
provenance. The original book's manifest and database remain unchanged.

### P2 — a supported font upload prevented a book's first extraction

Initial admission permitted font-registry/assignment metadata but rejected its
`fonts/` files. The actual upload route followed by first extraction reproduced
`EXTRACTION_LEGACY` on an otherwise eligible new book.

Admission now recognizes uploaded font inputs only when their names are present
in schema-valid retained font registry versions. It preserves registry versions
and file bytes. Unregistered files and symlinks remain rejected before extraction
mutation. This is validation of initial inputs, not an exemption for an existing
extracted/derived graph or a destructive survivor list.

### Additional verification

An actual CLI subprocess reaches its first intercepted provider-fetch boundary
only after publishing a complete one-page manifest and the exact source snapshot.
The stub exits there; this proves the initial CLI extraction path, not completion
of the entire generation DAG. No real provider requests or paid work are used.

No further blocking defect was established in the implemented safe slice after
these fixes. The known unsupported downstream path remains explicitly refused.

## AC-to-evidence matrix

A = pipeline extraction-admission suite; W = storage writer suite;
H = API extraction-admission suite; R = new extraction-archive suite;
U = Studio extraction-error mapping. All use the production mechanisms; A/H/R use
real PDF/SQLite/filesystem state, W includes independent Node processes.

| AC | Status after fixes | Evidence and practical limits |
|---|---|---|
| 1 | Passed locally | A/H: initial extraction and durable publication; actual HTTP and CLI entry paths; real font upload and retained registry/files. |
| 2 | Passed locally | A/R: direct verified reuse without content/history rewrites, including collision-renamed archive restore. |
| 3 | Passed locally | A: same-length changed PDF rejection; stored source and content hashes unchanged. |
| 4 | Passed locally | A: effective defaults, page/part windows, spread pairs, six extraction flags, contract version, downstream-only settings. |
| 5 | Passed locally | A/R: missing/corrupt assets, zero pages, incomplete/truncated provenance; corrupt restored image rejected. |
| 6 | Passed locally | A/H: legacy remains unadopted and unmodified; unregistered initial font files and symlinks rejected. |
| 7 | Passed locally | A: cancellation, publication fault injection, SIGKILL and restart preserve failed/partial state. |
| 8 | Passed locally | A/H/R: versions, next-version allocation, manual Core TTS, stable IDs, recordings/videos and archive-restored manual histories. |
| 9 | Passed locally | A/H: no rejected content writes or provider transport; invariant bans ordinary extraction resets. |
| 10 | Passed locally | A/H: actual CLI/HTTP, DAG, queue, direct stage/extraction; preflight precedes pre-run mutation. |
| 11 | Passed locally | W/H/R: six process contenders, live/dead owners, pending recovery, API/tasks, async archive lifetime and import control-path aliases. |
| 12 | Blocked for full behavior | A/H verify `UNSAFE_RESUME_UNAVAILABLE` before content/provider work. Shared preservation-aware downstream execution is absent. |
| 13 | Blocked for full behavior | Nonzero CLI refusal is proven. Successful all-current resume and current/stale/protected summaries are absent. |
| 14 | Passed locally | A: real cache and schema validation, exactly one stub backend call across two identical generations separated by reuse. |
| 15 | Passed locally | A: explicit fresh-label workflow, old book unchanged, no positional edit/ID transfer. |
| 16 | Passed locally | H/U and prior UI flow: safe reason codes, translated messages in five locales; no changed Studio strings in this review. |
| 17 | Passed locally | A: external source replacement after extraction starts cannot alter the stored/extracted snapshot proof. |
| 18 | Passed locally | H/R: archive source/provenance/history/media; consistent streaming; collision-renamed restore and exclusion of ownership aliases. |

## Completion estimate and blockers

**Approximately 70% of the original behavioral scope is implemented.** This is
an engineering estimate, not a measured percentage of code or effort. Sixteen of
eighteen numbered ACs have local passing evidence (89% by an unweighted count),
but the two remaining ACs contain the central preservation-aware resume workflow.
An 89% feature-completion claim would therefore be misleading. Initial admission,
manifests and extraction reuse work; ordinary full reruns of an existing book do
not yet resume generation.

| Blocker | Verified state | Work needed before full SPEC-0010 resume |
|---|---|---|
| SPEC-0001 / PR #879, issue #735 | Remote `375081fc` is documentation only; no common freshness/execution planner in this branch | Content-based current/stale/unknown scopes, prerequisite handling, non-destructive invalidation and scoped publication shared by API and CLI. |
| SPEC-0002 / PR #880, issues #736/#144 | Remote `5eeaab68` is documentation only | Provenance, protection of manual/unknown work, explicit replacement/acceptance, conflict-safe writes and retention of referenced physical media. |
| Coverage/decision gaps in those drafts | SPEC-0001 excludes Storyboard/glossary/quizzes/TOC freshness; SPEC-0002 excludes Storyboard full-rerun preservation and still treats missing provenance as AI, contradicting SPEC-0001/0010's unknown protection | Reconcile those contracts and cover every requested full-DAG stage before enabling it. Simply implementing the drafts unchanged or removing the refusal is insufficient. |
| SPEC-0003 / PR #884, issue #708 | Remote `04250fda` is docs only, but local implementation `d9be75df` contains a tested safe slice | Integrate its common Sectioning/rendering preflight and reconcile the single writer protocol; test the combined head. This is an integration prerequisite, not entirely missing code. |
| SPEC-0010's remaining integration | Not implemented here | Invoke the shared downstream plan after extraction reuse, report completed/reused/skipped/blocked/protected work, and verify all-current zero-provider-call success plus stale/failure/cancellation behavior. |

Implementation-before-approval remains authorized. Human review is pending, but
waiting for approval is not the technical reason for the safe slice. The missing
shared mechanisms and unresolved protection coverage are the actual blockers.

## Verification and confidence

- Focused final review suite: **3 files / 51 tests passed**.
- Build, typecheck, lint and extraction invariant: passed. Lint has the same eight
  pre-existing unused-suppression warnings, zero errors.
- API server and Electron API bundles: passed (build checks, not installed
  Desktop acceptance).
- Lingui extraction and strict compilation: passed; 3,613 messages per catalog,
  zero missing translations in es/fr/pt-BR/sq. No catalog changes were required.
- Docker runtime check: blocked; `docker info` cannot find the daemon socket.
- Full regression suite: `pnpm test --maxWorkers=2 --testTimeout=30000` passed,
  **282 files / 3,670 tests**, including the build prerequisite (684.87 seconds).
- The four original failing cases (two path aliases, renamed import and initial
  font upload) were reproduced before the fixes; logs remain locally in
  `tmp/spec0010-independent-review/`.

Other verified commands: `pnpm build`, `pnpm typecheck`, `pnpm lint`,
`pnpm lint:invariants`, `pnpm --filter @adt/studio extract`,
`pnpm --filter @adt/studio exec lingui compile --strict`,
`pnpm --filter @adt/api build:server`,
`node apps/api/scripts/bundle-electron-server.mjs` and `git diff --check`.

Confidence is **high in the implemented safety/reuse behavior on the tested
macOS/Node 22 environment**, with a conservative engineering confidence of about
85%. This is not a statistical probability or release certification. The review
found real gaps missed by prior green tests, so the earlier test total alone was
not sufficient evidence.

Signed/installed Desktop, Windows/Linux filesystem behavior, Docker execution,
power-loss durability, representative partner books and release-upgrade flows
remain unverified. Earlier UI evidence uses a small repository Raven fixture;
this review adds production API/CLI and archive flows, not a new live UI run.
Hosted CI cannot validate unpublished local commits. Overall release confidence
remains moderate, and confidence that the complete original spec is delivered
is explicitly **not claimed**.
