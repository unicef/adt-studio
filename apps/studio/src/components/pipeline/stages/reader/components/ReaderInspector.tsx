import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown, LayoutTemplate, Paintbrush, Search, Shapes, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReaderColorMode, ReaderUiDraft } from "../hooks/use-reader-ui-draft"
import type { ReaderPreview } from "../hooks/use-reader-preview"
import type { DeviceView } from "../../storyboard/components/style-editor/device-breakpoint"
import { READER_STEP_ACCENT } from "../lib/accent"
import { matchesSearch } from "../lib/search"
import { ReaderPreviewFrame } from "./ReaderPreviewFrame"
import { ThemePresetGrid } from "./PresetGrids"
import { LayoutControls } from "./LayoutControls"
import { LayoutDiagram } from "./LayoutDiagram"
import { ColorControls, ColorModeSwitch, TokenRow } from "./ColorControls"
import { ShapeControls } from "./ShapeControls"
import { SaveBar } from "./SaveBar"
import { useInspectorFields, type InspectorField, type InspectorSection } from "./inspector-fields"

interface ReaderInspectorProps {
  draft: ReaderUiDraft
  preview: ReaderPreview
  device: DeviceView
}

function Section({
  icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: ReactNode
  title: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/40"
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1">{title}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  )
}

/** The matching fields, grouped under their section's name. */
function SearchResults({
  draft,
  fields,
  query,
  colorMode,
  onColorModeChange,
}: {
  draft: ReaderUiDraft
  fields: InspectorField[]
  query: string
  colorMode: ReaderColorMode
  onColorModeChange: (mode: ReaderColorMode) => void
}) {
  const { t } = useLingui()
  const titles: Record<InspectorSection, string> = {
    theme: t`Theme`,
    layout: t`Layout`,
    colours: t`Colours`,
    shape: t`Shape and type`,
  }
  const sections = (["theme", "layout", "colours", "shape"] as const)
    .map((section) => ({ section, items: fields.filter((field) => field.section === section) }))
    .filter((group) => group.items.length > 0)

  if (sections.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-xs text-muted-foreground">
        <Trans>No settings match “{query}”.</Trans>
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {sections.map(({ section, items }) => (
        <section key={section} className="border-b px-4 py-3 last:border-b-0">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {titles[section]}
          </h3>
          {section === "colours" ? (
            <div className="flex flex-col gap-2">
              <ColorModeSwitch mode={colorMode} onChange={onColorModeChange} />
              <div className="flex flex-col">
                {items.map((field) =>
                  field.token ? <TokenRow key={field.id} draft={draft} mode={colorMode} token={field.token} /> : null,
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {items.map((field) => (
                <div key={field.id}>{field.render?.()}</div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

/**
 * The Reader step's editor: the book fills the stage, every setting lives in
 * a collapsible inspector on the right. A search box narrows the inspector to
 * the fields a word refers to ("background" lists every surface colour).
 */
export function ReaderInspector({ draft, preview, device }: ReaderInspectorProps) {
  const { t } = useLingui()
  const [query, setQuery] = useState("")
  const [colorMode, setColorMode] = useState<ReaderColorMode>("light")
  const fields = useInspectorFields(draft)
  const searching = query.trim() !== ""
  const matches = searching ? fields.filter((field) => matchesSearch(field.searchText, query)) : []

  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-w-0 flex-1 bg-muted/20">
        <ReaderPreviewFrame preview={preview} device={device} />
      </div>

      <aside className="flex w-[390px] shrink-0 flex-col border-l bg-background">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            <Trans>Reader interface</Trans>
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            <Trans>Changes show in the preview at once. Only the design you save ships with the book.</Trans>
          </p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("")
              }}
              placeholder={t`Search settings, e.g. background`}
              aria-label={t`Search settings`}
              className="h-8 w-full rounded-md border bg-transparent pl-8 pr-8 text-xs outline-none focus:ring-2 focus:ring-ring/40 [&::-webkit-search-cancel-button]:hidden"
            />
            {searching ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t`Clear search`}
                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {searching ? (
            <SearchResults
              draft={draft}
              fields={matches}
              query={query.trim()}
              colorMode={colorMode}
              onColorModeChange={setColorMode}
            />
          ) : (
            <>
              <Section icon={<Sparkles className="h-4 w-4" />} title={<Trans>Theme</Trans>} defaultOpen>
                <ThemePresetGrid draft={draft} columns={3} size="sm" />
              </Section>
              <Section icon={<LayoutTemplate className="h-4 w-4" />} title={<Trans>Layout</Trans>} defaultOpen>
                <LayoutDiagram
                  layout={draft.layout}
                  accent={draft.value.light?.primary ?? READER_STEP_ACCENT}
                  surface={draft.value.light?.popover}
                  className="mb-4"
                />
                <LayoutControls draft={draft} />
              </Section>
              <Section icon={<Paintbrush className="h-4 w-4" />} title={<Trans>Colours</Trans>}>
                <ColorControls draft={draft} selectedMode={colorMode} onModeChange={setColorMode} />
              </Section>
              <Section icon={<Shapes className="h-4 w-4" />} title={<Trans>Shape and type</Trans>}>
                <ShapeControls draft={draft} />
              </Section>
            </>
          )}
        </div>

        <div className="border-t bg-muted/20 p-3">
          <SaveBar draft={draft} layout="stack" />
        </div>
      </aside>
    </div>
  )
}
