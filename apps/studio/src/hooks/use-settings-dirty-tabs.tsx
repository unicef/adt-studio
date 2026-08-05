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

export function useRegisterDirtyTabs(
  id: string,
  stage: string,
  tabs: string[],
  ephemeral = false,
) {
  const store = useContext(DirtyTabsContext)
  useEffect(() => {
    store?.upsert(id, stage, tabs, ephemeral)
  })
  useEffect(() => {
    if (!store) return
    return () => store.remove(id)
  }, [store, id])
}

export function useDirtyTabsForStage(stage: string): Set<string> {
  const store = useContext(DirtyTabsContext)
  const version = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getVersion : () => 0,
    store ? store.getVersion : () => 0,
  )
  return useMemo(
    () => (store ? store.tabsForStage(stage) : new Set<string>()),
    [store, stage, version],
  )
}

export function useDirtyTabTracker() {
  const [markedTabs, setMarkedTabs] = useState<string[]>([])
  const markTab = useCallback(
    (tab: string) => setMarkedTabs((prev) => (prev.includes(tab) ? prev : [...prev, tab])),
    [],
  )
  const resetMarkedTabs = useCallback(() => setMarkedTabs([]), [])
  return { markedTabs, markTab, resetMarkedTabs }
}

export function useDirtyTabEntries(): { stage: string; tabs: string[] }[] {
  const store = useContext(DirtyTabsContext)
  const version = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getVersion : () => 0,
    store ? store.getVersion : () => 0,
  )
  return useMemo(() => (store ? store.list() : []), [store, version])
}

export function useEphemeralDirtyTabs(): Set<string> {
  const store = useContext(DirtyTabsContext)
  const version = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getVersion : () => 0,
    store ? store.getVersion : () => 0,
  )
  return useMemo(() => (store ? store.ephemeralTabs() : new Set<string>()), [store, version])
}

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
