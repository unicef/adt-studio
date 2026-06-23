import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

/**
 * Tracks which settings sub-tabs currently hold unsaved edits, per stage.
 *
 * Each settings surface (a stage's main settings, or a sub-editor like the
 * voice-mappings panel) registers the set of tab keys it has dirty. The sidebar
 * reads this to draw a "pending changes" dot on those sub-tabs, and the
 * navigation guard reads it to know the stage has unsaved work even when the
 * floating save bar is hidden on the current tab.
 *
 * It is intentionally separate from the floating-save registry: that one drives
 * the per-tab save bar (and is sometimes gated to a single tab), whereas this
 * one is the stage-wide truth used for indicators and the leave-guard.
 */
class DirtyTabsStore {
  private entries = new Map<string, { stage: string; tabs: string[]; ephemeral: boolean }>()
  private sigs = new Map<string, string>()
  private listeners = new Set<() => void>()
  private version = 0

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getVersion = () => this.version

  upsert(id: string, stage: string, tabs: string[], ephemeral: boolean) {
    const sig = `${stage}|${tabs.join(",")}|${ephemeral ? "1" : "0"}`
    if (this.sigs.get(id) === sig) return
    this.sigs.set(id, sig)
    this.entries.set(id, { stage, tabs, ephemeral })
    this.bump()
  }

  remove(id: string) {
    if (this.entries.delete(id)) {
      this.sigs.delete(id)
      this.bump()
    }
  }

  tabsForStage(stage: string): Set<string> {
    const out = new Set<string>()
    for (const entry of this.entries.values()) {
      if (entry.stage === stage) entry.tabs.forEach((t) => out.add(t))
    }
    return out
  }

  hasAny(): boolean {
    for (const entry of this.entries.values()) {
      if (entry.tabs.length > 0) return true
    }
    return false
  }

  list(): { stage: string; tabs: string[] }[] {
    return [...this.entries.values()].filter((e) => e.tabs.length > 0)
  }

  /** Dirty tabs belonging to "ephemeral" surfaces (unmount when their tab is left). */
  ephemeralTabs(): Set<string> {
    const out = new Set<string>()
    for (const entry of this.entries.values()) {
      if (entry.ephemeral) entry.tabs.forEach((t) => out.add(t))
    }
    return out
  }

  private bump() {
    this.version += 1
    this.listeners.forEach((fn) => fn())
  }
}

const DirtyTabsContext = createContext<DirtyTabsStore | null>(null)

export function SettingsDirtyTabsProvider({ children }: { children: ReactNode }) {
  const ref = useRef<DirtyTabsStore | null>(null)
  if (!ref.current) ref.current = new DirtyTabsStore()
  return <DirtyTabsContext.Provider value={ref.current}>{children}</DirtyTabsContext.Provider>
}

const noopSubscribe = () => () => {}

/**
 * Register a settings surface's dirty tabs. Pass a stable `id`. When `tabs` is
 * empty the surface contributes nothing. Safe to call without a provider.
 *
 * `ephemeral` marks a surface that only exists while its tab is active (e.g. a
 * tab-conditional sub-editor) — leaving its tab unmounts it and drops edits, so
 * the leave-guard must prompt on that transition.
 */
export function useRegisterDirtyTabs(
  id: string,
  stage: string,
  tabs: string[],
  ephemeral = false,
) {
  const store = useContext(DirtyTabsContext)
  // Re-register the latest tabs every render (sig-guarded inside the store).
  useEffect(() => {
    store?.upsert(id, stage, tabs, ephemeral)
  })
  useEffect(() => {
    if (!store) return
    return () => store.remove(id)
  }, [store, id])
}

/** Dirty tab keys for a stage (reactive). Empty set outside a provider. */
export function useDirtyTabsForStage(stage: string): Set<string> {
  const store = useContext(DirtyTabsContext)
  const version = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getVersion : () => 0,
    store ? store.getVersion : () => 0,
  )
  // `version` is the reactive trigger; tabsForStage is recomputed on each bump.
  return useMemo(
    () => (store ? store.tabsForStage(stage) : new Set<string>()),
    [store, stage, version],
  )
}

/**
 * Records which tabs an edit happened on. Call `markTab(currentTab)` from a
 * stage's change handlers (the edit is always on the tab being viewed), so
 * config edits are attributed to the right tab without a field→tab map.
 */
export function useDirtyTabTracker() {
  const [markedTabs, setMarkedTabs] = useState<string[]>([])
  const markTab = useCallback(
    (tab: string) => setMarkedTabs((prev) => (prev.includes(tab) ? prev : [...prev, tab])),
    [],
  )
  const resetMarkedTabs = useCallback(() => setMarkedTabs([]), [])
  return { markedTabs, markTab, resetMarkedTabs }
}

/** All dirty settings surfaces (stage + tab keys), reactive. */
export function useDirtyTabEntries(): { stage: string; tabs: string[] }[] {
  const store = useContext(DirtyTabsContext)
  const version = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getVersion : () => 0,
    store ? store.getVersion : () => 0,
  )
  return useMemo(() => (store ? store.list() : []), [store, version])
}

/** Dirty tabs of ephemeral surfaces — leaving these unmounts the editor (reactive). */
export function useEphemeralDirtyTabs(): Set<string> {
  const store = useContext(DirtyTabsContext)
  const version = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getVersion : () => 0,
    store ? store.getVersion : () => 0,
  )
  return useMemo(() => (store ? store.ephemeralTabs() : new Set<string>()), [store, version])
}

/** Whether any registered settings surface has unsaved tabs (reactive). */
export function useHasAnyDirtyTab(): boolean {
  const store = useContext(DirtyTabsContext)
  const version = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getVersion : () => 0,
    store ? store.getVersion : () => 0,
  )
  return useMemo(
    () => (store ? store.hasAny() : false),
    [store, version],
  )
}
