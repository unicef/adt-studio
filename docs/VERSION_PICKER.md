# Version picker & rollback

Every entity in `node_data` is versioned (never overwritten). The **version
picker** lets a user browse a step's versions, preview/compare them, and **roll
back** to an older one. Rollback moves a *pointer* rather than appending a
duplicate — see [Rollback model](#rollback-model).

This doc is the recipe for wiring the picker into a new stage. The shared base
already exists; a stage is a **route one-liner + one descriptor**.

## The shared base

**Backend (`@adt/storage`)**
- `node_current` pointer table (schema v14) — the *current* version of each
  `(node, item_id)`, decoupled from `MAX(version)`. Backfilled to `MAX` on
  upgrade, so behaviour is unchanged until a user rolls back.
- `readCurrentNodeRow(db, node, itemId)` — pointer-aware single-row read for
  routes that use `openBookDb`. `CURRENT_VERSION_ORDER` — ordering fragment for
  bulk reads (`... ORDER BY nd.item_id, ${CURRENT_VERSION_ORDER}` alongside a
  `LEFT JOIN node_current`).
- `getLatestNodeData` / `getNodeVersionFingerprint` already read the pointer, so
  the pipeline and packaging pick up a rollback automatically.
- `setCurrentNodeVersion(node, itemId, version)` powers the restore.

**API** — generic restore endpoint:
`POST /books/:label/versions/:node/:itemId/restore` `{ version }`.

**Frontend (`apps/studio/.../pipeline/components`)**
- `VersionPicker` — the single entry point (the `vN ▾` chip → popover).
- `VersionCompareShell` — dialog frame + header + version chips + footer, shared
  by both compare dialogs; `useSelectedVersion(open, initialSelected)`.
- `VersionCompareDialog` (item diff) and `VersionPreviewCompareDialog` (rendered
  side-by-side).
- Helpers: `LazyThumb`, `PreviewSkeleton`, `ReadyOnMount`, `useReservedHeight`,
  `diffById` / `countChanges`.
- `api.restoreVersion(label, node, itemId, version)`.

## Adding a stage

**1. Make the stage's read route pointer-aware.** Swap the `MAX(version)` read
for the shared helper so a rollback is reflected:

```ts
import { readCurrentNodeRow } from "@adt/storage"
const row = readCurrentNodeRow(db, "glossary", "book")
```

**2. Wire its `VersionPicker`** with `onRestored` (clear local pending; the
picker invalidates `["books", label]` to refetch) **plus one of**:

- **Book / list stages** (glossary, TOC, quizzes, …) → a `diff` descriptor.
  Shows a per-version change count + an item-level compare dialog.

  ```tsx
  <VersionPicker
    step="glossary" itemId="book" currentVersion={data.version}
    bookLabel={bookLabel} saving={saving} dirty={dirty}
    onRestored={() => setPending(null)}
    diff={{
      items: (d) => (d as GlossaryData | null)?.items ?? [],
      keyOf: (it) => (it as GlossaryItem).id ?? (it as GlossaryItem).word,
      // isEqual is optional — defaults to deep, key-order-insensitive equality
      // (stableEqual). Only override for a cheaper/stricter comparison.
      renderItem: (it) => <span>{(it as GlossaryItem).word}</span>,
    }}
  />
  ```

- **Visual stages** (storyboard) → a `renderPreview(data, onReady)` that renders
  the content read-only (thumbnails + rendered side-by-side compare). Pass
  `thumbnail autoRefreshCss onReady` to `BookPreviewFrame`.

That's it — the popover, restore flow, compare dialog, skeletons, and
not-at-latest bar all come from the base.

## Rollback model

Restoring vN moves the `node_current` pointer to vN (no new row). Editing after
a rollback appends a fresh version (git-like: its parent is the version you were
on, not the numeric predecessor). Nothing is overwritten, so any version is
always restorable.

**Known limitation — no cascade.** Restoring an upstream step does not
regenerate derived nodes (e.g. glossary → `text-catalog`, sectioning →
`web-rendering`). The current version shows correctly, but downstream data stays
until it's regenerated. Cascade-on-restore is a deliberate follow-up.

## i18n

CI has **no `OPENAI_API_KEY`**, so its auto-translate step can't fill new
strings — `lingui compile --strict` fails and blocks the PR. Fill new strings in
all locales (`es/fr/pt-BR/sq`) before merge (run `pnpm --filter @adt/studio
extract` and translate the empty `msgstr`s), or have someone add the CI secret.
