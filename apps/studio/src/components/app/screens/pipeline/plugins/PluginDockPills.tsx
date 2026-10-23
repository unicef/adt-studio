import { cn } from "@/lib/utils";
import { DOCK_GROUP_ORDER } from "@/components/app/screens/pipeline/shared/plugins";
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState";
import type { PluginDockProps } from "./PluginDock";
import { useVariant } from "@/components/app/lab/variants";
import { markJustAdded } from "@/components/app/lab/outputs";
import { isHiddenByJourney } from "@/components/app/lab/simulate";
import { useBookRun } from "@/hooks/use-book-run";
import { usePages } from "@/hooks/use-pages";
import { getBookCoverUrl } from "@/api/client";
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation";
import { DockLeading } from "./dock/DockLeading";
import type { StoryboardStatus } from "./dock/StoryboardEntry";
import { useContentFlow, useFlowCopy, useNextSuggestion } from "@/components/app/screens/pipeline/shared/contentFlow";

const PRESENT_STATES = new Set<DockItem["state"]>(["done", "running", "queued", "error"]);

export function PluginDockPills({
  foundations,
  plugins,
  activeSlug,
  onOpenPlugin,
  hint,
  onMinimize,
  minimized,
  bookLabel,
  onStoryboard = false,
}: PluginDockProps) {
  const featuresMode = useVariant("features") !== "current" && !!bookLabel;
  const { stageState } = useBookRun();
  const nav = usePipelineNavigation(bookLabel ?? "");
  const sbSim = useVariant("sbsim");
  const simulating = !!bookLabel?.startsWith("lab-") && sbSim !== "real";
  const boardState = stageState("storyboard");
  const pages = usePages(bookLabel ?? "");
  const storyboard = {
    active: onStoryboard,
    locked: stageState("sectioning") !== "done",
    done: boardState === "done" && !(simulating && sbSim === "building"),
    state: boardState,
    status: (simulating && sbSim !== "setupfail"
      ? sbSim
      : boardState === "running" || boardState === "queued"
        ? "building"
        : boardState === "error"
          ? "failed"
          : "ready") as StoryboardStatus,
    setupProblem: (simulating && sbSim === "setupfail") || foundations.some((item) => item.state === "error"),
    onClick: nav.openWorkspace,
    pageCount: pages.data?.length,
    coverUrl: bookLabel ? getBookCoverUrl(bookLabel) : undefined,
  };
  const present = (item: DockItem) =>
    item.slug === activeSlug ||
    (PRESENT_STATES.has(item.state) && !isHiddenByJourney(item.slug));
  const shownPlugins = featuresMode ? plugins.filter(present) : plugins;
  const available = featuresMode ? plugins.filter((item) => !present(item)) : [];
  const dockLayout = useVariant("docklayout");
  const dockPin = useVariant("dockpin") === "on";
  const flow = useContentFlow(bookLabel ?? "");
  const flowCopy = useFlowCopy();
  const { next, skip } = useNextSuggestion(bookLabel ?? "");
  const notices: Partial<Record<string, string>> = flow.unfinished.length > 0
    ? { translate: flowCopy.waitFor(flow.unfinished), speech: flowCopy.waitFor(flow.unfinished) }
    : flow.outOfDate
      ? { translate: flowCopy.outOfDate(flow.outOfDate) }
      : {};
  const addAndOpen = (slug: string) => {
    markJustAdded(slug);
    onOpenPlugin(slug);
  };
  const everything = [...foundations, ...shownPlugins];
  const tabGroups = DOCK_GROUP_ORDER.map((key) => ({ key, items: everything.filter((item) => item.group === key) }));

  return (
    <div
      inert={minimized}
      aria-hidden={minimized}
      data-pipeline-dock={minimized ? "hidden" : "shown"}
      style={{ viewTransitionName: "step-dock" }}
      className={cn(
        "fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2 transition-[translate,opacity] duration-300 ease-out motion-reduce:transition-none",
        minimized ? "pointer-events-none translate-y-[calc(100%+1.5rem)] opacity-0" : "translate-y-0 opacity-100",
      )}
    >
      {hint && <div className="rounded-full border bg-card px-3 py-1 text-[10.5px] text-muted-foreground">{hint}</div>}
      <DockLeading
        layout={dockLayout}
        pinned={dockPin}
        next={next}
        notices={notices}
        attention={flow.outOfDate ? ["translate"] : []}
        onSkipNext={skip}
        book={bookLabel ?? ""}
        groups={tabGroups}
        available={available}
        activeSlug={activeSlug}
        storyboard={storyboard}
        onOpen={onOpenPlugin}
        onAdd={featuresMode ? addAndOpen : undefined}
        onMinimize={onMinimize}
      />
    </div>
  );
}
