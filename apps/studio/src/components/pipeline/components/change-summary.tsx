import { Eye, EyeOff, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react"
import { useMemo, type ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { PendingChip } from "./floating-save"

/** Localized singular/plural form of a stage's entity (e.g. quiz / quizzes). */
export interface EntityNoun {
  one: string
  other: string
}

export type ChangeKind = "added" | "edited" | "removed" | "pruned" | "restored"

const KIND_ORDER: ChangeKind[] = ["added", "edited", "removed", "pruned", "restored"]
const KIND_ICON: Record<ChangeKind, LucideIcon> = {
  added: Plus,
  edited: Pencil,
  removed: Trash2,
  pruned: EyeOff,
  restored: Eye,
}

function diffById<T>(
  prev: T[],
  next: T[],
  keyOf: (item: T) => string,
  isEqual: (a: T, b: T) => boolean,
): { added: T[]; removed: T[]; changed: Array<{ before: T; after: T }> } {
  const prevMap = new Map(prev.map((i) => [keyOf(i), i]))
  const nextMap = new Map(next.map((i) => [keyOf(i), i]))
  const added: T[] = []
  const removed: T[] = []
  const changed: Array<{ before: T; after: T }> = []
  for (const [k, after] of nextMap) {
    const before = prevMap.get(k)
    if (!before) added.push(after)
    else if (!isEqual(before, after)) changed.push({ before, after })
  }
  for (const [k, before] of prevMap) {
    if (!nextMap.has(k)) removed.push(before)
  }
  return { added, removed, changed }
}

export interface PendingChangesOptions<T> {
  /** Server (baseline) items. */
  prev: T[]
  /** Pending items, or null/undefined when there are no unsaved changes. */
  next: T[] | null | undefined
  keyOf: (item: T) => string
  isEqual: (a: T, b: T) => boolean
  /** Singular/plural entity noun shown in each chip. */
  noun: EntityNoun
  /** Classify a changed item into a kind. Defaults to "edited". */
  classifyChanged?: (before: T, after: T) => ChangeKind
  /** Whether add/remove count as changes (false for fixed-size sets). Default true. */
  includeAddRemove?: boolean
}

/**
 * Derive the floating-bar label for a stage's pending edits — verbal count
 * chips ("2 quizzes edited", "1 term pruned") plus a stable key that changes
 * only when the summary does. Owns the icons, verbs, and signature so stages
 * just describe how to diff their data.
 */
export function usePendingChanges<T>(opts: PendingChangesOptions<T>): {
  label: ReactNode
  labelKey: string
  /** True only when the diff is non-empty — i.e. pending actually differs from
   * the server. Lets callers auto-dismiss the save bar when edits are reverted. */
  hasChanges: boolean
} {
  const { t } = useLingui()
  const {
    prev,
    next,
    keyOf,
    isEqual,
    noun,
    classifyChanged,
    includeAddRemove = true,
  } = opts

  const counts: Partial<Record<ChangeKind, number>> = {}
  if (next) {
    const { added, removed, changed } = diffById(prev, next, keyOf, isEqual)
    if (includeAddRemove) {
      if (added.length) counts.added = added.length
      if (removed.length) counts.removed = removed.length
    }
    for (const { before, after } of changed) {
      const kind = classifyChanged ? classifyChanged(before, after) : "edited"
      counts[kind] = (counts[kind] ?? 0) + 1
    }
  }

  const active = KIND_ORDER.filter((k) => (counts[k] ?? 0) > 0)
  const labelKey = active.map((k) => `${k}:${counts[k]}`).join("|")

  // Memoize the rendered label so it keeps a stable identity across renders
  // unless its content (labelKey) or the active locale (noun/verbs) actually
  // changes. Returning fresh JSX every render makes effects that depend on this
  // node — e.g. a stage's `setExtra` header injection — re-run on every render,
  // which loops into "Maximum update depth exceeded" (React #185). `labelKey`
  // fully encodes which kinds and counts are shown, so it is a sufficient key.
  const label = useMemo(() => {
    if (!labelKey) {
      return (
        <span className="text-[11px] font-medium text-foreground">
          {t`Unsaved changes`}
        </span>
      )
    }
    const verbs: Record<ChangeKind, string> = {
      added: t`added`,
      edited: t`edited`,
      removed: t`removed`,
      pruned: t`pruned`,
      restored: t`restored`,
    }
    const parts = labelKey.split("|").map((seg) => {
      const [kind, count] = seg.split(":")
      return { kind: kind as ChangeKind, n: Number(count) }
    })
    return (
      <div className="flex items-center gap-1">
        {parts.map(({ kind, n }) => (
          <PendingChip key={kind} icon={KIND_ICON[kind]}>
            {n} {n === 1 ? noun.one : noun.other} {verbs[kind]}
          </PendingChip>
        ))}
      </div>
    )
  }, [labelKey, noun.one, noun.other, t])

  return { label, labelKey, hasChanges: active.length > 0 }
}
