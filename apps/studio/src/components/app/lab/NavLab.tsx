import { useCallback, useEffect } from "react"
import { useLingui } from "@lingui/react/macro"
import { ClipboardCheck, Link2, ListChecks, PanelBottom, RotateCcw } from "lucide-react"
import { useRouter, useRouterState } from "@tanstack/react-router"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { readThemeMode, setThemeMode } from "@/lib/theme"
import { DevToolbar, type LabControl, type LabGroup, type LabValues } from "./DevToolbar"
import { clearAddedOutputs, clearNeedsDismissed } from "./outputs"
import { setBookSim, type BookSim } from "./bookSim"
import { resetNextSkipped } from "@/components/app/screens/pipeline/shared/contentFlow"
import { stopScenario } from "./simulate"
import { clearActiveState } from "./testPlan/states"
import { RECOMMENDED, TEST_BOOKS } from "./testPlan/tests"
import { ChecklistPanel } from "./ChecklistPanel"
import { applyStageState, clearStageState, pageKeyFor, useActiveStageState, useStageStates } from "./stageStates"
import { getVariant, resetVariants, setVariantValue, useVariants, type VariantKey } from "./variants"

export const NAV_LAB_PARAM = "navlab"

const DOCK_KEYS = ["docklayout", "sbsim", "setupsplit", "dockfocus", "dockpin"] as const

interface NavLabState {
  on: boolean
  book: string
  screen: string
}

const store = createPersistentStore<NavLabState>(
  "adt.lab.navlab",
  { on: false, book: "all", screen: "storyboard" },
  (value): value is NavLabState => typeof value === "object" && value !== null && "book" in value && "screen" in value,
)

export const useNavLab = store.use

export function setNavLabOn(on: boolean) {
  if (on) applyRecommended()
  else setBookSim("real")
  store.set((current) => ({ ...current, on }))
}

function applyRecommended(overrides: Partial<Record<VariantKey, string>> = {}) {
  const kept: Partial<Record<VariantKey, string>> = Object.fromEntries(DOCK_KEYS.map((key) => [key, getVariant(key)]))
  resetVariants()
  for (const [key, value] of Object.entries({ ...RECOMMENDED, ...kept, ...overrides })) setVariantValue(key as VariantKey, value)
}

const BOOKS: Record<string, { label: string; sim: BookSim }> = {
  none: { label: TEST_BOOKS.fresh, sim: "real" },
  storyboard: { label: TEST_BOOKS.done, sim: "storyboard" },
  some: { label: TEST_BOOKS.done, sim: "some" },
  all: { label: TEST_BOOKS.done, sim: "all" },
  warning: { label: TEST_BOOKS.done, sim: "warning" },
  error: { label: TEST_BOOKS.done, sim: "error" },
}

function pathFor(book: string, screen: string): string {
  const label = BOOKS[book]?.label ?? TEST_BOOKS.done
  if (screen === "output") return `/pipeline/${label}/captions`
  if (screen === "output-page") return `/pipeline/${label}/captions?page=pg008009`
  if (screen === "setup") return `/pipeline/${label}/sectioning`
  if (book === "none") return `/pipeline/${label}`
  return `/pipeline/${label}/pages/pg008009`
}

export function NavLab() {
  const { t } = useLingui()
  const router = useRouter()
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname })
  const stageStates = useStageStates()
  const [activeStage] = useActiveStageState()
  const pageKey = pageKeyFor(pathname)
  const pageStates = (pageKey && stageStates?.byPage[pageKey]) || []
  const kindOrder = Object.keys(stageStates?.kinds ?? {})
  const stateControls: LabControl[] = [
    { key: "stagestate", label: t`Live`, options: [{ value: "real-data", label: t`Real data` }] },
    ...kindOrder
      .filter((kind) => pageStates.some((state) => state.kind === kind))
      .map((kind) => ({
        key: "stagestate",
        label: stageStates?.kinds[kind] ?? kind,
        options: pageStates.filter((state) => state.kind === kind).map((state) => ({ value: state.id, label: state.label })),
      })),
  ]
  const variants = useVariants()
  const [state, setState] = store.use()

  const books = [
    { value: "none", label: t`None` },
    { value: "storyboard", label: t`Storyboard run` },
    { value: "some", label: t`Some` },
    { value: "all", label: t`All` },
    { value: "warning", label: t`Warning` },
    { value: "error", label: t`Error` },
  ]

  const groups: LabGroup[] = [
    {
      key: "checklist",
      label: t`Checklist`,
      icon: <ClipboardCheck className="size-3.5" />,
      controls: [],
      content: <ChecklistPanel stageStates={stageStates} active={activeStage} />,
      note: t`Tick a state once it's validated. Click a state's name to open it.`,
    },
    {
      key: "states",
      label: t`States`,
      icon: <ListChecks className="size-3.5" />,
      controls: pageStates.length > 0 ? stateControls : [],
      note: !stageStates
        ? t`State previews need the local lab canvas files (lab/canvas).`
        : pageStates.length > 0
          ? t`Every state the lab can show for ${pageKey}. Picking one reloads the page in that state; Real data turns the simulation off.`
          : t`No simulated states for this screen yet.`,
    },
    {
      key: "dock",
      label: t`Dock`,
      icon: <PanelBottom className="size-3.5" />,
      controls: [
        {
          key: "docklayout",
          label: t`Layout`,
          options: [
            { value: "groups", label: t`Groups` },
            { value: "flat", label: t`Every step` },
            { value: "path", label: t`Add button` },
          ],
        },
        variants.docklayout === "flat"
          ? {
              key: "dockfocus",
              label: t`Storyboard focus`,
              options: [
                { value: "tiles", label: t`Two tiles` },
                { value: "islands", label: t`Islands` },
                { value: "base", label: t`Base` },
                { value: "tray", label: t`Tray` },
              ],
            }
          : {
              key: "setupsplit",
              label: t`Extract and Sectioning`,
              options: [
                { value: "single", label: t`One tile` },
                { value: "before", label: t`Two tiles` },
                { value: "attached", label: t`Attached` },
              ],
            },
        ...(variants.docklayout === "flat" || variants.docklayout === "path"
          ? [
              {
                key: "dockpin",
                label: t`Keep menu open`,
                options: [
                  { value: "off", label: t`Off` },
                  { value: "on", label: t`On` },
                ],
              },
            ]
          : []),
      ],
      note: t`Decided: Storyboard first, Ink · theme, every step as a tile, sheet card, scale highlight, instant screen changes. Outputs join the book once they run.`,
    },
  ]
  const controls: LabControl[] = [
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
      setBookSim((BOOKS[book] ?? BOOKS.all).sim)
      clearActiveState()
      stopScenario()
      clearAddedOutputs()
      clearNeedsDismissed()
      navigate(path)
    },
    [router],
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
    stagestate: activeStage && activeStage.page === pageKey ? activeStage.id : "real-data",
    docklayout: variants.docklayout,
    sbsim: variants.sbsim,
    setupsplit: variants.setupsplit,
    dockfocus: variants.dockfocus,
    dockpin: variants.dockpin,
    book: BOOKS[state.book] ? state.book : "all",
    theme: readThemeMode() === "dark" ? "dark" : "light",
  }

  const onChange = (key: string, value: string) => {
    if (key === "stagestate") {
      if (value === "real-data") {
        clearStageState()
        window.location.reload()
        return
      }
      const state = pageStates.find((candidate) => candidate.id === value)
      if (state && pageKey) applyStageState(pageKey, state)
      return
    }
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
    if (key === "book") resetNextSkipped()
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
      groups={groups}
      values={values}
      onChange={onChange}
      actions={[
        { key: "restart", label: t`Restart this state`, icon: <RotateCcw className="size-3.5" />, onClick: () => go(state.book, state.screen) },
        { key: "link", label: t`Copy a link to this combination`, icon: <Link2 className="size-3.5" />, onClick: copyLink },
      ]}
    />
  )
}
