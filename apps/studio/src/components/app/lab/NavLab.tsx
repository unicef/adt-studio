import { useCallback, useEffect, useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import { Link2, PanelBottom, PanelLeft, PanelTop, RotateCcw, SignpostBig } from "lucide-react"
import { useRouter } from "@tanstack/react-router"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { readThemeMode, setThemeMode } from "@/lib/theme"
import { DevToolbar, type LabControl, type LabGroup, type LabValues } from "./DevToolbar"
import { clearAddedOutputs, clearNeedsDismissed } from "./outputs"
import { setFlowSim, useFlowSim } from "./flowSim"
import { resetNextSkipped } from "@/components/app/screens/pipeline/shared/contentFlow"
import { stopScenario } from "./simulate"
import { applyState, clearActiveState, statesFor } from "./testPlan/states"
import { LAB_TESTS, RECOMMENDED, TEST_BOOKS } from "./testPlan/tests"
import { getVariant, resetVariants, setVariantValue, useVariants, type VariantKey } from "./variants"

export const NAV_LAB_PARAM = "navlab"

const DOCK_KEYS = ["dockstyle", "docklabels", "tbstyle", "tbleft", "tbcenter", "docklayout", "hoverstyle", "nextcue", "dockorder"] as const

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
  const [flowSim] = useFlowSim()

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
  const groups: LabGroup[] = [
    {
      key: "dock",
      label: t`Dock`,
      icon: <PanelBottom className="size-3.5" />,
      controls: [
        {
          key: "dockstyle",
          label: t`Dock style`,
          cycle: true,
          options: [
            { value: "pills", label: t`Pills` },
            { value: "leading", label: t`Storyboard first` },
          ],
        },
        ...(tabs
          ? [
              {
                key: "docklayout",
                label: t`Layout`,
                options: [
                  { value: "groups", label: t`Groups` },
                  { value: "flat", label: t`Every step` },
                  { value: "path", label: t`Add button` },
                ],
              },
              ...(variants.docklayout === "flat"
                ? [
                    {
                      key: "hoverstyle",
                      label: t`Hover`,
                      options: [
                        { value: "popover", label: t`Popover` },
                        { value: "sheet", label: t`Sheet` },
                        { value: "morph", label: t`Morph` },
                      ],
                    },
                  ]
                : []),
            ]
          : pillControls),
      ],
      note: tabs
        ? t`Decided: icon groups (Setup, Accessibility, Enhancements, Languages & voices), sheet menu, gliding highlight, Ink · theme, instant screen changes. Outputs join the book once they run.`
        : t`The dock as it is today, plus a Storyboard pill.`,
    },
    {
      key: "flow",
      label: t`Flow`,
      icon: <SignpostBig className="size-3.5" />,
      controls: [
        {
          key: "nextcue",
          label: t`What's next`,
          cycle: true,
          options: [
            { value: "chip", label: t`Chip` },
            { value: "card", label: t`Card` },
            { value: "menu", label: t`In menu` },
          ],
        },
        {
          key: "dockorder",
          label: t`Show the order`,
          options: [
            { value: "none", label: t`Hidden` },
            { value: "arrow", label: t`Arrow` },
            { value: "cluster", label: t`Grouped` },
          ],
        },
        {
          key: "flowcontent",
          label: t`Simulate: content`,
          options: [
            { value: "final", label: t`Final` },
            { value: "running", label: t`Glossary running` },
            { value: "failed", label: t`Glossary failed` },
          ],
        },
        {
          key: "flowchanged",
          label: t`Simulate: after translating`,
          options: [
            { value: "none", label: t`Nothing new` },
            { value: "terms", label: t`3 new terms` },
          ],
        },
      ],
      note: t`Translation copies every text, so it comes after your content. Skipped suggestions come back when you switch Book.`,
    },
    {
      key: "topbar",
      label: t`Top bar`,
      icon: <PanelTop className="size-3.5" />,
      controls: [
        {
          key: "tbstyle",
          label: t`Style`,
          cycle: true,
          options: [
            { value: "current", label: t`Today` },
            { value: "workspace", label: t`Workspace` },
          ],
        },
        ...(variants.tbstyle === "workspace"
          ? [
              {
                key: "tbleft",
                label: t`Left`,
                options: [
                  { value: "book", label: t`Book name` },
                  { value: "tabs", label: t`Area tabs` },
                ],
              },
              {
                key: "tbcenter",
                label: t`Centre`,
                options: [
                  { value: "location", label: t`Where you are` },
                  { value: "status", label: t`Step status` },
                ],
              },
            ]
          : []),
      ],
      note:
        variants.tbstyle === "workspace"
          ? t`Based on Ycode: one bar for the book. Right side: run status, ▶ Preview, Export.`
          : t`Today's bar: Home, then what each screen adds.`,
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
    tbstyle: variants.tbstyle,
    docklayout: variants.docklayout,
    hoverstyle: variants.hoverstyle,
    nextcue: variants.nextcue,
    dockorder: variants.dockorder,
    flowcontent: flowSim.content,
    flowchanged: flowSim.changed,
    tbleft: variants.tbleft,
    tbcenter: variants.tbcenter,
    book: state.book,
    theme: readThemeMode() === "dark" ? "dark" : "light",
  }

  const onChange = (key: string, value: string) => {
    if ((DOCK_KEYS as readonly string[]).includes(key)) {
      setVariantValue(key as VariantKey, value)
      return
    }
    if (key === "flowcontent") {
      setFlowSim((current) => ({ ...current, content: value as typeof current.content }))
      return
    }
    if (key === "flowchanged") {
      setFlowSim((current) => ({ ...current, changed: value as typeof current.changed }))
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
        { key: "exit", label: t`Back to the full lab panel`, icon: <PanelLeft className="size-3.5" />, onClick: () => setNavLabOn(false) },
      ]}
    />
  )
}
