---
id: SPEC-0011
title: Explicit prompt scope and durable prompt persistence
status: in-review
owner: "@ksokolovic"
approvers: []
issues: ["#629"]
prs: []
adr: "docs/DECISIONS.md#027-prompt-overrides-use-writable-roots-and-versioned-selections"
created: 2026-09-22
updated: 2026-09-22
---

## Decision under review

The prompt editor shows both where the effective prompt comes from and where Save will write. Saved overrides are immutable, versioned files in a writable book or global override directory; bundled application prompts remain read-only. Save, reset and version selection have one conflict-safe persistence contract, and every production caller resolves the same effective template.

[#629](https://github.com/unicef/adt-studio/issues/629) is currently labeled fast lane, but [PR #644](https://github.com/unicef/adt-studio/pull/644) has grown into a storage and cross-package interface change. This draft supplies its review contract; it does not open a competing implementation PR or treat that PR as approved.

### Coordination with existing specs

[PR #879 / SPEC-0001](https://github.com/unicef/adt-studio/pull/879) and [PR #880 / SPEC-0002](https://github.com/unicef/adt-studio/pull/880) are still proposals. References below describe required interfaces and safety properties, not approval or implementation of those PRs. This spec does not publish or depend on unpublished local revisions of them.

Effective prompt changes must enter the approved freshness contract when that integration exists. Root/selection durability and editor conflict handling in this spec can be reviewed independently; a reference to freshness does not claim a shared invalidation implementation already exists.

## Problem (with evidence)

The issue asks users to distinguish temporary, DB and file persistence, receive a save destination, see dirty state and recover saved content after reload. It leaves the actual available scopes unresolved. Offering invented DB/session storage modes would obscure the existing file-based architecture.

On [develop `7a88965284faebcc0beb2e357a5adda9fbfbda45`](https://github.com/unicef/adt-studio/tree/7a88965284faebcc0beb2e357a5adda9fbfbda45), `apps/api/src/routes/prompts.ts:161` saves global versions beneath `promptsDir`; reset routes remove override history. Packaged application resources may not be writable. `packages/llm/src/prompt.ts:141` resolves model variants before generic templates; the CLI DAG constructs its engine from a single prompt root at `pipeline-dag.ts:189`.

PR #644 at `64770d098958a7cc2e4aad79dcd10d5fadc405a1` changes 40 files and proposes writable global roots, source/path/revision response metadata, non-deleting reset markers, version files, migration and API caller integration. Its diff still permits omitted save revisions, and reset/version-selection mutations do not share the same revision check. Its file list does not include CLI/DAG prompt-root integration. These are contract gaps to reconcile, not claims that all proposed behavior is implemented.

The supplied SDD companion puts storage-layout and cross-package interface changes in the spec lane. This scope exceeds a toast/dirty-badge fix regardless of the existing issue label.

## Goals

- Make source, destination, dirty state and save outcome unambiguous.
- Survive app/browser restart and supported desktop/container packaging without writing bundled resources.
- Retain every saved version through reset and restore, and reject conflicting edits rather than overwriting them.
- Make editor preview, API generation, agents and CLI consume the same selected prompt content.

## Non-goals

- A prompt database, new role/permission system, cloud synchronization or a persistent session-only prompt mode.
- Changing prompt output schemas, tuning prompt quality or rewriting provider/model discovery.
- Replacing user-edited render templates, StyleGuide storage or unrelated editor implementations.
- Automatic paid regeneration after Save, or guaranteeing identical behavior on a machine with different global settings.

## Proposed design

### Options

| Option | Relative cost | Decision |
|---|---|---|
| Add labels to current writes in the bundled directory | Small | Insufficient for packaged read-only resources and reset history. |
| Writable override roots plus immutable files and shared resolution | Moderate cross-layer integration | Recommended; extends the current storage model. |
| Database-backed prompt service | Large migration and duplicate source-of-truth risk | Rejected for this issue. |

### Scope and precedence

Only two save scopes exist: **This book** and **Global overrides**. Bundled defaults are a read-only source. An unsaved buffer is labeled **Unsaved changes**, not presented as a third persisted scope. A book editor always saves to that book; changing a global prompt requires the explicit global settings surface.

Use these roots for an effective prompt of a selected model: book overrides, writable global overrides, bundled prompts. Preserve the current model-specific-first contract: search that ordered root set for the requested model variant, then search it for the generic template if no variant resolves. Therefore a bundled model-specific variant can outrank a book's generic prompt. Show the resolved variant/source and make this visible when editing a generic template; do not misleadingly promise that a base-template edit affects every model.

Within a root and candidate name, an explicit selected immutable version wins over the compatible legacy flat-file form. Book reset skips that book candidate and inherits from lower roots. Global reset selects the shipped default for that candidate, bypassing migrated/global version history. Reset is scoped to the selected base/model candidate, not every model variant. Once all model candidates are absent, apply generic fallback consistently.

| Storage target | Proposed location |
|---|---|
| Book override | `<book>/prompts/`, including immutable versions and selection metadata. |
| Server/CLI global override | `PROMPT_OVERRIDES_DIR`, default `<BOOKS_DIR>/.adt-studio/prompt-overrides`. |
| Desktop global override | Writable Electron application user-data path supplied by the desktop host. |
| Bundled defaults | Existing `PROMPTS_DIR`, never mutated by editor saves. |

Global overrides are application settings, not book-specific content. Book overrides, the prompts actually used in call logs, and book run provenance stay within the book. Moving an archive preserves its book overrides; different host-global defaults are reported as changed effective inputs, not silently declared reproducible.

The deployment adapter resolves filesystem roots; pure prompt functions receive those roots as parameters. Pipeline/LLM packages must not import the API service to discover them. Shared schemas belong in `@adt/types`, and Studio uses HTTP only for persistence/resolution.

### Read and mutation contracts

Read responses include requested name/model, resolved candidate, content, source (`book`, `global`, `bundled`), save target, version if applicable, a logical destination path and an opaque revision. Keep physical host paths out of ordinary UI unless an explicit diagnostic needs them.

The revision covers the selected candidate, effective content and inheritance/selection state, so a changed inherited template or a reset-to-default conflicts with an older editor even if the filename is unchanged. It must also distinguish an A→B→A selection sequence when mutation ordering matters; a content-only hash is insufficient as a write concurrency token.

Save, reset and selecting an old version all supply the revision read by the client. A missing revision returns a structured precondition error; a mismatch returns `409 PROMPT_CONFLICT` with the current readable state. Do not let a caller bypass protection by omitting the field. This is a deliberate tightening of PR #644 and requires coordinated client migration before enforcement.

Under a per-target writer gate, re-read and compare the revision, validate input, then publish exactly one selection. Concurrent requests with the same revision have one winner; others conflict. The gate covers reset and restore as well as Save, including supported processes sharing a root. A second save of identical content with a current revision is a no-op. A retry after an ambiguous network outcome first re-reads the state; it does not blindly create another version.

Validate names, model/candidate identity, book labels, content and version selections using Zod and existing path-containment rules. A client cannot choose a filesystem root or arbitrary version path. Unsupported/missing prompts return a clear error. Preserve the current trusted-user permission boundary; this task does not grant global-edit access to new roles or add role management.

### Durable publication, reset and history

Create a new immutable version with exclusive creation, then atomically publish the selection pointer in the same directory. Report success only after the durable version and selection are readable through the normal resolver. Failure before pointer publication leaves the old selection active. Unselected orphan version files must not become current just because they sort latest.

A corrupt/missing selection in the new format is an explicit recoverable error, not license to silently choose arbitrary content. Legacy “latest file” discovery is allowed only during the documented migration of a previously pointer-less legacy directory; materialize a validated initial selection before new-format writes begin.

Reset publishes an inherit/default selection while retaining all saved bytes. Selecting an older version records a new selection revision; it does not rewrite that version. A later return to an earlier version remains possible after reset. Temporary files and migration artifacts may be cleaned, but only when they are not referenced by any retained selection/history record.

### Editor behavior

Before typing, show “Using: [source/variant]” and “Save to: [This book/Global overrides]”. Dirty state compares the draft to its loaded revision. Navigating away uses the existing unsaved-change guard. Saving disables duplicate submission but may allow continued typing: a response only clears dirty state for the exact draft sent, never for newer unsaved keystrokes.

On success, show the logical saved destination and refresh effective prompt and version history. Reload/restart must return the committed content. On write/permission/validation failure, keep the draft and dirty state, show the error and never show a success toast. On conflict, keep the draft, show the newer saved version and offer explicit reload/review/retry; no automatic merge or “last writer wins”. Reset/restore first resolve unsaved edits through the same guard.

Saving a prompt starts no pipeline call. Changed effective content invalidates consuming work through SPEC-0001; unchanged effective content does not. Until that integration exists, report that affected outputs need regeneration rather than pretending they are current. In-flight operations retain their captured prompt bytes/hash; they cannot be labeled as generated with a newly saved prompt.

### Production resolution, caches and migration

Use one resolution algorithm for API reads, prompt preview, stage runs, targeted page edits, agent tools and CLI/DAG calls. Include effective template content and relevant includes in the existing request/cache input, not merely a filename or selected version label. The log records what was actually rendered/sent using the existing inspectable-call mechanism. No global cache deletion is required.

At startup, migrate legacy global `.versions` and model-list metadata into the writable root idempotently. Keep source files and all saved versions intact. Never overwrite a newer target selection. If a same-named version has different bytes, preserve both with unambiguous identity or stop and surface a migration conflict; file existence alone is not proof of equivalence. A failed migration cannot announce success or fall back to writing bundled resources. Hand-edited flat files remain readable compatibility inputs; do not guess which shipped-looking files are user edits and move them destructively.

Docker defaults must place global overrides on persistent writable storage; document custom mounts. Desktop uses its writable user-data root. `templates/` remains derived from the bundled prompt location as today; moving overrides must not move template lookup to a nonexistent sibling of the override directory.

## Impact map

| Area | Expected work / coordination |
|---|---|
| Types/LLM | Shared persistence and revision schemas; one variant/fallback/pointer resolver. |
| API + agents + pipeline | Root injection for all generation paths, guarded mutations, migration and error mapping. |
| Studio | Source/save-target/dirty UI, retained draft conflicts, history/reset controls, five-locale translations. |
| Desktop/Docker/CLI | Writable roots and persistence across restart; preserve template-root behavior. |
| PR #644 | Reuse its existing work; reconcile missing-revision, reset/restore, failed-pointer and CLI parity requirements before closure. |
| SPEC-0001 | Prompt-content changes are consumed as freshness inputs; this spec does not build a second invalidation engine. |

The proposed decision is recorded in [ADR 027](../DECISIONS.md#027-prompt-overrides-use-writable-roots-and-versioned-selections). It remains proposed until this spec's blocking review questions are resolved. No new runtime enforcement is claimed by this documentation PR.

## Acceptance criteria

- [ ] AC-1 Editors distinguish effective source/variant, save destination and unsaved draft without inventing DB/session persistence.
- [ ] AC-2 Book/global saves survive reload and process restart while bundled resources remain unchanged/read-only.
- [ ] AC-3 Model-specific-first resolution and per-candidate reset/fallback agree across every reader and execution path.
- [ ] AC-4 A generic book override does not hide a model-specific candidate silently; the resolved source is visible.
- [ ] AC-5 Save/reset/restore require the loaded revision and reject conflicts without changing selection or losing the draft.
- [ ] AC-6 Two concurrent mutations have one winner; selection changes cannot evade revision checks through A→B→A content equality.
- [ ] AC-7 Identical-current-content Save is a no-op; ambiguous retries are reconciled without duplicate versions.
- [ ] AC-8 Write/pointer failures never activate an orphan version or show successful persistence.
- [ ] AC-9 Reset and selecting historical versions retain all previous bytes and recoverable selections.
- [ ] AC-10 Invalid names, model collisions, labels, pointer content and traversal attempts cannot write outside the owning root.
- [ ] AC-11 A Save response cannot clear newer typing; conflicts/errors preserve dirty state and navigation guards.
- [ ] AC-12 API, stage, targeted edit, agent and CLI calls use the same effective prompt and inspectable content identity.
- [ ] AC-13 Effective template/include changes affect request caches/freshness; Save starts no generation and does not mislabel in-flight work.
- [ ] AC-14 Migration is idempotent, retains source history, handles different-byte name collisions and preserves newer target selections.
- [ ] AC-15 Desktop and Docker save with read-only bundled resources; restart and supported volume persistence preserve overrides.
- [ ] AC-16 Changing override roots leaves bundled render-template lookup intact.
- [ ] AC-17 Book archive/import retains book overrides and used-prompt provenance; host-global differences remain explicit.
- [ ] AC-18 All new editor/errors are translated in `en`, `pt-BR`, `es`, `fr`, `sq`; no new dependencies are added.

## Test plan

| Layer | Criteria | Required fixtures |
|---|---|---|
| Resolver units | AC-3–4, AC-9–10, AC-16 | Book/global/bundled base and model variants, reset markers, legacy flat/version directories and missing/corrupt pointers. |
| Real-filesystem API tests | AC-2, AC-5–10, AC-14 | Read-only defaults, writable overrides, independent concurrent writers, fault-injected pointer publication and same-name/different-byte migration. |
| Studio components | AC-1, AC-5, AC-11, AC-18 | Save confirmation, network/conflict errors, continued typing, unsaved reset/restore and five-locale catalogs. |
| Generation parity | AC-12–13 | Stub providers capturing rendered messages through API stage, targeted edit, agent tool and actual CLI entry. Include shared Liquid partial changes. |
| Packaging smoke tests | AC-15–17 | Electron user-data path, Docker volume across restart, moved book archive and unchanged template resolution. |

PR #644 reports prior test results; those are author-reported and do not establish this expanded acceptance set. Validate the integrated implementation head, including current provider/prompt-variant behavior.

## Rollout

Land shared resolution and backward-compatible read metadata first, migrate writable roots, then update all clients and enforce mutation preconditions together. Keep legacy sources for recovery. Do not enable a new reader selection format without matching generation readers.

Rollback must keep the migrated override directory and history. If old binaries cannot read selection markers, disable edits and use an explicit compatibility path; do not restore destructive reset. Global root configuration and filesystem permissions are operational settings, not a new user-selectable storage backend.

## Open questions

| Question | Owner | Resolve by |
|---|---|---|
| Ratify the two save scopes, model-specific-first precedence and coordinated required-revision API change. | @ksokolovic, coordinating product/integration review | 2026-09-25, before spec approval |
| Confirm shared-root concurrency support and migration behavior for conflicting legacy files with the maintainer of PR #644. | @ksokolovic | 2026-09-25, before spec approval |
