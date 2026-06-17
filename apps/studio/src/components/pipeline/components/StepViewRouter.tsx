import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { STAGES, toCamelLabel } from "../stage-config";
import { getStageLabelI18n } from "../pipeline-i18n";
import { SETTINGS_STAGE_SLUGS } from "../settings-routing";
import {
  BookView,
  ExtractIndex,
  SectioningIndex,
  StoryboardIndex,
  QuizzesIndex,
  CaptionsIndex,
  GlossaryIndex,
  TocIndex,
  EasyReadIndex,
  LanguageIndex,
  SpeechIndex,
  SignLanguageLandingPage,
  PreviewView,
  ValidationView,
  ExportLandingPage,
} from "../stages";
import { cn } from "@/lib/utils";
import { Trans } from "@lingui/react/macro";
import { useWindowControls } from "@/hooks/use-window-controls";
import { usePlatform } from "@/hooks/use-platform";
import { LinuxControls } from "@/components/title-bar/LinuxControls";
import { WindowsControls } from "@/components/title-bar/WindowsControls";

// Context for views to inject content into the step header
interface StepHeaderControls {
  setExtra: (node: ReactNode) => void;
  setOnLabelClick: (handler: (() => void) | null) => void;
  /** DOM element for portal-based header injection (avoids setExtra re-render loops) */
  headerSlotEl: HTMLElement | null;
}
const StepHeaderContext = createContext<StepHeaderControls>({
  setExtra: () => {},
  setOnLabelClick: () => {},
  headerSlotEl: null,
});
export function useStepHeader() {
  return useContext(StepHeaderContext);
}

interface ViewProps {
  bookLabel: string;
  stageSlug?: string;
  selectedPageId?: string;
  onSelectPage?: (pageId: string | null) => void;
}

interface ViewEntry {
  component: React.ComponentType<ViewProps>;
  fullHeight?: boolean;
}


// TODO: Remove the fullHeight flag once we have a landing page for sectioning
const VIEW_MAP: Record<string, ViewEntry> = {
  book: { component: BookView },
  extract: { component: ExtractIndex, fullHeight: true },
  sectioning: { component: SectioningIndex, fullHeight: true },
  storyboard: { component: StoryboardIndex, fullHeight: true },
  quizzes: { component: QuizzesIndex, fullHeight: true },
  captions: { component: CaptionsIndex, fullHeight: true },
  glossary: { component: GlossaryIndex, fullHeight: true },
  toc: { component: TocIndex, fullHeight: true },
  "easy-read": { component: EasyReadIndex, fullHeight: true },
  translate: { component: LanguageIndex, fullHeight: true },
  speech: { component: SpeechIndex, fullHeight: true },
  "sign-language": { component: SignLanguageLandingPage, fullHeight: true },
  validation: { component: ValidationView, fullHeight: true },
  preview: { component: PreviewView, fullHeight: true },
  export: { component: ExportLandingPage, fullHeight: true },
};

export function StepViewRouter({
  step,
  bookLabel,
  selectedPageId,
  onSelectPage,
}: {
  step: string;
  bookLabel: string;
  selectedPageId?: string;
  onSelectPage?: (pageId: string | null) => void;
}) {
  const { available: hasWindows } = useWindowControls();
  const entry = VIEW_MAP[step];
  const stepConfig = STAGES.find((s) => s.slug === step);
  const [headerExtra, setHeaderExtra] = useState<ReactNode>(null);
  const [labelClickHandler, setLabelClickHandler] = useState<{
    fn: () => void;
  } | null>(null);
  const [headerSlotEl, setHeaderSlotEl] = useState<HTMLElement | null>(null);

  const platform = usePlatform();

  const setOnLabelClick = useCallback((handler: (() => void) | null) => {
    setLabelClickHandler(handler ? { fn: handler } : null);
  }, []);

  const controls: StepHeaderControls = {
    setExtra: setHeaderExtra,
    setOnLabelClick,
    headerSlotEl,
  };

  if (!entry || !stepConfig) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <Trans>Unknown step: {step}</Trans>
      </div>
    );
  }

  const View = entry.component;
  const Icon = stepConfig.icon;
  const stepLabel =
    step === "book" ? toCamelLabel(bookLabel) : getStageLabelI18n(step);

  return (
    <StepHeaderContext.Provider value={controls}>
      <div className="flex flex-col h-full">
        {/* Step header */}
        <div
          className={cn(
            "shrink-0 h-10 px-4 flex items-center gap-3 text-white drag-region",
            stepConfig.color,
            hasWindows && platform !== "macos" && "pr-0",
          )}
        >
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20">
            <Icon className="w-3 h-3" />
          </div>
          {labelClickHandler ? (
            <button
              type="button"
              onClick={labelClickHandler.fn}
              className="text-sm font-semibold hover:text-white/70 transition-colors"
            >
              {stepLabel}
            </button>
          ) : (
            <h2
              className={cn("text-sm font-semibold", !headerExtra && "mr-auto")}
            >
              {stepLabel}
            </h2>
          )}
          <div ref={setHeaderSlotEl} className="contents" />
          {headerExtra}
          {(SETTINGS_STAGE_SLUGS as readonly string[]).includes(step) && (
            <Link
              to="/books/$label/$step/settings"
              params={{ label: bookLabel, step }}
              search={{ tab: "general" }}
              className="ml-auto text-white/60 hover:text-white transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
            </Link>
          )}
          <LinuxControls className="self-stretch" />
          <WindowsControls variant="dark" className="self-stretch" />
        </div>

        {/* Step content */}
        {entry.fullHeight ? (
          <div className="flex flex-1 flex-col min-h-0 overflow-auto">
            <View
              bookLabel={bookLabel}
              stageSlug={step}
              selectedPageId={selectedPageId}
              onSelectPage={onSelectPage}
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col min-h-0 overflow-auto p-4">
            <View
              bookLabel={bookLabel}
              stageSlug={step}
              selectedPageId={selectedPageId}
              onSelectPage={onSelectPage}
            />
          </div>
        )}
      </div>
    </StepHeaderContext.Provider>
  );
}
