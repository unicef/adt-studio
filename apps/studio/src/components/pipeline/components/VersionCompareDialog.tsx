import { useMemo, useState, type ReactNode } from "react"
import { type LucideIcon } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { VersionEntry } from "@/api/client"
import { diffById } from "./change-summary"
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
  isEqual: (a: unknown, b: unknown) => boolean
  renderItem: (item: unknown) => ReactNode
}

/** Total number of changes (added + removed + edited) between two versions. */
export function countChanges(descriptor: VersionDiffDescriptor, from: unknown, to: unknown): number {
  const { added, removed, changed } = diffById(
    descriptor.items(from),
    descriptor.items(to),
    descriptor.keyOf,
    descriptor.isEqual
  )
  return added.length + removed.length + changed.length
}

type RowStatus = "same" | "added" | "removed" | "changed"
interface AlignedRow {
  key: string
  left?: unknown
  right?: unknown
  status: RowStatus
}

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
 * Item-level comparison of two versions of a book-level step: the current
 * version on the left, a chosen version on the right, aligned item-by-item and
 * colored by what changed. Applying restores the chosen version.
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
  const [onlyChanges, setOnlyChanges] = useState(true)

  const dataOf = (v: number) => versions.find((x) => x.version === v)?.data
  const isCurrent = selected === currentVersion

  // Align current (left) and selected (right) items by key, preserving the
  // selected version's order and appending items only present in current.
  const rows = useMemo<AlignedRow[]>(() => {
    const { keyOf, isEqual, items } = descriptor
    const currentItems = items(dataOf(currentVersion))
    const selectedItems = items(dataOf(selected))
    const curByKey = new Map(currentItems.map((i) => [keyOf(i), i]))
    const seen = new Set<string>()
    const out: AlignedRow[] = []
    for (const right of selectedItems) {
      const key = keyOf(right)
      seen.add(key)
      const left = curByKey.get(key)
      out.push({
        key,
        left,
        right,
        status: left == null ? "added" : isEqual(left, right) ? "same" : "changed",
      })
    }
    for (const left of currentItems) {
      const key = keyOf(left)
      if (!seen.has(key)) out.push({ key, left, status: "removed" })
    }
    return out
  }, [selected, currentVersion, versions, descriptor])

  const counts = useMemo(() => {
    let added = 0
    let removed = 0
    let changed = 0
    for (const r of rows) {
      if (r.status === "added") added++
      else if (r.status === "removed") removed++
      else if (r.status === "changed") changed++
    }
    return { added, removed, changed, total: added + removed + changed }
  }, [rows])

  const visibleRows = onlyChanges ? rows.filter((r) => r.status !== "same") : rows

  const cell = (item: unknown | undefined, status: RowStatus, side: "left" | "right") => {
    if (item == null) {
      return <div className="rounded-md border border-dashed border-border/60 bg-muted/20" />
    }
    // Highlight only on the side the change lives on: removed on the left,
    // added on the right, changed on both.
    let cls = "border-border bg-background"
    if (status === "changed") cls = "border-amber-300 bg-amber-50"
    else if (status === "removed" && side === "left") cls = "border-rose-300 bg-rose-50"
    else if (status === "added" && side === "right") cls = "border-emerald-300 bg-emerald-50"
    return (
      <div className={`rounded-md border px-2 py-1.5 text-xs leading-snug ${cls}`}>
        {descriptor.renderItem(item)}
      </div>
    )
  }

  const legendDot = (label: string, n: number, color: string) => (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {n} {label}
    </span>
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
      description={t`See the current version and a chosen version side by side.`}
      contentClassName="flex max-h-[88vh] w-[95vw] max-w-4xl flex-col gap-0 p-0"
      controls={
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyChanges}
            onChange={(e) => setOnlyChanges(e.target.checked)}
            className="h-3 w-3 cursor-pointer"
          />
          {t`Only changes`}
        </label>
      }
      footerLeft={
        <>
          {legendDot(t`added`, counts.added, "#10b981")}
          {legendDot(t`edited`, counts.changed, "#f59e0b")}
          {legendDot(t`removed`, counts.removed, "#f43f5e")}
        </>
      }
    >
      {/* Column headers */}
      <div className="grid grid-cols-2 gap-3 border-b bg-muted/20 px-4 py-2 text-[11px] font-semibold">
        <div className="text-muted-foreground">{t`Current (v${currentVersion})`}</div>
        <div style={{ color: accentColor }}>{t`Version ${selected}`}</div>
      </div>

      {/* Aligned rows */}
      <div className="min-h-0 flex-1 overflow-auto bg-muted/10 p-4">
        {isCurrent ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t`This is the current version.`}
          </p>
        ) : visibleRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {onlyChanges && rows.length > 0
              ? t`No differences from the current version.`
              : t`This version is empty.`}
          </p>
        ) : (
          <div className="space-y-2">
            {visibleRows.map((r) => (
              <div key={r.key} className="grid grid-cols-2 gap-3">
                {cell(r.left, r.status, "left")}
                {cell(r.right, r.status, "right")}
              </div>
            ))}
          </div>
        )}
      </div>
    </VersionCompareShell>
  )
}
