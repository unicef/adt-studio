import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import type { LucideIcon } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { FloatingSaveBar } from "./FloatingSaveBar"

/**
 * Pill used inside the floating save bar to describe a pending change
 * (icon + short label). Shared so every stage's "unsaved" detail looks the
 * same as the storyboard editor's category chips.
 */
export function PendingChip({
  icon: Icon,
  children,
}: {
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <span className="adt-pill-chip inline-flex items-center gap-1 rounded bg-muted/70 px-2 py-0.5 text-[11px] font-medium text-foreground overflow-hidden whitespace-nowrap">
      <Icon className="h-3 w-3 text-muted-foreground" />
      {children}
    </span>
  )
}

/**
 * A single pending-save surface (a stage header picker, a captions page, the
 * storyboard section editor, …). Each registers with the provider; the host
 * renders ONE shared FloatingSaveBar that either mirrors the lone dirty entry
 * or aggregates several into a Save all / Discard all bar. This keeps
 * multi-picker surfaces (the captions gallery) from stacking N identical bars
 * at the same fixed position.
 */
export interface FloatingSaveEntry {
  id: string
  dirty: boolean
  saving: boolean
  label?: ReactNode
  onSave?: () => void
  onDiscard: () => void
  saveDisabledReason?: string
  /**
   * Primitive that changes when `label` content changes. Required only for
   * entries with a dynamic label (e.g. storyboard's category chips) so the bar
   * re-renders; entries with a static label can omit it.
   */
  labelKey?: string
}

/** Fields whose change must re-render the host (label content excluded — see labelKey). */
function signature(e: FloatingSaveEntry): string {
  return [
    e.dirty ? "1" : "0",
    e.saving ? "1" : "0",
    e.onSave ? "1" : "0",
    e.saveDisabledReason ?? "",
    e.labelKey ?? "",
  ].join("|")
}

class FloatingSaveStore {
  private entries = new Map<string, FloatingSaveEntry>()
  private sigs = new Map<string, string>()
  private listeners = new Set<() => void>()
  private version = 0

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getVersion = () => this.version

  get(id: string) {
    return this.entries.get(id)
  }

  /** Live dirty entries, read fresh at host render time. */
  active(): FloatingSaveEntry[] {
    return [...this.entries.values()].filter((e) => e.dirty)
  }

  upsert(entry: FloatingSaveEntry) {
    this.entries.set(entry.id, entry)
    const sig = signature(entry)
    if (this.sigs.get(entry.id) !== sig) {
      this.sigs.set(entry.id, sig)
      this.bump()
    }
  }

  remove(id: string) {
    const existed = this.entries.delete(id)
    this.sigs.delete(id)
    if (existed) this.bump()
  }

  private bump() {
    this.version += 1
    this.listeners.forEach((fn) => fn())
  }
}

const FloatingSaveContext = createContext<FloatingSaveStore | null>(null)

export function FloatingSaveProvider({ children }: { children: ReactNode }) {
  const ref = useRef<FloatingSaveStore | null>(null)
  if (!ref.current) ref.current = new FloatingSaveStore()
  const store = ref.current
  return (
    <FloatingSaveContext.Provider value={store}>
      {children}
      <FloatingSaveHost store={store} />
    </FloatingSaveContext.Provider>
  )
}

interface BarProps {
  label?: ReactNode
  saving: boolean
  onSave?: () => void
  onDiscard: () => void
  saveDisabledReason?: string
}

const EXIT_MS = 200

function FloatingSaveHost({ store }: { store: FloatingSaveStore }) {
  const { t } = useLingui()
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion)

  const entries = store.active()
  const present = entries.length > 0

  // Build the bar props while present. Callbacks indirect through the store so
  // they're never stale, even when the host hasn't re-rendered since a consumer
  // swapped its handler closure.
  let barProps: BarProps | null = null
  if (entries.length === 1) {
    const e = entries[0]
    barProps = {
      label: e.label,
      saving: e.saving,
      onSave: e.onSave ? () => store.get(e.id)?.onSave?.() : undefined,
      onDiscard: () => store.get(e.id)?.onDiscard(),
      saveDisabledReason: e.saveDisabledReason,
    }
  } else if (entries.length > 1) {
    barProps = {
      label: (
        <span className="text-[11px] font-medium text-foreground">
          {t`${entries.length} items with unsaved changes`}
        </span>
      ),
      saving: entries.some((e) => e.saving),
      onSave: entries.some((e) => e.onSave)
        ? () => store.active().forEach((e) => e.onSave?.())
        : undefined,
      onDiscard: () => store.active().forEach((e) => e.onDiscard()),
      saveDisabledReason: entries.find((e) => e.saveDisabledReason)?.saveDisabledReason,
    }
  }

  // Presence: keep the bar mounted through its exit animation after it clears.
  const lastProps = useRef<BarProps | null>(null)
  if (barProps) lastProps.current = barProps
  const [mounted, setMounted] = useState(present)
  useEffect(() => {
    if (present) {
      setMounted(true)
      return
    }
    const id = window.setTimeout(() => setMounted(false), EXIT_MS)
    return () => window.clearTimeout(id)
  }, [present])

  if (!mounted || !lastProps.current) return null
  return <FloatingSaveBar {...lastProps.current} closing={!present} />
}

const noopSubscribe = () => () => {}

/**
 * Whether any registered surface currently has unsaved changes. Reactive —
 * re-renders when the dirty set changes. Returns false outside a provider.
 */
export function useHasUnsavedChanges(): boolean {
  const store = useContext(FloatingSaveContext)
  const subscribe = store ? store.subscribe : noopSubscribe
  const getSnapshot = () => (store ? store.active().length > 0 : false)
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Register an editable surface's pending-save state with the shared floating
 * bar. Pass a stable `id`. When `dirty` is false the entry contributes nothing.
 * Safe to call without a provider (no-op) so isolated views still render.
 */
export function useFloatingSave(entry: FloatingSaveEntry) {
  const store = useContext(FloatingSaveContext)
  const { id } = entry

  // Re-register the latest entry (fresh callbacks/label) on every render.
  useEffect(() => {
    store?.upsert(entry)
  })

  // Unregister on unmount or when the id changes.
  useEffect(() => {
    if (!store) return
    return () => store.remove(id)
  }, [store, id])
}
