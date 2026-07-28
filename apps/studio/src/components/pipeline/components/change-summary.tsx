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

/** Single source of truth for a change kind's icon — shared by the pending-save
 *  chips, the version-picker popover, and the compare dialog. */
export const KIND_ICON: Record<ChangeKind, LucideIcon> = {
  added: Plus,
  edited: Pencil,
  removed: Trash2,
  pruned: EyeOff,
  restored: Eye,
}

/** Hex color per change kind — used where alpha compositing is needed (e.g.
 *  `${KIND_COLOR.edited}1a` tinted badges). For solid text prefer
 *  {@link KIND_TEXT_CLASS} so styling stays in Tailwind utilities. */
export const KIND_COLOR: Record<ChangeKind, string> = {
  added: "#10b981",
  edited: "#f59e0b",
  removed: "#f43f5e",
  pruned: "#a3a3a3",
  restored: "#0ea5e9",
}

/** Tailwind text-color utility per change kind (mirrors {@link KIND_COLOR}). */
export const KIND_TEXT_CLASS: Record<ChangeKind, string> = {
  added: "text-emerald-500",
  edited: "text-amber-500",
  removed: "text-rose-500",
  pruned: "text-neutral-400",
  restored: "text-sky-500",
}

/** Tailwind chip classes (tinted bg + AA-dark text + ring) per change kind, for
 *  small accent elements (e.g. a level badge) that should match their section's
 *  color while staying legible. Use with a `ring-1` base class. */
export const KIND_CHIP_CLASS: Record<ChangeKind, string> = {
  added: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  edited: "bg-amber-100 text-amber-800 ring-amber-300",
  removed: "bg-rose-100 text-rose-800 ring-rose-300",
  pruned: "bg-neutral-100 text-neutral-700 ring-neutral-300",
  restored: "bg-sky-100 text-sky-800 ring-sky-300",
}

/** Neutral chip classes for unchanged / no-kind contexts (pairs with
 *  {@link KIND_CHIP_CLASS}). Use with a `ring-1` base class. */
export const NEUTRAL_CHIP_CLASS = "bg-slate-100 text-slate-700 ring-slate-300"

/**
 * Deterministic JSON string with object keys sorted recursively, so equality
 * checks aren't fooled by key-insertion-order differences between versions
 * (e.g. one version serialized `{word,…,source}` and another `{source,word,…}`).
 * Use this for diff descriptors' `isEqual` instead of raw `JSON.stringify`.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(
          Object.keys(val as Record<string, unknown>)
            .sort()
            .map((k) => [k, (val as Record<string, unknown>)[k]])
        )
      : val
  )
}

/** Default item equality for diff descriptors: deep, key-order-insensitive. */
export function stableEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b)
}

export function diffById<T>(
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
