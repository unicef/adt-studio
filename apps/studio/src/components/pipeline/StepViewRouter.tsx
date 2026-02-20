import { createContext, useContext, useCallback, useState, type ReactNode } from "react"
import { STAGES, toCamelLabel } from "./stage-config"
import {
  BookView,
  ExtractView,
  StoryboardView,
  QuizzesView,
  CaptionsView,
  GlossaryView,
  TranslationsView,
  PreviewView,
} from "./stages"
import { cn } from "@/lib/utils"

// Context for views to inject content into the step header
interface StepHeaderControls {
  setExtra: (node: ReactNode) => void
  setOnLabelClick: (handler: (() => void) | null) => void
  /** DOM element for portal-based header injection (avoids setExtra re-render loops) */
  headerSlotEl: HTMLElement | null
}
const StepHeaderContext = createContext<StepHeaderControls>({
  setExtra: () => {},
  setOnLabelClick: () => {},
  headerSlotEl: null,
})
export function useStepHeader() {
  return useContext(StepHeaderContext)
}

interface ViewProps {
  bookLabel: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}

interface ViewEntry {
  component: React.ComponentType<ViewProps>
  fullHeight?: boolean
}

const VIEW_MAP: Record<string, ViewEntry> = {
  book: { component: BookView },
  extract: { component: ExtractView, fullHeight: true },
  storyboard: { component: StoryboardView, fullHeight: true },
  quizzes: { component: QuizzesView },
  captions: { component: CaptionsView },
  glossary: { component: GlossaryView },
  "text-and-speech": { component: TranslationsView },
  preview: { component: PreviewView, fullHeight: true },
}

export function StepViewRouter({ step, bookLabel, selectedPageId, onSelectPage }: { step: string; bookLabel: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const entry = VIEW_MAP[step]
  const stepConfig = STAGES.find((s) => s.slug === step)
  const [headerExtra, setHeaderExtra] = useState<ReactNode>(null)
  const [labelClickHandler, setLabelClickHandler] = useState<{ fn: () => void } | null>(null)
  const [headerSlotEl, setHeaderSlotEl] = useState<HTMLElement | null>(null)

  const setOnLabelClick = useCallback((handler: (() => void) | null) => {
    setLabelClickHandler(handler ? { fn: handler } : null)
  }, [])

  const controls: StepHeaderControls = { setExtra: setHeaderExtra, setOnLabelClick, headerSlotEl }

  if (!entry || !stepConfig) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Unknown step: {step}
      </div>
    )
  }

  const View = entry.component
  const Icon = stepConfig.icon

  return (
    <StepHeaderContext.Provider value={controls}>
      <div className="flex flex-col h-full">
        {/* Step header */}
        <div className={cn("shrink-0 h-10 px-4 flex items-center gap-3 text-white", stepConfig.bgDark)}>
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20">
            <Icon className="w-3 h-3" />
          </div>
          {labelClickHandler ? (
            <button
              type="button"
              onClick={labelClickHandler.fn}
              className="text-sm font-semibold hover:text-white/70 transition-colors"
            >
              {step === "book" ? toCamelLabel(bookLabel) : stepConfig.label}
            </button>
          ) : (
            <h2 className="text-sm font-semibold">{step === "book" ? toCamelLabel(bookLabel) : stepConfig.label}</h2>
          )}
          <div ref={setHeaderSlotEl} className="contents" />
          {headerExtra}
        </div>

        {/* Step content */}
        {entry.fullHeight ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <View bookLabel={bookLabel} selectedPageId={selectedPageId} onSelectPage={onSelectPage} />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto p-4">
            <View bookLabel={bookLabel} selectedPageId={selectedPageId} onSelectPage={onSelectPage} />
          </div>
        )}
      </div>
    </StepHeaderContext.Provider>
  )
}
