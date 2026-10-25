import "./frame"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import {
  Bot,
  DoorOpen,
  PackagePlus,
  ScanLine,
  FileDown,
  Hourglass,
  MousePointerClick,
  Loader,
  PanelTop,
  Undo2,
  PanelBottom,
  OctagonAlert,
  LayoutGrid,
  Rows3,
  Columns2,
  Languages,
  Lightbulb,
  Archive,
  type LucideIcon,
  Sparkles,
} from "lucide-react"
import { useMemo } from "react"
import { createPersistentStore } from "@/hooks/create-persistent-store"

export interface VariantOption {
  value: string
  label: MessageDescriptor
  hint: MessageDescriptor
}

export interface VariantState {
  entry: "current" | "gated"
  landing: "current" | "action-first" | "compact"
  docklayout: "groups" | "flat" | "path"
  dockpin: "off" | "on"
  sbsim: "real" | "building" | "failed" | "outdated" | "setupfail"
  setupsplit: "single" | "before" | "attached"
  dockfocus: "tiles" | "islands" | "base" | "tray"
  running: "current" | "live" | "strip"
  return: "current" | "banner" | "toast"
  ai: "mock" | "hidden" | "wired"
  boot: "current" | "shell" | "splash"
  export: "current" | "preview-button" | "topbar"
  features: "current" | "add" | "suggested"
  loaders: "current" | "content"
  stagefail: "banner" | "marks" | "quiet"
  pageview: "pages" | "items"
  listview: "rows" | "cards" | "pages"
  detailpane: "side" | "top" | "peek"
  langnav: "cards" | "pills" | "menu"
  hints: "note" | "help" | "none"
  pruned: "inline" | "tray"
  topborder: "on" | "off"
}

export type VariantKey = keyof VariantState

export interface VariantGroup {
  key: VariantKey
  icon: LucideIcon
  label: MessageDescriptor
  options: readonly VariantOption[]
}

export const VARIANT_GROUPS = [
  {
    key: "entry",
    icon: DoorOpen,
    label: msg`Entry`,
    options: [
      { value: "current", label: msg`Current`, hint: msg`Every book opens on the storyboard, even before it has sections.` },
      { value: "gated", label: msg`Gated`, hint: msg`Opens extract, then sectioning, and only then the storyboard. Continue goes where its label says.` },
    ],
  },
  {
    key: "landing",
    icon: PanelTop,
    label: msg`Stage landing`,
    options: [
      { value: "current", label: msg`Current`, hint: msg`Sample preview first; the run button and prerequisites sit below the fold.` },
      { value: "action-first", label: msg`Action first`, hint: msg`Run button and what is missing come first, above a smaller preview.` },
      { value: "compact", label: msg`Compact`, hint: msg`One centered column, no preview unless you ask for an example. Locked stages say what they need.` },
    ],
  },
  {
    key: "docklayout",
    icon: PanelBottom,
    label: msg`Dock layout`,
    options: [
      { value: "groups", label: msg`Groups`, hint: msg`Storyboard, then group icons (Accessibility, Enhancements, Languages & voices) that open a menu.` },
      { value: "flat", label: msg`Every step`, hint: msg`No groups: every step is its own icon in order, steps not in the book are dashed. Hover explains a step; one click opens it.` },
      { value: "path", label: msg`Add button`, hint: msg`Just the Storyboard, the step you're on and an Add button whose menu explains every feature and the order to do them in.` },
    ],
  },
  {
    key: "dockpin",
    icon: MousePointerClick,
    label: msg`Keep menu open`,
    options: [
      { value: "off", label: msg`Off`, hint: msg`Menus open on hover or click, as in the app.` },
      { value: "on", label: msg`On`, hint: msg`Lab only: the hover sheet or Add menu stays open so you can compare options without hovering again.` },
    ],
  },
  {
    key: "setupsplit",
    icon: MousePointerClick,
    label: msg`Setup steps`,
    options: [
      { value: "single", label: msg`One tile`, hint: msg`Today: Extract and Sectioning share one Setup tile that opens a panel.` },
      { value: "before", label: msg`Two tiles`, hint: msg`Two tiles like the features, left of the Storyboard button.` },
      { value: "attached", label: msg`Attached`, hint: msg`Two icon segments joined to the Storyboard button, like a split button.` },
    ],
  },
  {
    key: "dockfocus",
    icon: MousePointerClick,
    label: msg`Storyboard focus`,
    options: [
      { value: "tiles", label: msg`Two tiles`, hint: msg`Extract and Sectioning as tiles, then Storyboard, then every extra.` },
      { value: "islands", label: msg`Islands`, hint: msg`The book and the extras are two bars; the extras collapse and Storyboard re-centres.` },
      { value: "base", label: msg`Base`, hint: msg`Storyboard is a bigger block with the cover and page count; Extract and Sectioning sit inside it.` },
      { value: "tray", label: msg`Tray`, hint: msg`Only the book path stays in the dock; the extras open from one Extras button.` },
    ],
  },
  {
    key: "topborder",
    icon: LayoutGrid,
    label: msg`Top bar border`,
    options: [
      { value: "on", label: msg`On`, hint: msg`Today: a thin line under the top bar.` },
      { value: "off", label: msg`Off`, hint: msg`No line under the top bar (testing).` },
    ],
  },
  {
    key: "sbsim",
    icon: MousePointerClick,
    label: msg`Simulate storyboard`,
    options: [
      { value: "real", label: msg`Real`, hint: msg`The book's real state.` },
      { value: "building", label: msg`Building`, hint: msg`Lab books pretend the storyboard is being built.` },
      { value: "failed", label: msg`Failed`, hint: msg`Lab books pretend building the storyboard failed.` },
      { value: "outdated", label: msg`Out of date`, hint: msg`Lab books pretend setup changed after the storyboard was built.` },
      { value: "setupfail", label: msg`Setup problem`, hint: msg`Lab books pretend Extract or Sectioning needs attention.` },
    ],
  },
  {
    key: "running",
    icon: Loader,
    label: msg`Running`,
    options: [
      { value: "current", label: msg`Current`, hint: msg`One generic progress card replaces the stage while it runs.` },
      { value: "live", label: msg`Live`, hint: msg`The stage keeps its layout; pages still to come show as placeholders that fill in.` },
      { value: "strip", label: msg`Strip only`, hint: msg`Nothing is replaced or dimmed; a slim progress strip sits on top of whatever the stage already shows.` },
    ],
  },
  {
    key: "return",
    icon: Undo2,
    label: msg`Return`,
    options: [
      { value: "current", label: msg`Current`, hint: msg`Back goes to the storyboard's last page; nothing happens when a run ends.` },
      { value: "banner", label: msg`Keep page + banner`, hint: msg`Back lands on the page you were on; a finished run offers a way back in the stage header.` },
      { value: "toast", label: msg`Keep page + toast`, hint: msg`Back lands on the page you were on; a finished run pops a toast with a way back.` },
    ],
  },
  {
    key: "ai",
    icon: Bot,
    label: msg`AI panel`,
    options: [
      { value: "mock", label: msg`Current`, hint: msg`Visible everywhere, but nothing in it does anything.` },
      { value: "hidden", label: msg`Hidden`, hint: msg`Removed until it works.` },
      { value: "wired", label: msg`Wired`, hint: msg`Suggestions fit the stage and a request edits the selected section.` },
    ],
  },
  {
    key: "boot",
    icon: Hourglass,
    label: msg`Cold load`,
    options: [
      { value: "current", label: msg`Current`, hint: msg`Opening a book by URL, reloading or starting the app shows a blank window until data arrives.` },
      { value: "shell", label: msg`Skeleton`, hint: msg`The app's shape appears at once and fills in. Reload the page to see it.` },
      { value: "splash", label: msg`Splash`, hint: msg`A centered logo with "Opening the book…" and a progress shimmer. Reload the page to see it.` },
    ],
  },
  {
    key: "export",
    icon: FileDown,
    label: msg`Export`,
    options: [
      { value: "current", label: msg`Current`, hint: msg`There is no way to export from the new pipeline UI.` },
      { value: "preview-button", label: msg`From Preview`, hint: msg`Preview gets an Export button that opens a dedicated export screen.` },
      { value: "topbar", label: msg`Preview + storyboard`, hint: msg`Same export screen, also reachable from an Export button in the storyboard top bar.` },
    ],
  },
  {
    key: "features",
    icon: PackagePlus,
    label: msg`Outputs`,
    options: [
      { value: "current", label: msg`Current`, hint: msg`Every optional output sits in the dock from the start, whether the book uses it or not.` },
      { value: "add", label: msg`Add when needed`, hint: msg`The dock holds the foundation steps and only the outputs you add; the rest wait in an Add popover.` },
      { value: "suggested", label: msg`Add + suggestions`, hint: msg`Like Add when needed, plus a "What do your readers need?" card when setup finishes, and suggested outputs first in the popover.` },
    ],
  },
  {
    key: "loaders",
    icon: ScanLine,
    label: msg`Loading states`,
    options: [
      { value: "current", label: msg`Current`, hint: msg`Spinners: a centered loader while a stage loads, a spinning ghost page while a page is built or sectioned.` },
      { value: "content", label: msg`Show content`, hint: msg`Stage loads show the shape of the stage; a page being built shows your real PDF page with a scan passing over it.` },
    ],
  },
  {
    key: "stagefail",
    icon: OctagonAlert,
    label: msg`Failed run`,
    options: [
      { value: "banner", label: msg`Banner`, hint: msg`One error notice at the top of the stage, like Sectioning. (All stages)` },
      { value: "marks", label: msg`Banner + marks`, hint: msg`The notice, plus red marks on the pages and items that failed and a Failed filter. Marks only differ on page stages; on Glossary, Quizzes and TOC it looks like Banner. (All stages)` },
      { value: "quiet", label: msg`Quiet strip`, hint: msg`A slim one-line strip under the title plus the marks, no big notice. (All stages)` },
    ],
  },
  {
    key: "pageview",
    icon: LayoutGrid,
    label: msg`Page-by-page stages`,
    options: [
      { value: "pages", label: msg`Page grid`, hint: msg`A grid of page cards; open one to work on it, like Sectioning. (Captions, Easy Read, Sign language, Translate, Speech)` },
      { value: "items", label: msg`One long feed`, hint: msg`Every item in one long list grouped by page, like Captions and Easy Read today. (Captions, Easy Read, Sign language, Translate, Speech)` },
    ],
  },
  {
    key: "listview",
    icon: Rows3,
    label: msg`Book-wide lists`,
    options: [
      { value: "rows", label: msg`Rows`, hint: msg`One line per term, question or entry; open a row to edit it. (Glossary, Quizzes, TOC)` },
      { value: "cards", label: msg`Open cards`, hint: msg`Every item fully open and editable at once. TOC shows rows. (Glossary, Quizzes, TOC)` },
      { value: "pages", label: msg`By page`, hint: msg`A page grid with item counts; the list only shows inside a page. (Glossary, Quizzes, TOC)` },
    ],
  },
  {
    key: "detailpane",
    icon: Columns2,
    label: msg`Page detail`,
    options: [
      { value: "side", label: msg`Page beside`, hint: msg`The page image on the left, the stage's items on the right, like Sectioning. (Every page detail)` },
      { value: "top", label: msg`Page on top`, hint: msg`The page image as a strip you can collapse above full-width items. (Every page detail)` },
      { value: "peek", label: msg`Peek`, hint: msg`No image by default; a floating Show page button opens it over the items. (Every page detail)` },
    ],
  },
  {
    key: "langnav",
    icon: Languages,
    label: msg`Languages`,
    options: [
      { value: "cards", label: msg`Language cards`, hint: msg`Cards with each language's progress on the overview, a menu inside a page. (Translate, Speech)` },
      { value: "pills", label: msg`Pills`, hint: msg`A row of language pills under the title everywhere, like the classic screens. (Translate, Speech)` },
      { value: "menu", label: msg`Menu`, hint: msg`One language menu in the header everywhere. (Translate, Speech)` },
    ],
  },
  {
    key: "hints",
    icon: Lightbulb,
    label: msg`How it works`,
    options: [
      { value: "note", label: msg`Note`, hint: msg`A "How it works" note in the notes strip; once dismissed it stays away. (All stages)` },
      { value: "help", label: msg`Help button`, hint: msg`A small ? next to the title opens the explanation. (All stages)` },
      { value: "none", label: msg`Nothing`, hint: msg`No explanation. (All stages)` },
    ],
  },
  {
    key: "pruned",
    icon: Archive,
    label: msg`Pruned items`,
    options: [
      { value: "inline", label: msg`In place`, hint: msg`Pruned items stay where they are, muted, behind an Active / Pruned / All filter. (Glossary)` },
      { value: "tray", label: msg`Tray`, hint: msg`Pruned items collapse into one "Pruned" group at the end of the list; open it to restore. (Glossary)` },
    ],
  },
] satisfies VariantGroup[]

export type VariantTier = "layout" | "flow" | "step"

export const TIERS: { key: VariantTier; label: MessageDescriptor; hint: MessageDescriptor }[] = [
  { key: "layout", label: msg`Layout`, hint: msg`The workspace shell and the storyboard: dock, panels, chrome. Visible on every screen.` },
  { key: "flow", label: msg`Flow`, hint: msg`How you move between steps: where a book opens, setup progress, what happens when a step finishes.` },
  { key: "step", label: msg`Step`, hint: msg`Inside one step's screen: before it runs, while it runs, while it loads.` },
]

export const GROUP_META: Record<VariantKey, { tier: VariantTier }> = {
  topborder: { tier: "layout" },
  features: { tier: "layout" },
  ai: { tier: "layout" },
  export: { tier: "layout" },
  boot: { tier: "layout" },
  entry: { tier: "flow" },
  return: { tier: "flow" },
  landing: { tier: "step" },
  docklayout: { tier: "layout" },
  sbsim: { tier: "layout" },
  setupsplit: { tier: "layout" },
  dockfocus: { tier: "layout" },
  dockpin: { tier: "layout" },
  running: { tier: "step" },
  loaders: { tier: "step" },
  stagefail: { tier: "step" },
  pageview: { tier: "step" },
  listview: { tier: "step" },
  detailpane: { tier: "step" },
  langnav: { tier: "step" },
  hints: { tier: "step" },
  pruned: { tier: "step" },
}


export type LabStep = "extract" | "sectioning" | "storyboard" | "output" | "validation" | "preview"

export const STEP_GROUPS: Record<LabStep, VariantKey[]> = {
  extract: ["topborder", "docklayout", "sbsim", "setupsplit", "dockfocus", "dockpin"],
  sectioning: ["topborder", "docklayout", "sbsim", "setupsplit", "dockfocus", "dockpin"],
  storyboard: ["topborder", "docklayout", "sbsim", "setupsplit", "dockfocus", "dockpin", "features", "ai", "loaders", "boot"],
  output: ["topborder", "docklayout", "sbsim", "setupsplit", "dockfocus", "dockpin", "return", "features", "stagefail", "pageview", "listview", "detailpane", "langnav", "hints", "pruned"],
  validation: ["topborder", "docklayout", "sbsim", "setupsplit", "dockfocus", "dockpin", "return", "stagefail", "hints"],
  preview: ["export"],
}

export function stepOf(pathname: string): { step: LabStep; slug: string } | null {
  const match = pathname.match(/^\/pipeline\/[^/]+(?:\/([^/]+))?/)
  if (!match) return null
  const segment = match[1]
  if (!segment || segment === "pages") return { step: "storyboard", slug: "storyboard" }
  if (segment === "preview" || segment === "export") return { step: "preview", slug: segment }
  if (segment === "info" || segment === "settings") return null
  if (segment === "extract" || segment === "sectioning" || segment === "validation") return { step: segment, slug: segment }
  return { step: "output", slug: segment }
}

export const DEFAULT_VARIANTS: VariantState = {
  topborder: "off",
  entry: "current",
  landing: "current",
  docklayout: "groups",
  sbsim: "real",
  setupsplit: "single",
  dockfocus: "tiles",
  dockpin: "off",
  running: "current",
  return: "current",
  ai: "mock",
  boot: "current",
  export: "current",
  features: "current",
  loaders: "current",
  stagefail: "marks",
  pageview: "pages",
  listview: "rows",
  detailpane: "side",
  langnav: "cards",
  hints: "note",
  pruned: "tray",
}

function isVariantRecord(value: unknown): value is Partial<Record<string, string>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const store = createPersistentStore<Partial<Record<string, string>>>(
  "adt.lab.variants",
  {},
  isVariantRecord,
)

function resolve(raw: Partial<Record<string, string>>): VariantState {
  const next: VariantState = { ...DEFAULT_VARIANTS }
  for (const group of VARIANT_GROUPS) {
    const value = raw[group.key]
    if (value && group.options.some((option) => option.value === value)) {
      Object.assign(next, { [group.key]: value })
    }
  }
  return next
}

export function getVariant<K extends VariantKey>(key: K): VariantState[K] {
  return resolve(store.get())[key]
}

export function useVariants(): VariantState {
  const [raw] = store.use()
  return useMemo(() => resolve(raw), [raw])
}

export function useVariant<K extends VariantKey>(key: K): VariantState[K] {
  return useVariants()[key]
}

export function setVariant<K extends VariantKey>(key: K, value: VariantState[K]) {
  setVariantValue(key, value)
}

export function setVariantValue(key: VariantKey, value: string) {
  store.set((previous) => ({ ...previous, [key]: value }))
}

export function resetVariants() {
  store.set({})
}

export const LAB_ENABLED = import.meta.env.DEV
