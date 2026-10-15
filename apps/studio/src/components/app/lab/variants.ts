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
  MapPin,
  Activity,
  SignpostBig,
  BookOpenCheck,
  BookImage,
  MousePointerClick,
  Navigation,
  PanelTopDashed,
  PanelsTopLeft,
  Layers,
  Loader,
  PanelTop,
  Paintbrush,
  Undo2,
  StickyNote,
  TriangleAlert,
  LayoutGrid,
  MoveHorizontal,
  PanelBottom,
  PanelBottomOpen,
  Palette,
  Tag,
  type LucideIcon,
} from "lucide-react"
import { useMemo } from "react"
import { createPersistentStore } from "@/hooks/create-persistent-store"

export interface VariantOption {
  value: string
  label: MessageDescriptor
  hint: MessageDescriptor
}

export interface VariantState {
  panels: "current" | "arc"
  topnav: "current" | "book-step" | "crumbs"
  topstep: "current" | "pill" | "accent" | "map"
  topstatus: "current" | "summary" | "running" | "none"
  topaction: "current" | "quiet" | "clear"
  topother: "current" | "arc"
  topbook: "current" | "cover"
  entry: "current" | "gated"
  landing: "current" | "action-first" | "compact"
  dockstyle: "pills" | "leading"
  docklabels: "current" | "hover"
  running: "current" | "live" | "strip"
  return: "current" | "banner" | "toast"
  tree: "off" | "rail" | "floating"
  editor: "off" | "panel" | "floating"
  ai: "mock" | "hidden" | "wired"
  boot: "current" | "shell" | "splash"
  export: "current" | "preview-button" | "topbar"
  features: "current" | "add" | "suggested"
  loaders: "current" | "content"
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
    key: "panels",
    icon: PanelsTopLeft,
    label: msg`Workspace style`,
    options: [
      { value: "current", label: msg`Current`, hint: msg`Edge-to-edge panels separated by hard borders, a white top bar.` },
      { value: "arc", label: msg`Arc`, hint: msg`Like the Arc browser: the sidebars and top bar share one surface — white in light mode, dark in dark mode — and the content sits inside as a rounded container.` },
    ],
  },
  {
    key: "topnav",
    icon: Navigation,
    label: msg`Top bar · location`,
    options: [
      { value: "current", label: msg`Step only`, hint: msg`On step pages: a back button, then the step's icon and name.` },
      { value: "book-step", label: msg`Book › Step`, hint: msg`On step pages too, the book title comes first: back · Book › Step.` },
      { value: "crumbs", label: msg`Breadcrumb nav`, hint: msg`No back button: the breadcrumb is the navigation — click the book to go back to the storyboard.` },
    ],
  },
  {
    key: "topstep",
    icon: MapPin,
    label: msg`Top bar · step indicator`,
    options: [
      { value: "current", label: msg`Icon + name`, hint: msg`The step's colored icon and its name — on a neutral bar that's easy to miss.` },
      { value: "pill", label: msg`Colored pill`, hint: msg`The step's icon and name sit in a soft pill of the step's color.` },
      { value: "accent", label: msg`Accent edge`, hint: msg`The content container gets a thin outline in the step's color, and the step name takes that color.` },
      { value: "map", label: msg`Pipeline map`, hint: msg`A row of dots for every step after the name; the current one stretches out in its color.` },
    ],
  },
  {
    key: "topstatus",
    icon: Activity,
    label: msg`Top bar · status`,
    options: [
      { value: "current", label: msg`Current`, hint: msg`Several chips in the middle. Run progress shows inside the page.` },
      { value: "summary", label: msg`One summary`, hint: msg`One compact summary. On the storyboard, one progress pill while pages build.` },
      { value: "running", label: msg`Only running`, hint: msg`Nothing at rest. On the storyboard, one progress pill while pages build.` },
      { value: "none", label: msg`Nothing`, hint: msg`No center at all; progress only shows inside the page.` },
    ],
  },
  {
    key: "topaction",
    icon: MousePointerClick,
    label: msg`Top bar · main action`,
    options: [
      { value: "current", label: msg`Current`, hint: msg`Red text Cancel on the storyboard, solid red Cancel on steps.` },
      { value: "quiet", label: msg`Quiet`, hint: msg`Run, Re-run and Cancel are calm neutral buttons; Cancel only turns red on hover.` },
      { value: "clear", label: msg`Clear`, hint: msg`Run and Re-run neutral; Cancel is always a solid red button while something runs.` },
    ],
  },
  {
    key: "topother",
    icon: PanelTopDashed,
    label: msg`Top bar · other screens`,
    options: [
      { value: "current", label: msg`Colored bars`, hint: msg`Step settings, Preview and Export keep their solid colored bars.` },
      { value: "arc", label: msg`Same Arc bar`, hint: msg`Step settings, Preview and Export use the same neutral Arc bar and container.` },
    ],
  },
  {
    key: "topbook",
    icon: BookImage,
    label: msg`Top bar · storyboard title`,
    options: [
      { value: "current", label: msg`Book › Page`, hint: msg`The book title, then the page and its version.` },
      { value: "cover", label: msg`Cover + title`, hint: msg`A small book cover before the title.` },
    ],
  },
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
    key: "dockstyle",
    icon: PanelBottom,
    label: msg`Dock style`,
    options: [
      { value: "pills", label: msg`Pills`, hint: msg`Today's dock: every step is its own coloured circle.` },
      { value: "leading", label: msg`Storyboard first`, hint: msg`Storyboard leads the bar, then icon groups: Setup, Accessibility, Enhancements and Languages & voices. Whatever you're on fills with its colour.` },
    ],
  },
  {
    key: "docklabels",
    icon: Tag,
    label: msg`Dock names`,
    options: [
      { value: "current", label: msg`Current`, hint: msg`Only the open step shows its name; the others show it in the slow browser tooltip.` },
      { value: "hover", label: msg`On hover`, hint: msg`Hovering or focusing a step shows its name in a small label above it, without moving anything.` },
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
    key: "tree",
    icon: Layers,
    label: msg`Layers`,
    options: [
      { value: "off", label: msg`Off`, hint: msg`No element tree.` },
      { value: "rail", label: msg`Rail tab`, hint: msg`Pages and Layers tabs share the left rail.` },
      { value: "floating", label: msg`Floating`, hint: msg`A small layers panel floats over the canvas.` },
    ],
  },
  {
    key: "editor",
    icon: Paintbrush,
    label: msg`Style editor`,
    options: [
      { value: "off", label: msg`Off`, hint: msg`The canvas is read-only.` },
      { value: "panel", label: msg`Side panel`, hint: msg`Click an element to select it; its Tailwind styles open in the right panel.` },
      { value: "floating", label: msg`Floating inspector`, hint: msg`The same controls in a card floating over the canvas, so the AI panel stays where it is.` },
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
] satisfies VariantGroup[]

export type VariantTier = "layout" | "flow" | "step"

export const TIERS: { key: VariantTier; label: MessageDescriptor; hint: MessageDescriptor }[] = [
  { key: "layout", label: msg`Layout`, hint: msg`The workspace shell and the storyboard: dock, panels, chrome. Visible on every screen.` },
  { key: "flow", label: msg`Flow`, hint: msg`How you move between steps: where a book opens, setup progress, what happens when a step finishes.` },
  { key: "step", label: msg`Step`, hint: msg`Inside one step's screen: before it runs, while it runs, while it loads.` },
]

export const GROUP_META: Record<VariantKey, { tier: VariantTier }> = {
  panels: { tier: "layout" },
  topnav: { tier: "layout" },
  topstep: { tier: "layout" },
  topstatus: { tier: "layout" },
  topaction: { tier: "layout" },
  topother: { tier: "layout" },
  topbook: { tier: "layout" },
  features: { tier: "layout" },
  ai: { tier: "layout" },
  tree: { tier: "layout" },
  editor: { tier: "layout" },
  export: { tier: "layout" },
  boot: { tier: "layout" },
  entry: { tier: "flow" },
  return: { tier: "flow" },
  landing: { tier: "step" },
  dockstyle: { tier: "layout" },
  docklabels: { tier: "layout" },
  running: { tier: "step" },
  loaders: { tier: "step" },
}


export type LabStep = "extract" | "sectioning" | "storyboard" | "output" | "validation" | "preview"

export const STEP_GROUPS: Record<LabStep, VariantKey[]> = {
  extract: ["dockstyle", "docklabels", "panels", "topnav", "topstep", "topstatus", "topaction", "topother"],
  sectioning: ["dockstyle", "docklabels", "panels", "topnav", "topstep", "topstatus", "topaction", "topother"],
  storyboard: ["dockstyle", "docklabels", "panels", "topbook", "topnav", "topstatus", "topaction", "features", "tree", "editor", "ai", "loaders", "boot"],
  output: ["dockstyle", "docklabels", "panels", "topnav", "topstep", "topstatus", "topaction", "topother", "landing", "running", "return", "features"],
  validation: ["dockstyle", "docklabels", "panels", "topnav", "topstep", "topstatus", "topaction", "topother", "landing", "running", "return"],
  preview: ["topother", "export"],
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
  panels: "current",
  topnav: "current",
  topstep: "current",
  topstatus: "current",
  topaction: "current",
  topother: "current",
  topbook: "current",
  entry: "current",
  landing: "current",
  dockstyle: "pills",
  docklabels: "current",
  running: "current",
  return: "current",
  tree: "off",
  editor: "off",
  ai: "mock",
  boot: "current",
  export: "current",
  features: "current",
  loaders: "current",
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

const visibleStore = createPersistentStore<boolean>(
  "adt.lab.visible",
  true,
  (value): value is boolean => typeof value === "boolean",
)

export const useLabVisible = visibleStore.use

export const LAB_ENABLED = import.meta.env.DEV
