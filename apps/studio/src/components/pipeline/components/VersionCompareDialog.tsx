import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowRight, CircleDot, Search, X, type LucideIcon } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { VersionEntry } from "@/api/client"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { InlineDiff } from "./InlineDiff"
import {
  diffById,
  stableEqual,
  KIND_COLOR,
  KIND_ICON,
  KIND_CHIP_CLASS,
  NEUTRAL_CHIP_CLASS,
} from "./change-summary"
import { VersionCompareShell, useSelectedVersion } from "./VersionCompareShell"

/**
 * Describes how to diff a book-level step's versions: how to pull the
 * comparable item list out of a version's stored data, identify and compare
 * items, and render one for display. Lets the generic picker/dialog show
 * "N changes" and an item-level comparison without knowing the data shape.
 */
export interface VersionDiffDescriptor {
  items: (data: unknown) => unknown[]
  keyOf: (item: unknown) => string
  /** Item equality. Defaults to deep, key-order-insensitive {@link stableEqual}
   *  — override only for a cheaper/stricter comparison. */
  isEqual?: (a: unknown, b: unknown) => boolean
  /** Render one item. `ctx.accentClass` is the section's chip class bundle
   *  (added/edited/removed color, neutral for unchanged) so small accents like
   *  a level badge can match the item's change color. `ctx.diff`, when present
   *  (edited rows), is a pre-rendered inline word-diff to show *in place of* the
   *  item's primary text — render your context (tags, source) around it. */
  renderItem: (
    item: unknown,
    ctx?: {
      accentClass: string
      /** Inline word-diff of `diffText` (edited rows) — for text stages. */
      diff?: ReactNode
      /** The previous version's item (edited rows) — for stages that want to
       *  mark element-level changes themselves (e.g. which quiz option changed). */
      before?: unknown
    }
  ) => ReactNode
  /** Primary comparable text of an item. When provided, edited rows show a
   *  shared inline word-diff (old → new) of this text via `ctx.diff`. */
  diffText?: (item: unknown) => string
  /** Free-text used to filter the compare list. When provided, the dialog shows
   *  a search box that matches against this (case-insensitive). */
  searchText?: (item: unknown) => string
  /** Placeholder for the search box, naming what's searchable (e.g. "Search
   *  terms or definitions…"). Defaults to a generic "Search…". */
  searchPlaceholder?: string
  /** Hide the "Show unchanged" toggle and never list unchanged items — for
   *  focused, item-level stages (e.g. captions) that only care about changes. */
  hideUnchanged?: boolean
  /** Render one ordered list of every item (in the selected version's order,
   *  removed items appended) tagged with its status, instead of grouping by
   *  change kind — for sequence-oriented stages (e.g. quizzes) where seeing all
   *  items in order matters more than grouping. */
  unifiedList?: boolean
}

/** Per-kind change counts between two versions. */
export function diffCounts(
  descriptor: VersionDiffDescriptor,
  from: unknown,
  to: unknown
): { added: number; edited: number; removed: number; total: number } {
  const { added, removed, changed } = diffById(
    descriptor.items(from),
    descriptor.items(to),
    descriptor.keyOf,
    descriptor.isEqual ?? stableEqual
  )
  return {
    added: added.length,
    edited: changed.length,
    removed: removed.length,
    total: added.length + changed.length + removed.length,
  }
}

// Visual identity for each change kind — a colored, icon-led section instead of
// per-row color coding, so a scan reads "what was added / edited / removed".
// Colors/icons come from the shared change-summary source; tints are local.
const KIND = {
  edited: { color: KIND_COLOR.edited, icon: KIND_ICON.edited, tint: "border-amber-200 bg-amber-50/60" },
  added: { color: KIND_COLOR.added, icon: KIND_ICON.added, tint: "border-emerald-200 bg-emerald-50/60" },
  removed: { color: KIND_COLOR.removed, icon: KIND_ICON.removed, tint: "border-rose-200 bg-rose-50/60" },
} as const

interface VersionCompareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  versions: VersionEntry[]
  currentVersion: number
  initialSelected: number
  descriptor: VersionDiffDescriptor
  accentColor: string
  icon: LucideIcon
  /** Restore the given version (moves the pointer); resolves when done. */
  onRestore: (version: number) => Promise<void> | void
}

/**
 * Item-level comparison of two versions of a book-level step, grouped into
 * Edited / Added / Removed sections (edits show before → after) so the nature
 * of each change reads at a glance. Applying restores the chosen version.
 */
export function VersionCompareDialog({
  open,
  onOpenChange,
  versions,
  currentVersion,
  initialSelected,
  descriptor,
  accentColor,
  icon,
  onRestore,
}: VersionCompareDialogProps) {
  const { t } = useLingui()
  const [selected, setSelected] = useSelectedVersion(open, initialSelected)
  const [showUnchanged, setShowUnchanged] = useState(true)
  const [query, setQuery] = useState("")
  // Status filter for the unified list ("all" | added | edited | removed | unchanged).
  const [statusFilter, setStatusFilter] = useState<
    "all" | "added" | "edited" | "removed" | "unchanged"
  >("all")
  // Reset the search + filter each time the dialog opens.
  useEffect(() => {
    if (open) {
      setQuery("")
      setStatusFilter("all")
    }
  }, [open])

  const dataOf = (v: number) => versions.find((x) => x.version === v)?.data
  const isCurrent = selected === currentVersion
  // Item-level stages (captions) show only changes and are media-forward, so
  // the dialog fits its content (no fixed height / blank space) rather than the
  // book-diff's fixed, internally-scrolling frame.
  const itemMode = Boolean(descriptor.hideUnchanged)

  // Case-insensitive search over the descriptor's searchText (falls back to
  // diffText). Applied to every section so the query narrows the whole list.
  const q = query.trim().toLowerCase()
  const matches = (item: unknown) => {
    if (!q) return true
    const text = descriptor.searchText?.(item) ?? descriptor.diffText?.(item) ?? ""
    return text.toLowerCase().includes(q)
  }

  // Group items by how restoring `selected` would change the current version.
  const groups = useMemo(() => {
    const { keyOf, items } = descriptor
    const isEqual = descriptor.isEqual ?? stableEqual
    const current = items(dataOf(currentVersion))
    const sel = items(dataOf(selected))
    const { added, removed, changed } = diffById(current, sel, keyOf, isEqual)
    const curByKey = new Map(current.map((i) => [keyOf(i), i]))
    const unchanged = sel.filter((i) => {
      const before = curByKey.get(keyOf(i))
      return before != null && isEqual(before, i)
    })
    return { added, removed, changed, unchanged, total: added.length + removed.length + changed.length }
  }, [descriptor, versions, currentVersion, selected])

  // Ordered union for the unified list: selected version's items in order
  // (tagged added/edited/unchanged), then current-only items (removed) appended.
  const unified = useMemo(() => {
    if (!descriptor.unifiedList) return []
    const { keyOf, items } = descriptor
    const isEqual = descriptor.isEqual ?? stableEqual
    const current = items(dataOf(currentVersion))
    const sel = items(dataOf(selected))
    const curByKey = new Map(current.map((i) => [keyOf(i), i]))
    const selKeys = new Set(sel.map(keyOf))
    type Row = { key: string; status: "added" | "edited" | "removed" | "unchanged"; item: unknown; before?: unknown }
    const rows: Row[] = []
    for (const it of sel) {
      const before = curByKey.get(keyOf(it))
      rows.push({
        key: keyOf(it),
        status: before == null ? "added" : isEqual(before, it) ? "unchanged" : "edited",
        item: it,
        before,
      })
    }
    for (const it of current) if (!selKeys.has(keyOf(it))) rows.push({ key: keyOf(it), status: "removed", item: it })
    return rows
  }, [descriptor, versions, currentVersion, selected])

  const currentItems = descriptor.items(dataOf(currentVersion))

  const card = (tint: string, body: ReactNode) => (
    <div className={`rounded-md border px-2.5 py-1.5 text-xs leading-snug ${tint}`}>{body}</div>
  )

  const section = (
    color: string,
    Icon: LucideIcon,
    label: string,
    count: number,
    body: ReactNode
  ) => {
    if (count === 0) return null
    return (
      <section className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} style={{ color }} aria-hidden />
          <span className="text-xs font-semibold" style={{ color }}>
            {label}
          </span>
          <Badge
            variant="secondary"
            className="h-4 rounded-full px-1.5 text-[10px] tabular-nums"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            {count}
          </Badge>
        </div>
        <div className="space-y-1.5">{body}</div>
      </section>
    )
  }

  // Search-filtered views of each group; searching also reveals matching
  // unchanged items regardless of the toggle.
  const fChanged = groups.changed.filter((c) => matches(c.after) || matches(c.before))
  const fAdded = groups.added.filter(matches)
  const fRemoved = groups.removed.filter(matches)
  const fUnchanged = groups.unchanged.filter(matches)
  const fCurrent = currentItems.filter(matches)
  const fUnified = unified.filter(
    (r) =>
      (statusFilter === "all" || r.status === statusFilter) &&
      (matches(r.item) || (r.before != null && matches(r.before)))
  )
  // Status-filter chips for the unified list (only kinds with items, plus All).
  const unifiedFilters = [
    { key: "all" as const, label: t`All`, count: unified.length, color: "#64748b" },
    { key: "edited" as const, label: t`Edited`, count: groups.changed.length, color: KIND.edited.color },
    { key: "added" as const, label: t`Added`, count: groups.added.length, color: KIND.added.color },
    { key: "removed" as const, label: t`Removed`, count: groups.removed.length, color: KIND.removed.color },
    { key: "unchanged" as const, label: t`Unchanged`, count: groups.unchanged.length, color: "#64748b" },
  ].filter((c) => c.key === "all" || c.count > 0)
  const filteredTotal = fChanged.length + fAdded.length + fRemoved.length
  const showSearch = descriptor.searchText != null
  const unchangedVisible = !descriptor.hideUnchanged && (showUnchanged || q.length > 0)

  // Per-status visual identity for the unified list (chip + card tint).
  const STATUS: Record<
    "added" | "edited" | "removed" | "unchanged",
    { chip: string; tint: string; label: string }
  > = {
    added: { chip: KIND_CHIP_CLASS.added, tint: KIND.added.tint, label: t`Added` },
    edited: { chip: KIND_CHIP_CLASS.edited, tint: KIND.edited.tint, label: t`Edited` },
    removed: { chip: KIND_CHIP_CLASS.removed, tint: KIND.removed.tint, label: t`Removed` },
    unchanged: { chip: NEUTRAL_CHIP_CLASS, tint: "border-border bg-background", label: t`Unchanged` },
  }
  const unifiedRow = (row: (typeof unified)[number]) => {
    const meta = STATUS[row.status]
    const edited = row.status === "edited"
    const body = descriptor.renderItem(row.item, {
      accentClass: meta.chip,
      before: edited ? row.before : undefined,
      diff:
        edited && descriptor.diffText ? (
          <InlineDiff before={descriptor.diffText(row.before)} after={descriptor.diffText(row.item)} />
        ) : undefined,
    })
    return (
      <div
        key={row.key}
        className={`flex items-start gap-2.5 rounded-md border px-2.5 py-2 text-xs leading-snug ${meta.tint} ${
          row.status === "removed" ? "opacity-70" : ""
        }`}
      >
        <span
          className={`mt-px shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${meta.chip}`}
        >
          {meta.label}
        </span>
        <span className="min-w-0 flex-1">{body}</span>
      </div>
    )
  }

  // One edited row: a shared inline word-diff of the primary text when the
  // descriptor exposes `diffText`, else the before → after two-column fallback.
  const editedCard = (before: unknown, after: unknown) =>
    descriptor.diffText
      ? card(
          KIND.edited.tint,
          descriptor.renderItem(after, {
            accentClass: KIND_CHIP_CLASS.edited,
            before,
            diff: <InlineDiff before={descriptor.diffText(before)} after={descriptor.diffText(after)} />,
          })
        )
      : card(
          KIND.edited.tint,
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 opacity-55">
              {descriptor.renderItem(before, { accentClass: KIND_CHIP_CLASS.edited })}
            </div>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
            <div className="min-w-0 flex-1">
              {descriptor.renderItem(after, { accentClass: KIND_CHIP_CLASS.edited })}
            </div>
          </div>
        )

  return (
    <VersionCompareShell
      open={open}
      onOpenChange={onOpenChange}
      versions={versions}
      currentVersion={currentVersion}
      selected={selected}
      onSelect={setSelected}
      accentColor={accentColor}
      icon={icon}
      onRestore={onRestore}
      description={t`Review what restoring version ${selected} would change, grouped by edited, added, and removed.`}
      contentClassName={
        itemMode
          ? "flex max-h-[88vh] w-[95vw] max-w-2xl flex-col gap-0 overflow-hidden p-0"
          : "flex h-[80vh] max-h-[720px] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden p-0"
      }
      controls={
        descriptor.hideUnchanged || descriptor.unifiedList ? undefined : (
          <label className="flex cursor-pointer select-none items-center gap-2 text-[11px] text-muted-foreground">
            <Switch checked={showUnchanged} onCheckedChange={setShowUnchanged} />
            {t`Show unchanged`}
          </label>
        )
      }
    >
      {/* Fixed-height body: the search row stays put and the sections scroll,
          so the header controls and footer never move under the cursor. */}
      <div className={`flex flex-col bg-muted/10 ${itemMode ? "" : "min-h-0 flex-1"}`}>
        {showSearch && (
          <div className="border-b bg-background px-3 py-2.5">
            <div className="group relative flex items-center">
              <Search
                className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground/70 transition-colors group-focus-within:text-foreground"
                aria-hidden
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={descriptor.searchPlaceholder ?? t`Search…`}
                className="h-8 w-full rounded-full border border-transparent bg-muted/60 pl-8 pr-8 text-xs outline-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted focus:border-ring/40 focus:bg-background focus:ring-2 focus:ring-ring/15"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted-foreground/15 hover:text-foreground cursor-pointer"
                  aria-label={t`Clear search`}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          </div>
        )}
        <div
          className={`space-y-4 overflow-auto p-4 ${
            itemMode ? "max-h-[calc(88vh-8rem)]" : "min-h-0 flex-1"
          }`}
        >
          {isCurrent ? (
            fCurrent.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {q ? t`No matches.` : t`This version is empty.`}
              </p>
            ) : (
              <>
                {!q ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t`This is the active version — pick another above to compare and restore it. Everything it contains:`}
                  </p>
                ) : null}
                {section(
                  accentColor,
                  icon,
                  t`Current version (v${currentVersion})`,
                  fCurrent.length,
                  fCurrent.map((it) => (
                    <div key={descriptor.keyOf(it)}>
                      {card(
                        "border-border bg-background",
                        descriptor.renderItem(it, { accentClass: NEUTRAL_CHIP_CLASS })
                      )}
                    </div>
                  ))
                )}
              </>
            )
          ) : descriptor.unifiedList ? (
            unified.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t`This version is empty.`}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  {unifiedFilters.map((c) => {
                    const active = statusFilter === c.key
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setStatusFilter(c.key)}
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                          active ? "" : "text-muted-foreground hover:bg-muted"
                        }`}
                        style={active ? { backgroundColor: `${c.color}1a`, color: c.color } : undefined}
                      >
                        {c.label}
                        <span className="tabular-nums opacity-70">{c.count}</span>
                      </button>
                    )
                  })}
                </div>
                {fUnified.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">{t`No matches.`}</p>
                ) : (
                  <div className="space-y-1.5">{fUnified.map(unifiedRow)}</div>
                )}
              </>
            )
          ) : filteredTotal === 0 && (!unchangedVisible || fUnchanged.length === 0) ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {q
                ? t`No matches.`
                : showUnchanged && groups.unchanged.length === 0
                  ? t`This version is empty.`
                  : t`No differences from the current version.`}
            </p>
          ) : (
            <>
              {section(
                KIND.edited.color,
                KIND.edited.icon,
                t`Edited`,
                fChanged.length,
                fChanged.map(({ before, after }) => (
                  <div key={descriptor.keyOf(after)}>{editedCard(before, after)}</div>
                ))
              )}
              {section(
                KIND.added.color,
                KIND.added.icon,
                t`Added`,
                fAdded.length,
                fAdded.map((it) => (
                  <div key={descriptor.keyOf(it)}>
                    {card(KIND.added.tint, descriptor.renderItem(it, { accentClass: KIND_CHIP_CLASS.added }))}
                  </div>
                ))
              )}
              {section(
                KIND.removed.color,
                KIND.removed.icon,
                t`Removed`,
                fRemoved.length,
                fRemoved.map((it) => (
                  <div key={descriptor.keyOf(it)}>
                    {card(KIND.removed.tint, descriptor.renderItem(it, { accentClass: KIND_CHIP_CLASS.removed }))}
                  </div>
                ))
              )}
              {unchangedVisible &&
                section(
                  "#94a3b8",
                  CircleDot,
                  t`Unchanged`,
                  fUnchanged.length,
                  fUnchanged.map((it) => (
                    <div key={descriptor.keyOf(it)}>
                      {card(
                        "border-border bg-background text-muted-foreground",
                        descriptor.renderItem(it, { accentClass: NEUTRAL_CHIP_CLASS })
                      )}
                    </div>
                  ))
                )}
            </>
          )}
        </div>
      </div>
    </VersionCompareShell>
  )
}
