import { useMemo, useState, type ReactNode } from "react"
import { ArrowRight, CircleDot, type LucideIcon } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { VersionEntry } from "@/api/client"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
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
   *  a level badge can match the item's change color. */
  renderItem: (item: unknown, ctx?: { accentClass: string }) => ReactNode
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

  const dataOf = (v: number) => versions.find((x) => x.version === v)?.data
  const isCurrent = selected === currentVersion

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
      contentClassName="flex h-[80vh] max-h-[720px] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden p-0"
      controls={
        <label className="flex cursor-pointer select-none items-center gap-2 text-[11px] text-muted-foreground">
          <Switch checked={showUnchanged} onCheckedChange={setShowUnchanged} />
          {t`Show unchanged`}
        </label>
      }
    >
      {/* Fixed-height body scrolls internally so the header controls (chips +
          toggle) and the footer stay put — toggling Unchanged / switching
          versions never repositions the buttons under the cursor. */}
      <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-muted/10 p-4">
        {isCurrent ? (
          currentItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t`This version is empty.`}
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                {t`This is the active version — pick another above to compare and restore it. Everything it contains:`}
              </p>
              {section(
                accentColor,
                icon,
                t`Current version (v${currentVersion})`,
                currentItems.length,
                currentItems.map((it) => (
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
        ) : groups.total === 0 && (!showUnchanged || groups.unchanged.length === 0) ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {showUnchanged && groups.unchanged.length === 0
              ? t`This version is empty.`
              : t`No differences from the current version.`}
          </p>
        ) : (
          <>
            {section(
              KIND.edited.color,
              KIND.edited.icon,
              t`Edited`,
              groups.changed.length,
              groups.changed.map(({ before, after }) => (
                <div key={descriptor.keyOf(after)}>
                  {card(
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
                  )}
                </div>
              ))
            )}
            {section(
              KIND.added.color,
              KIND.added.icon,
              t`Added`,
              groups.added.length,
              groups.added.map((it) => (
                <div key={descriptor.keyOf(it)}>
                  {card(KIND.added.tint, descriptor.renderItem(it, { accentClass: KIND_CHIP_CLASS.added }))}
                </div>
              ))
            )}
            {section(
              KIND.removed.color,
              KIND.removed.icon,
              t`Removed`,
              groups.removed.length,
              groups.removed.map((it) => (
                <div key={descriptor.keyOf(it)}>
                  {card(KIND.removed.tint, descriptor.renderItem(it, { accentClass: KIND_CHIP_CLASS.removed }))}
                </div>
              ))
            )}
            {showUnchanged &&
              section(
                "#94a3b8",
                CircleDot,
                t`Unchanged`,
                groups.unchanged.length,
                groups.unchanged.map((it) => (
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
    </VersionCompareShell>
  )
}
