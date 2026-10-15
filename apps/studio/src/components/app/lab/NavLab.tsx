import { useCallback, useEffect, useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import { Link2, PanelLeft, RotateCcw } from "lucide-react"
import { useRouter } from "@tanstack/react-router"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { readThemeMode, setThemeMode } from "@/lib/theme"
import { DevToolbar, type LabControl, type LabValues } from "./DevToolbar"
import { clearAddedOutputs, clearNeedsDismissed } from "./outputs"
import { stopScenario } from "./simulate"
import { applyState, clearActiveState, statesFor } from "./testPlan/states"
import { LAB_TESTS, RECOMMENDED, TEST_BOOKS } from "./testPlan/tests"
import { getVariant, resetVariants, setVariantValue, useVariants, type VariantKey } from "./variants"

export const NAV_LAB_PARAM = "navlab"

const DOCK_KEYS = ["dockstyle", "docklabels"] as const

interface NavLabState {
  on: boolean
  book: string
  screen: string
}

const store = createPersistentStore<NavLabState>(
  "adt.lab.navlab",
  { on: false, book: "ready", screen: "storyboard" },
  (value): value is NavLabState => typeof value === "object" && value !== null && "book" in value && "screen" in value,
)

export const useNavLab = store.use

export function setNavLabOn(on: boolean) {
  if (on) applyRecommended()
  store.set((current) => ({ ...current, on }))
}

function applyRecommended(overrides: Partial<Record<VariantKey, string>> = {}) {
  const kept = Object.fromEntries(DOCK_KEYS.map((key) => [key, getVariant(key)]))
  resetVariants()
  for (const [key, value] of Object.entries({ ...RECOMMENDED, panels: "arc", ...kept, ...overrides })) setVariantValue(key as VariantKey, value)
}

const BOOKS: Record<string, { label: string; testId?: string; stateId?: string }> = {
  ready: { label: TEST_BOOKS.done },
  added: { label: TEST_BOOKS.done, testId: "features-suggested", stateId: "added" },
  nothing: { label: TEST_BOOKS.done, testId: "features-suggested", stateId: "nothing" },
  building: { label: TEST_BOOKS.done, testId: "flow-journey", stateId: "storyboard" },
  setup: { label: TEST_BOOKS.fresh },
}

function pathFor(book: string, screen: string): string {
  const label = BOOKS[book]?.label ?? TEST_BOOKS.done
  if (screen === "output") return `/pipeline/${label}/captions`
  if (screen === "output-page") return `/pipeline/${label}/captions?page=pg008009`
  if (screen === "setup") return `/pipeline/${label}/sectioning`
  if (book === "setup") return `/pipeline/${label}`
  return `/pipeline/${label}/pages/pg008009`
}

export function NavLab() {
  const { t } = useLingui()
  const router = useRouter()
  const variants = useVariants()
  const [state, setState] = store.use()

  const books = [
    { value: "ready", label: t`Ready` },
    { value: "added", label: t`3 added` },
    { value: "nothing", label: t`None yet` },
    { value: "building", label: t`Building` },
    { value: "setup", label: t`Setup` },
  ]

  const tabs = variants.dockstyle !== "pills"
  const pillControls: LabControl[] = [
    {
      key: "docklabels",
      label: t`Step names`,
      options: [
        { value: "current", label: t`Open step only` },
        { value: "hover", label: t`On hover` },
      ],
    },
  ]
  const controls: LabControl[] = [
    {
      key: "dockstyle",
      label: t`Dock style`,
      cycle: true,
      options: [
        { value: "pills", label: t`Pills` },
        { value: "leading", label: t`Storyboard first` },
      ],
    },
    ...(tabs ? [] : pillControls),
    { key: "book", label: t`Book`, options: books },
    {
      key: "theme",
      label: t`Theme`,
      options: [
        { value: "light", label: t`Light` },
        { value: "dark", label: t`Dark` },
      ],
    },
  ]

  const go = useCallback(
    (book: string, screen: string) => {
      const path = pathFor(book, screen)
      const navigate = (next: string) => router.history.push(next)
      const entry = BOOKS[book]
      const test = entry?.testId ? LAB_TESTS.find((candidate) => candidate.id === entry.testId) : undefined
      const labState = test ? statesFor(test).find((candidate) => candidate.id === entry?.stateId) : undefined
      const current = Object.fromEntries(Object.keys(variants).map((key) => [key, getVariant(key as VariantKey)])) as Partial<Record<VariantKey, string>>
      if (test && labState) {
        applyState(test, { ...labState, path }, navigate, true, current)
        return
      }
      clearActiveState()
      stopScenario()
      clearAddedOutputs()
      clearNeedsDismissed()
      navigate(path)
    },
    [router, variants],
  )

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has(NAV_LAB_PARAM)) return
    const overrides = Object.fromEntries(DOCK_KEYS.flatMap((key) => (params.get(`nl-${key}`) ? [[key, params.get(`nl-${key}`) ?? ""]] : [])))
    const book = params.get("nl-book") ?? state.book
    const screen = params.get("nl-screen") ?? state.screen
    const theme = params.get("nl-theme")
    applyRecommended(overrides)
    if (theme === "light" || theme === "dark") setThemeMode(theme)
    setState({ on: true, book, screen })
    go(book, screen)
  }, [])

  const values: LabValues = {
    dockstyle: variants.dockstyle,
    docklabels: variants.docklabels,
    book: state.book,
    theme: readThemeMode() === "dark" ? "dark" : "light",
  }

  const onChange = (key: string, value: string) => {
    if ((DOCK_KEYS as readonly string[]).includes(key)) {
      setVariantValue(key as VariantKey, value)
      return
    }
    if (key === "theme") {
      setThemeMode(value === "dark" ? "dark" : "light")
      setState((current) => ({ ...current }))
      return
    }
    const next = { ...state, [key]: value }
    next.screen = "storyboard"
    setState(next)
    go(next.book, next.screen)
  }

  const copyLink = () => {
    const url = new URL(window.location.origin + "/")
    url.searchParams.set(NAV_LAB_PARAM, "1")
    for (const key of DOCK_KEYS) url.searchParams.set(`nl-${key}`, variants[key])
    url.searchParams.set("nl-book", state.book)
    url.searchParams.set("nl-screen", state.screen)
    url.searchParams.set("nl-theme", values.theme)
    void navigator.clipboard?.writeText(url.toString())
  }

  return (
    <DevToolbar
      controls={controls}
      values={values}
      onChange={onChange}
      actions={[
        { key: "restart", label: t`Restart this state`, icon: <RotateCcw className="size-3.5" />, onClick: () => go(state.book, state.screen) },
        { key: "link", label: t`Copy a link to this combination`, icon: <Link2 className="size-3.5" />, onClick: copyLink },
        { key: "exit", label: t`Back to the full lab panel`, icon: <PanelLeft className="size-3.5" />, onClick: () => setNavLabOn(false) },
      ]}
    />
  )
}
