import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FileArchive, Settings } from "lucide-react";
import { STAGES, isImportedAdtStageAvailable, toCamelLabel } from "../stage-config";
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
import { StepHeaderBar } from "./StepHeaderBar";
import { useBook } from "@/hooks/use-books";
import {
  isImportedAdtUnavailableStage,
  type ImportedAdtUnavailableStage,
} from "@adt/types";

/** One entry per stage in `IMPORTED_ADT_UNAVAILABLE_STAGES`. The Record type is
 * exhaustive, so widening that set is a type error until copy is written. */
const IMPORTED_ADT_UNAVAILABLE_COPY: Record<
  ImportedAdtUnavailableStage,
  { title: ReactNode; body: ReactNode }
> = {
  extract: {
    title: <Trans>Extract starts from a source PDF</Trans>,
    body: (
      <Trans>This project was created from an exported ADT publication, so it does not include the source PDF. The imported HTML already contains the book content.</Trans>
    ),
  },
  sectioning: {
    title: <Trans>Sectioning starts from extracted PDF pages</Trans>,
    body: (
      <Trans>This project uses the published HTML as its page structure. The original PDF sections and extraction history are not available to rerun.</Trans>
    ),
  },
};

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
  const entry = VIEW_MAP[step];
  const stepConfig = STAGES.find((s) => s.slug === step);
  const { data: book } = useBook(bookLabel);
  const [headerExtra, setHeaderExtra] = useState<ReactNode>(null);
  const [labelClickHandler, setLabelClickHandler] = useState<{
    fn: () => void;
  } | null>(null);
  const [headerSlotEl, setHeaderSlotEl] = useState<HTMLElement | null>(null);

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
  const unavailableForImportedHtml = book?.workingSource === "imported-adt"
    && !isImportedAdtStageAvailable(stepConfig.slug);
  const unavailableCopy = isImportedAdtUnavailableStage(stepConfig.slug)
    ? IMPORTED_ADT_UNAVAILABLE_COPY[stepConfig.slug]
    : null;
  const stepLabel =
    step === "book" ? toCamelLabel(bookLabel) : getStageLabelI18n(step);

  return (
    <StepHeaderContext.Provider value={controls}>
      <div className="flex flex-col h-full">
        {/* Step header */}
        <StepHeaderBar color={stepConfig.color}>
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
          {!unavailableForImportedHtml && (SETTINGS_STAGE_SLUGS as readonly string[]).includes(step) && (
            <Link
              to="/books/$label/$step/settings"
              params={{ label: bookLabel, step }}
              search={{ tab: "general" }}
              className="ml-auto text-white/60 hover:text-white transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
            </Link>
          )}
        </StepHeaderBar>

        {/* Step content */}
        {unavailableForImportedHtml && unavailableCopy ? (
          <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50/40 p-6 sm:p-10">
            <section className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="px-6 py-6 sm:px-7 sm:py-7">
                <div className="flex items-start gap-4">
                  <span className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                    stepConfig.bgLight,
                    stepConfig.textColor,
                  )}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className={cn(
                      "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                      stepConfig.bgLight,
                      stepConfig.borderColor,
                      stepConfig.textColor,
                    )}>
                      <Trans>Not needed for this source</Trans>
                    </span>
                    <h3 className="mt-2.5 text-lg font-semibold tracking-tight text-slate-950">
                      {unavailableCopy.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {unavailableCopy.body}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <FileArchive className={cn("h-4 w-4", stepConfig.textColor)} />
                  <span><Trans>Working source: imported HTML</Trans></span>
                </div>
                <Link
                  to="/books/$label/$step"
                  params={{ label: bookLabel, step: "storyboard" }}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <Trans>Open Storyboard</Trans>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </section>
          </div>
        ) : entry.fullHeight ? (
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
