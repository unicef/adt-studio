---
id: SPEC-0010
title: Safe CLI reruns and extraction admission
status: in-review
owner: "@ksokolovic"
approvers: []
issues: ["#810"]
prs: []
adr: "docs/DECISIONS.md#026-existing-books-require-verified-extraction-reuse"
created: 2026-09-22
updated: 2026-09-22
---

## Decision under review

Running the pipeline again against an existing label must never implicitly destroy the book. Reuse a verified, complete extraction of the same PDF and effective extraction settings, then use the shared preservation-aware downstream plan. If source identity, extraction compatibility or safe downstream admission cannot be established, stop before mutation and explain how to create a separate book.

For B1, changed-source extraction uses a **new book label/directory**. In-place replacement of an existing extracted page set is deliberately unavailable until a reviewed versioned extraction-generation design exists. This is a proposed product restriction, not a statement that today's implementation already works this way.

[#810](https://github.com/unicef/adt-studio/issues/810) owns extraction admission; [SPEC-0001](https://github.com/unicef/adt-studio/pull/879) and [SPEC-0002](https://github.com/unicef/adt-studio/pull/880) continue to own downstream freshness and editorial protection.

### Coordination with existing specs

[PR #879 / SPEC-0001](https://github.com/unicef/adt-studio/pull/879) and [PR #880 / SPEC-0002](https://github.com/unicef/adt-studio/pull/880) are still proposals. References below describe required interfaces and safety properties, not approval or implementation of those PRs. This spec does not publish or depend on unpublished local revisions of them.

The current freshness draft covers four downstream output families, and the preservation draft does not establish complete CLI/DAG parity or safe reuse of every stage. This spec requires that missing coverage before enabling full resume. Unknown-origin protection here is a proposed safety requirement; it must be reconciled with the preservation draft's legacy-as-AI rule.

## Problem (with evidence)

Checked on 2026-09-22 against [develop `7a88965284faebcc0beb2e357a5adda9fbfbda45`](https://github.com/unicef/adt-studio/tree/7a88965284faebcc0beb2e357a5adda9fbfbda45):

| Path | Observed behavior |
|---|---|
| `packages/pipeline/src/pipeline-dag.ts:175–184` | Opens storage and copies the supplied PDF into the existing book before run admission or source comparison. |
| `packages/pipeline/src/pipeline-dag.ts:241`; `pdf-extraction.ts:104` | A full CLI run unconditionally executes extraction, which calls `clearExtractedData`. |
| `packages/storage/src/book-storage.ts:70`, `:603` | Image/debug files are deleted before the clearing DB transaction. Most node history, pages, image rows and step rows are deleted. |
| `apps/api/src/routes/stages.ts:164–190` | API Extract reruns have an additional destructive pre-run path, including identity/media retirement before extraction. |
| `packages/pipeline/src/core-tts.ts:203–216` | Manual normalization reuse depends on reading the previous catalog; clearing its history removes that input. |
| `packages/pipeline/src/cli-args.ts:7` | No resume/re-extract intent is represented in the current CLI contract. |

The issue's older SQL omits a change now on develop: quiz history is retained through versioned invalidation, alongside the font exceptions. That does not protect the other entity histories. The issue's “nothing is reusable” wording is also too broad: disk LLM caches can survive. Cache reuse is not restoration of manual edits, stable identity or rollback history.

## Goals

- Make repeated CLI/API admission safe for existing books and preserve all prior versions and referenced assets.
- Distinguish unchanged extraction reuse from a changed source, changed extraction settings and an incomplete extraction.
- Prevent early PDF overwrite, ID reuse and partial cleanup before validation.
- Keep book data and extraction provenance inside the owning book directory.

## Non-goals

- In-place PDF replacement, automatic identity mapping between PDFs, or a new extraction-generation/archive format in B1.
- A destructive `--force` escape hatch, silent backup-and-reset, or an expanding survivor allowlist.
- Reimplementing a separate downstream scheduler or provenance store; shared policies must be reconciled in SPEC-0001/0002 before use.
- Repairing history already erased by previous runs, guaranteeing zero cost for changed inputs, or changing CLI progress rendering from #811/PR #876.

## Proposed design

### Options

| Option | Relative cost | Assessment |
|---|---|---|
| Warn, then keep deleting; or add more survivor types | Small | Rejected: does not preserve entity history and cannot prove source identity. |
| Verified reuse; fail closed for incompatible existing books; new destination for replacement | Moderate shared admission and manifest work | Recommended bounded B1 change. |
| Version every extraction generation and atomically switch the entire active graph | Large storage/reader/media migration | Future design if same-label replacement is required. |

A safety-only first slice may reject all occupied extraction destinations. It mitigates data loss but does not complete safe resume or close #810. Completion requires the reuse path and preservation-aware downstream execution below.

### Admission outcomes

Preserve the existing command shape, `pnpm pipeline <label> <pdf-file> [options]`. Determine its behavior from validated destination state; do not introduce an ambiguous “force” flag.

| Destination and source state | Result |
|---|---|
| New destination, or initial imported book with no extracted/derived content and no prior extraction attempt | Create an extraction manifest and run initial extraction. Existing import metadata is preserved. |
| Complete manifest; identical PDF bytes, effective extraction inputs and supported extraction contract; required extracted assets intact | Reuse extraction without rewriting PDF, pages, images, extraction entities or history. Plan downstream work through the common safety policy. |
| PDF differs, page range/spreads/layout/extraction setting differs, contract version is incompatible, or extracted bytes are missing/corrupt | Reject before mutation; report the mismatch class and instruct use of a new label. |
| Existing extracted/derived content without a trustworthy manifest | Reject automatic full rerun as legacy/unknown. Existing Studio editing remains available. |
| Failed/interrupted initial extraction or incomplete manifest | Reject automatic reuse and preserve diagnostic/partial state. Use a new destination; no implicit clearing. |
| Active conflicting writer or uncompleted admission/recovery record | Reject as busy until the active operation ends or recovery resolves it. |

A zero-page successful extraction is not a reusable book. A newly reserved destination can contain the source PDF and metadata without being considered an occupied extraction, but arbitrary existing rows or image files cannot be treated as empty. Admission inspects before creating/opening mutable storage or copying source bytes into an existing location.

### Extraction manifest and fingerprint

Define a versioned Zod manifest in `@adt/types`, persisted through book storage as application provenance. Include:

- A content hash of the actual PDF bytes; filename, modification time and file length are insufficient.
- Normalized effective page window, spread mode/pairs, figure-extraction mode/derived flags, watermark policy and fixed-layout extraction behavior.
- An explicit extraction contract version covering output/identity semantics. A relevant extractor change must bump it; do not invalidate books for an unrelated app patch version.
- An ordered inventory of resulting source page IDs and extraction-owned assets with content hashes, plus completion/attempt status.

Normalize defaults with the production config resolver, including CLI overrides and fixed page windows for parts. Equivalent omitted/explicit defaults produce the same fingerprint. Language/model/voice/prompt settings consumed only downstream do not force extraction. Any new extraction-affecting option must join the fingerprint and its tests.

The manifest inventories immutable extraction outputs, not editor-owned semantic trees. Later user-created crops/assets must not invalidate an otherwise intact original extraction inventory. Fingerprinting does not mark any downstream output current.

Persist a completed manifest only after all expected pages/assets and extraction metadata are durably present and validated. A crash before that point leaves an incomplete attempt, never a complete reusable extraction. Snapshot the source bytes used for extraction in the new book so a changing external PDF cannot produce a manifest for different bytes. Use the stored snapshot as the input. No provider calls are needed to decide extraction reuse.

### Writer coordination and mutation order

Use the shared book writer admission primitive, not just an in-memory CLI boolean or a query for `step_runs`. API stage runs, TaskService jobs, direct extraction calls and supported CLI processes accessing the same directory must participate. Pure JS/SQLite/filesystem primitives are sufficient; do not add native locking dependencies.

Admission takes the book writer gate, validates source/destination/manifests and captures the effective inputs before any source copy, ID retirement, file cleanup or node clear. A second contender cannot pass an empty-book check while the first starts extracting. The process that owns admission retains the necessary lease through mutation; readers must not expose incomplete extraction as a usable page set. A crashed owner is distinguished from a slow active one before recovery releases ownership.

Put the protection at the common extraction boundary as well as caller orchestration. A direct `extractPDF` call must not bypass it. Remove unconditional `clearExtractedData` from ordinary extraction/rerun admission. On a new destination, write the initial data without resetting an existing graph. Destructive book deletion remains an unrelated explicit operation, not a rerun implementation detail.

API `fromStage: extract` uses the same outcomes before `makeBeforeRun` retires IDs or clears data. Identical complete extraction is reused; incompatible extraction returns a structured conflict. Studio explains that changing the source/extraction layout requires a new book in this B1 release. A generic cascade confirmation cannot authorize the old destructive path.

### Downstream resume

Skipping extraction alone is insufficient: a full DAG can still regenerate over manual outputs. After reuse, execute only through SPEC-0001/0002's common planner and write policies. Current scopes are reused, eligible stale scopes can be regenerated, and protected/unknown scopes follow the explicit review rules. Never feed a preserved book into the legacy unconditional full-run body as a fallback.

Until those shared capabilities cover a requested stage, stop with `UNSAFE_RESUME_UNAVAILABLE` before content writes or paid work. Partial integration may expose an admission-only dry result, but may not claim a completed pipeline. The CLI should summarize reused extraction, completed/reused/skipped/blocked work and unresolved protected scopes; unresolved required work exits nonzero. A reused extraction is not a newly generated result or an upstream-failure skip.

Use normal ordered-input LLM cache keys and current validators. No global cache deletion, random cache key or new no-cache flag follows from rerun admission. An unchanged complete book should need no provider call when every downstream scope is proven current. An unknown freshness record is not equivalent to current.

### New-source workflow and compatibility

For changed source/settings, the error gives a concrete command shape using a **user-chosen fresh label**; it must not silently select or overwrite a sibling destination. The new book is independent. Do not carry old edits, media assignments or IDs across by matching page/section numbers. The existing book remains zippable, inspectable and recoverable with its original PDF and versions.

Legacy books without manifests are not automatically backfilled from today's PDF and settings: those may differ from the inputs that produced their pages. A future adoption/re-extraction workflow needs its own proof and review. The B1 restriction is deliberate and must be disclosed in CLI/API documentation and release notes.

## Impact map

| Area | Expected work / coordination |
|---|---|
| Types/storage | Manifest/attempt schemas, inventories and shared writer admission; additive metadata, no historical content migration. |
| Pipeline/CLI | Pre-copy admission, complete extraction publication, reuse outcome and common downstream planner entry. |
| API/Studio | Replace destructive Extract admission, structured errors and honest new-book guidance. |
| SPEC-0001/0002 | Required for safe downstream resume. These drafts are not assumed approved or implemented. |
| SPEC-0003 | Reused extraction still must pass the Sectioning-mode rendering preflight. |
| Stable IDs/retained media | No rerun retirement or allocator reset on reuse; preserve historical asset bytes, recordings and video assignments. |

The proposed decision is recorded in [ADR 026](../DECISIONS.md#026-existing-books-require-verified-extraction-reuse). It remains proposed until this spec's blocking review questions are resolved. No new runtime enforcement is claimed by this documentation PR.

## Acceptance criteria

- [ ] AC-1 A new/eligible initial-import destination extracts successfully and records a complete manifest only after all required data is durable.
- [ ] AC-2 Same-byte PDF and equivalent effective extraction inputs reuse extraction with no PDF/page/image/history rewrite.
- [ ] AC-3 Changed PDF bytes reject before overwriting the stored PDF, even when filename/size are unchanged.
- [ ] AC-4 Every extraction-affecting option and contract version participates in compatibility; downstream-only settings do not force extraction.
- [ ] AC-5 Missing/corrupt extraction-owned assets, zero-page output and incomplete manifests cannot be reused.
- [ ] AC-6 Legacy books without trustworthy manifests are rejected without guessed provenance or content deletion.
- [ ] AC-7 Interrupted/failed extraction retains its diagnostics/partial data and cannot become complete on restart by assumption.
- [ ] AC-8 Reuse retains all entity histories, version allocation, manual Core TTS, uploaded audio/video and stable-ID mappings.
- [ ] AC-9 No rejected admission calls `clearExtractedData`, retires identities, copies the input PDF, writes content or starts a provider request.
- [ ] AC-10 API, CLI, queued and direct extraction entry points enforce the same admission policy before pre-run mutation.
- [ ] AC-11 Two processes/runners cannot both acquire an empty/existing book for conflicting mutation; crash recovery does not evict a live writer.
- [ ] AC-12 Downstream resume uses shared freshness/protection semantics and stops before mutation when those capabilities are unavailable.
- [ ] AC-13 Proven-current complete output causes no provider calls; stale/unknown/protected work is reported honestly and required unresolved work exits nonzero.
- [ ] AC-14 Normal valid LLM caches survive admission and are still validated/reused by generation.
- [ ] AC-15 Changed-source guidance requires a fresh user-selected destination and never transfers old IDs/edits by position.
- [ ] AC-16 CLI/API errors identify the mismatch/busy/legacy reason without book text or secrets; Studio messages are translated in all five locales.
- [ ] AC-17 Source mutation during initial import cannot produce a completed manifest that describes different extracted bytes.
- [ ] AC-18 Book archives retain source, manifest, histories and referenced media; no book-specific provenance lives in a global directory.

## Test plan

| Layer | Criteria | Required evidence |
|---|---|---|
| Manifest/config units | AC-3–6, AC-17 | Same-length different PDFs, defaults vs explicit settings, part window, spreads, extractor-version change, downstream-only model change, corrupt/missing assets. |
| Real-storage extraction integration | AC-1–2, AC-7–9, AC-18 | A small PDF plus multi-version manual content, audio/video and known IDs; compare rows, versions and file hashes before/after reuse and rejection. Inject failure at each publication boundary. |
| Production entry paths | AC-9–10, AC-12–14 | CLI and API Extract rerun, queued start and direct extraction; spies for cleanup/provider calls; demonstrate no legacy-run fallback. |
| Process/concurrency fixtures | AC-11, AC-17 | Two independent Node processes, competing API task, process termination during initial extraction and mutated source file. |
| CLI/Studio workflow | AC-13, AC-15–16 | Noninteractive errors/exit codes, translated guidance, new-label success with old book byte-for-byte preserved. |

Use deterministic stub providers for the preservation/no-call assertions; no real provider spend is necessary for these regressions. Run a copied acceptance book through the integrated API and CLI paths before claiming delivery. No runtime tests were run for this draft.

## Rollout

First block destructive occupied-destination admission across callers. Then add manifests for new extractions and verified reuse. Enable downstream resume only after the common policies cover its stages. Each slice has its own tests; safety-only refusal does not satisfy the full acceptance set.

Rollback may retain refusal and disable resume. It must not restore an unconditional reset or reinterpret an incomplete manifest as empty. Existing books stay editable; their unsupported full rerun is explicit. This spec deliberately defers a costly extraction-generation migration beyond B1.

## Open questions

| Question | Owner | Resolve by |
|---|---|---|
| Ratify the B1 restriction: changed-source and legacy unknown-provenance full extraction require a new book, rather than an in-place reset. | @ksokolovic, obtaining product sign-off | 2026-09-25, before spec approval |
| Confirm shared writer admission/recovery and which downstream capabilities must land before CLI resume is enabled. | @ksokolovic, coordinating storage/integration review | 2026-09-25, before spec approval |
