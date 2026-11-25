---
id: SPEC-0027
title: Reader customization as versioned source overrides — chat, editor, preview, inspector
status: draft # draft | in-review | approved | in-progress | implemented | verified | superseded
owner: "@zignaggo"
approvers: []
issues: []
prs: []
adr: ""
created: 2026-11-25
updated: 2026-11-25
---

> Number: SPEC-0027, confirmed by the owner on 2026-11-25.

## Branches this spec builds on

| Branch | Base | Content | Status |
|---|---|---|---|
| `feature/book-chat` | `origin/develop` @ `463ee2341` | Book assistant chat, reimplemented on the ADT agent loop (commit `034a8cf9b`) | Local, not pushed |
| `feature/reader-source-customization` | `feature/book-chat` | This spec, then its implementation | Local, not pushed |
| `feature/ai-chat` | old base `ff2e940` | First chat prototype, mixed with an unrelated UI redesign | **Set aside.** Used only as reference |
| `feature/custom-reader-ui` | `develop` (older) | Form-based Reader step (`reader_ui` tokens, layout, hidden/locked features) | **Set aside.** Nothing is carried over |

### The chat foundation (`feature/book-chat`, already implemented)

The chat was rebuilt on develop instead of being ported from `feature/ai-chat`, so it
follows the core principles and adds no dependency:

- **LLM loop.** It uses `@adt/llm` `runAgentLoop`, not the AI SDK v5. Each turn is
  cached (principle 3) and logged to the book's `llm_log` (principle 4). Every
  provider with agent tool support works with it.
- **`runAgentLoop` changes.** It now accepts earlier `messages`, takes a
  `requiresApproval(call)` predicate that stops the run before any tool of that turn
  executes (returning `pendingToolCalls`), and returns the whole transcript.
  `executeToolCall` is exported.
- **API.** Threads are JSON files at `<BOOKS_DIR>/.chats/<label>/<id>.json`, which
  are conversation transcripts, not book entities. Routes:
  `GET|POST /books/:label/chat/threads`, `GET|DELETE …/threads/:id`, and
  `POST …/threads/:id/messages` and `…/approval`. The last two stream
  `message`/`done`/`error` events over SSE.
- **Tools.** Tools are an `AgentToolSet`. Calls named in `requiresApproval` wait for
  the user. An approved write runs under `withBookWriter`. Today the toolkit is
  `createBookTools` (pages, sections, activities).
- **Studio.** `BookChatPanel` is a side panel on every book screen, with
  conversations, streamed messages, tool traces, an approve/decline card and
  translations in all 5 locales.
- **Tests.** `packages/llm/src/__tests__/agent-loop.test.ts` ("runAgentLoop
  conversations"), `apps/api/src/services/chat/chat-service.test.ts` and
  `apps/api/src/routes/chat.test.ts`.

## Problem (with evidence)

Authors need to change how the reader (the `apps/adt-runtime` chrome) looks for each
book.

- **Develop has no customization at all.** The packaged bundle is always the
  prebuilt `assets/adt/base.bundle.*` (`packages/pipeline/src/packaging/web.ts`,
  `buildJsBundle`).
- **The form approach was tried and set aside.** It was a fixed list of settings on
  `feature/custom-reader-ui` (commits `c0465ea4e` and `8dbd9f19b`).
  - The first commit alone was **92 files, +5,118 lines** for one fixed set of
    settings (colour tokens, radius, font, dock and panel layout).
  - An author still couldn't change a component's markup, spacing, icon or
    arrangement.
  - Each new setting costs a schema change, runtime support, a Studio control and
    strings in 5 locales.
  - It saved to `config.yaml`, which is overwritten on save
    (`apps/api/src/services/book-service.ts`, `updateBookConfig`). It had no
    history, which breaks principle 2.
- **No shared default.** There is no default the author can edit once for every
  book.

Most of what code-level customization needs already exists:

- Monaco (`@monaco-editor/react`, `monaco-editor`), used today by the prompt
  editors.
- `esbuild`, shipped beside the API in Electron and Docker.
- The per-book Tailwind build (`packages/pipeline/src/tailwind.ts`).
- The live preview route that serves `base.bundle.*` dynamically
  (`apps/api/src/routes/adt-preview.ts`).
- Versioned entities with restore (`node_data` and `node_current`, the `/versions`
  restore route, `VersionPicker`).
- Device frames (`storyboard/components/style-editor/device-frames`).
- The book chat on `feature/book-chat`.

## Goals

- G1. A **chat** where the author asks for a styling or behaviour change and the LLM
  reads, edits and compiles the reader's files. Every write is approved with a diff
  and saved as a version. *(Implemented first.)*
- G2. A **file explorer, a Monaco editor and a live preview** over the reader's
  source.
- G3. A **global default** that applies to every book without a customized version
  of a file. Each book can override any file, and every save is a version the
  author can roll back.
- G4. The effective files are **compiled into the book**: the packaged bundle runs
  the customized reader.
- G5. Customized code can import **only the libraries already installed** in
  `apps/adt-runtime`.
- G6. An **inspect mode** lets the author click an element in the preview and open
  the file and line that renders it.

## Non-goals

Binding for every implementation PR of this spec.

- **No new dependencies.** Overrides can't add npm packages, and the chat
  foundation added none.
- **No sandbox.** Author code runs in the shipped reader with the same trust as the
  book's own HTML. The import allowlist limits what the build resolves. It isn't a
  security boundary.
- **No editing of book content** through this feature. Page HTML, sections and
  activities keep their own tools. The WebPub `activities.bundle.local.js` is out of
  scope.
- **No browser-side TypeScript type checking** in the first version. Errors come
  from esbuild.
- **No branching or merging model** beyond per-file versions and a 3-way compare
  when the base changes. Undoing a whole chat turn at once is deferred.
- **No customization in `ADT_RESOURCES_ZIP` (pkg sidecar) mode.** It has no esbuild
  and reports the feature as unavailable.
- **No concurrent multi-user editing.** Stale writes are rejected; changes aren't
  merged automatically.
- **No reuse of `reader_ui`.** That config doesn't exist on develop and isn't
  introduced.

## Proposed design

### Options considered

| Option | Idea | Rough cost | Verdict |
|---|---|---|---|
| A. Form of settings | `reader_ui` settings, extended over time | ~40–90 files per batch of settings | Tried on `feature/custom-reader-ui` and set aside: it fails G1, G2 and G6 |
| B. Theme slots | Extract presentational components behind a slot API; themes override slots | One-time refactor of ~60 components plus a stable slot API, then the compiler | The file the author clicks isn't the file that renders it, and every new slot is API work |
| **C. Source overlay** | The book stores only the runtime files it changed; the build resolves book, then global, then base | Compiler + plugin (~1 module), 1 entity, ~8 API routes, chat tools, editor UI, inspector | **Chosen.** Meets every goal with installed libraries. Its cost (forks drift as the base changes) is handled by D6 |

### Decisions

Decisions D1, D2, D5, D10 and D11 were set by the owner on 2026-11-25.

- **D1 — Layered overlay, chosen per book.**
  - A book that **follows the global layer** (every book until its first
    customization) uses the global version of a file if there is one, else the
    base source.
  - A **customized book** uses its own version of a file if it has one, else the
    base source. It ignores the global layer entirely.
  - The base is the shipped runtime source and is read-only.
- **D2 — Everything under `src/` is editable.** Authors and the chat may read and
  write any file under the runtime's `src/`, so they can also fix bugs. Nothing
  outside `src/` is reachable: no `package.json`, build config or `node_modules`.
- **D3 — Per-book storage is a new `node_data` entity, `reader-source`.**
  - `item_id` is the `src/`-relative path.
  - `data` is `{ content, baseHash, deleted? }`.
  - "Revert" writes a tombstone (`deleted: true`) and never deletes rows.
  - Saves are guarded by `baseVersion`.
  - Being in the book `.db`, overrides travel with export and import (principle 1).
- **D4 — The global layer is file-based and versioned.** It lives under
  `READER_SOURCE_DIR` (default `<BOOKS_DIR>/.reader-source`) with the prompts layout
  (`.versions/<path>/<timestamp>-NNN.txt` + `.current`). Reset writes a tombstone
  version instead of `rmSync`ing the history.
- **D5 — Any customization detaches a book from the global layer.**
  - A global change reaches every book that follows the global layer, at its next
    build or preview.
  - **Detach.** The first save in a book that follows the global layer copies every
    current global override into the book as `reader-source` versions, then applies
    the edit. The book keeps exactly what it showed before and becomes
    self-contained (principle 1). Later global changes no longer reach it.
  - **Mode entity.** Whether a book follows the global layer is a versioned
    `reader-source-mode` entity (`item_id` `book`, `{ followsGlobal }`). No row
    means it follows the global layer.
  - **Follow global again.** This writes `{ followsGlobal: true }`. The book's
    `reader-source` rows are kept and ignored. A later save detaches the book
    again: book files missing from the global layer get tombstones, and global
    files are copied over.
  - **Revert in a customized book.** This writes a tombstone, so that file falls
    back to the base.
  - **Bundle record.** Packaging records the layer and version of every compiled
    override in the bundle's `config.json` (`readerSource`), so a shipped bundle
    states exactly what it contains.
- **D6 — Drift detection.** `baseHash` is the hash of the file the override was made
  from (global or base). A mismatch marks the file *outdated*. Studio offers a 3-way
  compare in Monaco's `DiffEditor`. Updating is the author's action, optionally done
  by the chat.
- **D7 — Imports allowlist.**
  - **Allowed:** bare imports listed in `apps/adt-runtime/package.json`
    `dependencies` (any subpath), and `@adt/types/*`.
  - **Rejected with an error naming the import:** any other bare import, `node:*`,
    absolute paths, and relative paths escaping `src/`.
- **D8 — One shared build definition.** The esbuild options in
  `apps/adt-runtime/build.config.mjs` move to a shared module. The default build and
  the per-book build use it unchanged.
- **D9 — Component source tags.** The compiler plugin appends
  `Component.__adtSource = { path, line }` to capitalized components (including
  `memo` and `forwardRef`), in every bundle. That way inspect mode also works on the
  default reader.
- **D10 — Clean start on develop.** Nothing from `feature/custom-reader-ui` is
  carried over.
  - The Reader step is a new Studio sidebar entry beside Preview. It is UI only and
    adds no `PIPELINE` stage or steps.
  - Studio reuses the storyboard device frames for the preview.
  - Hiding or locking reader features, if wanted, is done by editing source (D2).
- **D11 — The chat comes first and is ours.**
  - The reader tools plug into the `feature/book-chat` engine through a toolkit
    extension point: `runChatTurn` receives the toolkits for the screen the chat was
    opened from (`book`, or `book` + `reader`).
  - The chat is reimplemented, not ported from `feature/ai-chat`.

### Compiler — `packages/pipeline/src/reader-runtime/compile.ts`

```ts
compileReaderRuntime({ baseSrcDir, overlay, cacheDir }): Promise<
  | { ok: true; hash: string; esm: string; iife: string; files: CompiledFile[] }
  | { ok: false; hash: string; errors: Array<{ path: string; line: number; column: number; message: string }> }
>
```

- **Inputs:** `overlay` is `Map<path, content>`, already merged across the book and
  global layers by the caller. The function has no side effects beyond the cache
  directory, so pipeline purity is kept.
- **esbuild plugin:**
  - `onResolve` for relative and `@/` imports checks the overlay, then the base.
  - `onResolve` for bare imports applies D7.
  - `onLoad` injects the D9 tags.
- **Cache:** `hash = sha256(base runtime version ‖ sorted overlay)`. Output is cached
  in `<book>/.cache/reader-runtime/<hash>/`. This is derived output, not an entity.
- **Empty overlay:** `buildJsBundle` keeps copying the prebuilt bundles.

### CSS

- The compiled bundle is written into `adtDir/assets`. `buildTailwindCss` already
  scans `adtDir/**/*.js` through `@source`, so utility classes used only in
  overrides are generated.
- The Tailwind input becomes the **effective** `src/styles/globals.css` instead of
  `assets/adt/tailwind_css.css`. `buildPreviewTailwindCss` also scans the compiled
  bundle.

### Packaging

- `computePackagingInputHash` includes the overlay hash, and
  `PACKAGING_FORMAT_VERSION` is bumped.
- A compile failure fails the packaging step with the error list. The book never
  silently falls back to the default reader.

### Distribution (validated by a spike)

Compiling at runtime needs the base runtime source, `@adt/types/src` and the
runtime's `dependencies` on disk next to the API.

- **Option A (preferred):** copy the source to `assets/adt/runtime-src/` at build
  time. Install the runtime deps through `install-server-runtime.mjs` and the
  Dockerfile npm step, the same way jsdom and playwright are installed.
- **Option B (fallback):** at runtime-build time, emit one pre-bundled ESM "vendor"
  file per allowed library, and have the plugin resolve bare imports to those files.

The spike records installer size delta, Docker image size delta and cold/warm
compile time, then picks one option. That choice amends this section.

### API (`apps/api/src/routes/reader-source.ts`)

Paths are validated with `resolvePathWithin` against the runtime `src/` (D2).

| Route | Purpose |
|---|---|
| `GET /books/:label/reader-source/tree` | Effective tree with per-file layer (`base`, `global`, `book`) and `outdated` |
| `GET /books/:label/reader-source/file?path=` | Effective content + layer + version + `baseHash` |
| `PUT /books/:label/reader-source/file` | `{ path, content, baseVersion }` → new version; 409 when the version is stale |
| `POST /books/:label/reader-source/revert` | `{ path, baseVersion }` → tombstone version (the file falls back to the base) |
| `GET /books/:label/reader-source/base?path=` | Base content and, when present, the global version (for compare) |
| `POST /books/:label/reader-source/follow-global` | `{ baseVersion }` → `reader-source-mode` version with `followsGlobal: true` |
| `POST /books/:label/reader-source/compile` | `{ drafts?: Record<path, content> }` → `{ hash, errors }`; keeps the latest draft build for the preview |
| `GET/PUT/POST /reader-source/global/...` | Same surface for the global layer (D4) |

History and restore reuse `GET /books/:label/debug/versions/:node/:itemId` and
`POST /books/:label/versions/:node/:itemId/restore`, with `reader-source` added to
`RestorableNode`.

### Chat reader tools (first implementation phase after the spike)

`apps/api/src/services/chat/reader-tools.ts` returns a `ChatToolkit` that
`runChatTurn` merges with the book toolkit when the panel is opened from the Reader
step. The request carries `scope: "reader"`, and `ChatSendRequest` gains an optional
`scope`.

- **Read:** `list_reader_files`, `read_reader_file` (effective content + layer),
  `search_reader_files`, `get_inspected_component` (the last inspect-mode selection
  sent with the message).
- **Mutating** (listed in `requiresApproval`): `write_reader_file`,
  `revert_reader_file`. An approved call is exactly one `reader-source` version,
  saved under `withBookWriter`.
- **Check:** `compile_reader` returns the D7 and esbuild errors so the model can fix
  them before asking for approval.
- **Approval card:** for `write_reader_file`, the existing `ChatApprovalCard` shows a
  line diff against the effective file instead of raw JSON.
- **Toolkit instructions** (`ChatToolkit.instructions`):
  - The libraries D7 allows, generated from `package.json`.
  - Prefer Tailwind with the `globals.css` tokens and the `shared/ui` primitives.
  - No new hardcoded user-visible strings: reuse existing runtime translation keys.
  - Run `compile_reader` before proposing a write.

### Preview

- The editor keeps unsaved buffers. **Refresh preview** (debounced auto-refresh)
  calls `compile` with the dirty buffers.
- `adt-preview` serves `assets/base.bundle.*` from the book's latest draft build
  when there is one. Otherwise it serves the saved overlay build, or the prebuilt
  bundle when the book has no overrides. Tailwind CSS is regenerated for the build
  being served.
- The iframe reloads on the same page. A change limited to `.css` files is pushed
  over `postMessage` and swaps the stylesheet without a reload.
- The reader chrome root is wrapped in an error boundary. A runtime error there
  keeps the page content readable and reports `{ path, message }` to Studio, which
  matters more now that all of `src/` is editable.

### Inspect mode

- **Runtime module:** `src/features/reader-ui/runtime/inspector.ts`. It is active
  only inside an iframe and only on `adt-studio/inspect { on }` from
  `window.parent`.
- **Hover:** outlines the element and labels it with the component name.
- **Click:**
  1. Find the element's React fiber (`__reactFiber$…`, which is also present in
     production React).
  2. Walk `.return`, collecting `type.__adtSource`. For `memo` use `type.type`; for
     `forwardRef` use `type.render`.
  3. Post `{ chain: [{ name, path, line }] }` to the parent.
- **Studio:** opens the innermost file at its line and shows the chain as a
  breadcrumb. **Ask the chat about this component** attaches the selection to the
  next message, where `get_inspected_component` reads it.

### Studio UI (Reader step)

- **Layout:** `react-resizable-panels` with the explorer on the left, Monaco tabs in
  the centre, and the preview (device frame, inspect toggle) on the right. The
  existing `BookChatPanel` opens beside it in `reader` scope.
- **Explorer:** a small in-house tree with search and badges (book, global,
  outdated).
- **Editor actions:** Save, History (`VersionPicker`), Compare (`DiffEditor`),
  Revert.
- **Global editor:** the same component with `scope="global"`, under Settings next
  to the global prompts.
- **i18n:** every string goes through Lingui in `en`, `pt-BR`, `es`, `fr` and `sq`.

## Impact map

- **Already changed by `feature/book-chat`:**
  - `packages/llm` (agent loop).
  - `packages/types` (`chat.ts`).
  - `apps/api` (`routes/chat.ts`, `services/chat/*`, exported
    `resolveAgentModelId`/`resolveStyleguide`).
  - `apps/studio` (`components/chat/BookChatPanel/*`, `hooks/use-book-chat.ts`, the
    book layout, locales).
- **To change in this spec:**
  - `packages/pipeline/src/reader-runtime/*` (new), `packaging/web.ts`,
    `tailwind.ts`.
  - `packages/storage` (the `reader-source` node, restore path).
  - `packages/types` (reader source schemas, chat `scope`).
  - `apps/adt-runtime/build.config.mjs` → the shared build module; `inspector.ts`;
    the chrome error boundary.
  - `apps/api/src/routes/reader-source.ts` (new), `services/chat/reader-tools.ts`
    (new), `adt-preview.ts`, `pages.ts` (`RestorableNode`),
    `scripts/install-server-runtime.mjs`, `bundle-server.mjs`, `Dockerfile`.
  - `apps/studio/src/components/pipeline/stages/reader/*` (new), `stage-config.ts`
    (sidebar entry), Settings → global reader source, `ChatApprovalCard` (diff).
- **Invariants:**
  - Entity versioning: a new authored entity, never overwritten.
  - `docs/INVARIANTS.md` gets a row for it. No stage rerun or clear list may delete
    `reader-source`, and the check is a source scan like row 11.
  - Layer rule: Studio imports only `@adt/types`.
- **Schema and data:** a new node name and a bumped `PACKAGING_FORMAT_VERSION`. No
  migration, since no book holds reader customization today.
- **Docs:**
  - `docs/ARCHITECTURE.md`: the book tree, the `.cache/reader-runtime` cache and
    `<BOOKS_DIR>/.chats`.
  - `AGENTS.md`: `READER_SOURCE_DIR`, the externals and the runtime source shipping.
  - `docs/SECURITY_MODEL.md` (planned): author code runs unsandboxed.
- **Collisions:**
  - SPEC-0004 (style guide and Styles panel), for the reader-vs-page theming
    boundary.
  - `feature/ai-chat` and `feature/custom-reader-ui` are set aside and must not be
    merged on top of this work.

## Acceptance criteria

**Chat foundation (`feature/book-chat`, implemented)**
- [x] AC-1: `runAgentLoop` continues from earlier messages and returns the whole transcript.
- [x] AC-2: `runAgentLoop` stops before executing any tool of a turn containing a call that needs approval, and returns `pendingToolCalls`.
- [x] AC-3: A chat turn streams messages, persists the thread and titles it from the first message.
- [x] AC-4: A write waits for approval; a declined write is reported to the model as declined; an approved write executes and its result is fed back.
- [x] AC-5: Sending while an approval is pending, or approving with nothing pending, is refused (409); unknown books or threads are 404; empty messages are 400.

**Compiler and packaging**
- [ ] AC-6: An effective file resolves book version, else global version, else base; a tombstone at a layer falls through to the next one.
- [ ] AC-7: A bare import not in the runtime `dependencies` or `@adt/types/*` fails the compile with an error naming the import; `node:*`, absolute paths and relative paths escaping `src/` fail the same way.
- [ ] AC-8: Syntax and resolve errors are returned as `{ path, line, column, message }` with `src/`-relative paths.
- [ ] AC-9: With no overrides, the packaged `base.bundle.min.js` and `base.bundle.local.js` are byte-identical to the prebuilt ones.
- [ ] AC-10: Compiling the same base and overlay twice returns the cached output without invoking esbuild.
- [ ] AC-11: A Tailwind class used only in an override appears in the packaged `tailwind_output.css`; the effective `globals.css` is the Tailwind input.
- [ ] AC-12: The packaging input hash changes when any effective file changes; a compile failure fails packaging with the error list and writes no bundle.
- [ ] AC-13: The packaged `config.json` lists each overridden file with its layer and version.

**Storage, layers and versioning**
- [ ] AC-14: Saving a file writes a new `reader-source` version (MAX+1) and never updates a row in place.
- [ ] AC-15: A save or revert with a stale `baseVersion` is rejected with 409 and writes nothing.
- [ ] AC-16: Revert writes a tombstone; all earlier versions remain listable and restorable through the restore route.
- [ ] AC-17: A file whose `baseHash` differs from the current hash of its base file is reported `outdated`.
- [ ] AC-18: Any path under `src/` can be read and written; paths outside `src/` or escaping it are rejected (400/403).
- [ ] AC-19: No stage rerun or clear list deletes `reader-source` rows (source-scan invariant test).
- [ ] AC-20: A global change reaches a book that follows the global layer and never reaches a customized book; the first save in a book copies the current global overrides into it; "follow global again" makes the global layer apply again without deleting book rows.
- [ ] AC-21: Resetting a global file writes a tombstone and keeps its history.

**Chat reader tools**
- [ ] AC-22: In `reader` scope, `write_reader_file` and `revert_reader_file` need approval, and an approved call creates exactly one `reader-source` version.
- [ ] AC-23: `compile_reader` returns the same errors as the compile route; reader file tools enforce AC-18.
- [ ] AC-24: The approval card for `write_reader_file` shows a line diff against the effective file.
- [ ] AC-25: Reader tools are absent when the chat is opened outside the Reader step.

**Preview and inspect**
- [ ] AC-26: `compile` with unsaved drafts makes `adt-preview` serve the draft bundle and matching CSS; without drafts it serves the saved build.
- [ ] AC-27: A change limited to CSS files applies in the preview without reloading the iframe.
- [ ] AC-28: A component that throws during render in the reader chrome leaves the page content visible and reports `{ path, message }` to Studio.
- [ ] AC-29: Inspect resolves the component chain with `path` and `line` for a plain function component, a `memo` component and a `forwardRef` component.
- [ ] AC-30: The inspector ignores messages not sent by `window.parent` and is inert outside an iframe.
- [ ] AC-31: In Studio, clicking an element in inspect mode opens its file at the reported line.

**Studio**
- [ ] AC-32: The Reader step offers explorer, editor, preview, history, compare and revert; the global editor offers the same for the global layer.
- [ ] AC-33: All new Studio strings exist in `en`, `pt-BR`, `es`, `fr` and `sq` with no empty `msgstr`.

## Test plan

| AC | Level | Test file | Test title |
|----|-------|-----------|------------|
| AC-1 | unit | `packages/llm/src/__tests__/agent-loop.test.ts` | `continues from earlier messages and returns the whole transcript` (rename with `AC-1:` prefix when this spec is approved) |
| AC-2 | unit | same | `stops before executing a turn that has a call needing approval` |
| AC-3 | unit | `apps/api/src/services/chat/chat-service.test.ts` | `answers, streams the reply and persists the conversation with a title` |
| AC-4 | unit | same | `stops for approval before a write and resumes after the user declines`; `executes an approved write and feeds its result back to the model` |
| AC-5 | API | `apps/api/src/routes/chat.test.ts` | `rejects unknown books, unknown threads, empty messages and approvals with nothing pending` |
| AC-6 | unit | `packages/pipeline/src/reader-runtime/__tests__/compile.test.ts` | `AC-6: resolves book, then global, then base; tombstones fall through` |
| AC-7 | unit | same | `AC-7: rejects imports outside the runtime dependencies` |
| AC-8 | unit | same | `AC-8: reports errors with relative path, line and column` |
| AC-9 | unit | `packages/pipeline/src/__tests__/package-web.test.ts` | `AC-9: no overrides ships the prebuilt bundles unchanged` |
| AC-10 | unit | `compile.test.ts` | `AC-10: identical overlay hits the cache` |
| AC-11 | integration | `package-web.test.ts` | `AC-11: override-only classes reach tailwind_output.css` |
| AC-12 | unit | `package-web.test.ts` | `AC-12: overlay changes the input hash; compile failure fails packaging` |
| AC-13 | unit | `package-web.test.ts` | `AC-13: config.json records compiled overrides` |
| AC-14 | unit | `packages/storage/src/__tests__/reader-source.test.ts` | `AC-14: save appends a version` |
| AC-15 | API | `apps/api/src/routes/reader-source.test.ts` | `AC-15: stale baseVersion returns 409` |
| AC-16 | API | same | `AC-16: revert writes a tombstone and history stays restorable` |
| AC-17 | API | same | `AC-17: hash mismatch marks the file outdated` |
| AC-18 | API | same | `AC-18: any src path is writable; paths outside src are rejected` |
| AC-19 | unit | `packages/storage/src/__tests__/invariants-authored.test.ts` | `AC-19: reader-source is never in a clear list` |
| AC-20 | API | `reader-source.test.ts` | `AC-20: a customized book detaches from the global layer` |
| AC-21 | API | same | `AC-21: global reset keeps history` |
| AC-22 | unit | `apps/api/src/services/chat/reader-tools.test.ts` | `AC-22: reader writes need approval and save one version` |
| AC-23 | unit | same | `AC-23: compile_reader matches the compile route; paths are scoped` |
| AC-24 | unit | `apps/studio/src/components/chat/BookChatPanel/__tests__/ChatApprovalCard.test.tsx` | `AC-24: file writes show a line diff` |
| AC-25 | unit | `reader-tools.test.ts` | `AC-25: reader tools only exist in reader scope` |
| AC-26 | API | `apps/api/src/routes/adt-preview.test.ts` | `AC-26: preview serves the draft build` |
| AC-27 | unit | `apps/adt-runtime/src/features/reader-ui/runtime/stylesheet.test.ts` | `AC-27: css-only update swaps the stylesheet` |
| AC-28 | unit | `apps/adt-runtime/src/app/ChromeErrorBoundary.test.tsx` | `AC-28: throwing chrome keeps content and reports the path` |
| AC-29 | unit | `apps/adt-runtime/src/features/reader-ui/runtime/inspector.test.tsx` | `AC-29: resolves plain, memo and forwardRef components` |
| AC-30 | unit | same | `AC-30: ignores foreign messages and is inert outside a frame` |
| AC-31 | unit | `apps/studio/src/components/pipeline/stages/reader/__tests__/inspect.test.tsx` | `AC-31: inspect selection opens the file at the line` |
| AC-32 | e2e (manual evidence until an e2e harness exists) | PR verification notes | `AC-32` |
| AC-33 | CI | `i18n` job in `.github/workflows/ci.yml` | — |

## Rollout

Each phase is its own issue and PR, revertable on its own. Nothing is pushed until
the owner decides.

| Phase | Branch | Content | ACs |
|---|---|---|---|
| 0 | `feature/book-chat` | **Done:** chat foundation on the ADT agent loop | AC-1…AC-5 |
| 1 | experiment | Spike: compile the runtime with an overlay from shipped source in Electron and Docker; record sizes and times; pick distribution option A or B and amend this spec | — |
| 2 | spec PR | This spec, reviewed and approved | — |
| 3 | `feature/reader-source-customization` | Compiler + plugin + shared build module + `reader-source` entity + global layer storage + API routes + packaging | AC-6…AC-21 |
| 4 | same | Chat reader tools + diff in the approval card (the chat comes first in the UI work) | AC-22…AC-25 |
| 5 | same | Reader step: explorer, Monaco, draft preview, history, compare, revert, error boundary, global editor | AC-26…AC-28, AC-32, AC-33 |
| 6 | same | Inspect mode | AC-29…AC-31 |
| 7 | same | Docs: ARCHITECTURE, INVARIANTS, AGENTS, SECURITY_MODEL | — |

- **Revert story:** with no overrides the bundle is byte-identical to today (AC-9).
  Reverting phase 4 or later leaves overrides compiling. Reverting phase 3 drops
  them from the next package, and the `reader-source` rows stay in the `.db`,
  unused. Reverting phase 0 removes the chat. Nothing else depends on it until
  phase 4.
- **No feature flag:** the feature is inert until a file is overridden.

## Resolved decisions — 2026-11-25 (owner)

The owner asked to start implementation on 2026-11-25, before the spec PR review.

1. **Global layer:** a book with any customization stops following the global layer
   entirely (D1, D5).
2. **Form branch:** `feature/custom-reader-ui` is set aside. This work starts from
   develop (D10).
3. **Editable scope:** all of `src/` is editable, including logic, so authors can
   fix bugs (D2).
4. **Order:** the chat comes first. It was reimplemented on develop as
   `feature/book-chat`, and this branch builds on it (D11, phase 0).

## Open questions

Each has a default that applies if it isn't answered by its date.

1. **Distribution option A or B.** Owner @zignaggo, decided by the phase 1 finding.
   Default: A, unless the installer grows more than ~60 MB.
2. **Process lane for `feature/book-chat`.** Owner @zignaggo, by 2026-11-30. The chat
   is a user-facing feature merged ahead of this spec. Default: it is reviewed as
   phase 0 of SPEC-0027 (AC-1…AC-5), not as a separate spec.
