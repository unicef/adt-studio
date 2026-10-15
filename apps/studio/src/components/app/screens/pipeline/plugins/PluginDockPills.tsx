import { Fragment, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, ChevronDown, Clock, LayoutGrid, Loader2, Plus, TriangleAlert } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getStageLabelI18n,
  getStageDescriptionI18n,
  getStageGroupLabelI18n,
} from "@/components/pipeline/pipeline-i18n";
import { cn } from "@/lib/utils";
import {
  DOCK_GROUP_ORDER,
  STORYBOARD_HEX,
  groupDockEntries,
  stageDependsOn,
} from "@/components/app/screens/pipeline/shared/plugins";
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState";
import type { PluginDockProps } from "./PluginDock";
import { AddOutputsPopover } from "./AddOutputsPopover";
import { useVariant } from "@/components/app/lab/variants";
import { markJustAdded, useAddedOutputs, useNeedsDismissed, wasJustAdded } from "@/components/app/lab/outputs";
import { ReaderNeedsCard } from "./ReaderNeedsCard";
import { outputName } from "./AddOutputsPopover";
import { isHiddenByJourney } from "@/components/app/lab/simulate";
import { toast } from "@/components/ui/sonner";
import { useBookRun } from "@/hooks/use-book-run";
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation";
import { DockLeading } from "./dock/DockLeading";
import { NextStepCard } from "./NextStepCue";
import { useContentFlow, useFlowCopy, useNextSuggestion } from "@/components/app/screens/pipeline/shared/contentFlow";

const PRESENT_STATES = new Set<DockItem["state"]>(["done", "running", "queued", "error"]);

const badgeClassName =
  "absolute right-0 -top-1 grid size-5 place-items-center rounded-full border-2 border-card text-white";

function StateBadge({ state }: { state: DockItem["state"] }) {
  const { t } = useLingui();
  switch (state) {
    case "running":
      return (
        <span className={cn(badgeClassName, "bg-sky-500")} title={t`Running`}>
          <Loader2 className="size-3 animate-spin motion-reduce:animate-none" strokeWidth={3} />
        </span>
      );
    case "queued":
      return (
        <span className={cn(badgeClassName, "bg-amber-500")} title={t`Queued`}>
          <Clock className="size-3" strokeWidth={3} />
        </span>
      );
    case "error":
      return (
        <span className={cn(badgeClassName, "bg-destructive")} title={t`Failed`}>
          <TriangleAlert className="size-3" strokeWidth={3} />
        </span>
      );
    default:
      return null;
  }
}

function DockPill({
  item,
  active,
  linked,
  onClick,
  wasAdded = false,
  hoverLabel = false,
}: {
  item: DockItem;
  active: boolean;
  linked: boolean;
  onClick: () => void;
  wasAdded?: boolean;
  hoverLabel?: boolean;
}) {
  const { t } = useLingui();
  const wide = active;
  const isDone = item.state === "done";
  const name = getStageLabelI18n(item.slug);
  const blockedHint = item.lockedBy
    ? t`Run ${getStageLabelI18n(item.lockedBy)} first`
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      title={blockedHint ?? getStageDescriptionI18n(item.slug) ?? name}
      aria-label={name}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group/pill relative flex h-10 shrink-0 cursor-pointer items-center rounded-full px-2.5 text-white outline-border outline",
        wasJustAdded(item.slug) && "animate-in zoom-in-50 fade-in duration-500 ring-4 ring-brand-400/40",
        wide ? "w-36" : "w-10",
        !isDone ? "text-muted-foreground" : undefined,
        isDone && "outline-none",
      )}
      style={{
        ...(!isDone && wasAdded
          ? { background: "var(--card)", color: item.hex, outlineColor: item.hex }
          : { background: !isDone ? "var(--muted)" : item.hex }),
      }}
    >
      {linked && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-2.5 top-1/2 h-0.5 w-2.5 -translate-y-1/2 bg-border"
        />
      )}
      <span className="grid size-5 shrink-0 place-items-center">
        <item.icon
          className="size-[18px] text-current"
          strokeWidth={2.4}
        />
      </span>
      {hoverLabel && !active && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-[opacity,translate] duration-200 ease-out group-hover/pill:translate-y-0 group-hover/pill:opacity-100 group-focus-visible/pill:translate-y-0 group-focus-visible/pill:opacity-100 motion-reduce:transition-none"
        >
          {name}
        </span>
      )}
      {wide && (
        <span className="min-w-0 flex-1 overflow-hidden animate-in fade-in duration-300 motion-reduce:animate-none">
          <span className="block truncate px-1 text-center text-[13px] font-semibold text-current">
            {name}
          </span>
        </span>
      )}
      {isDone && item.pending === 0 && (
        <span className={cn(badgeClassName, "bg-emerald-500")}>
          <Check className="size-1.5" strokeWidth={5} />
        </span>
      )}
      {item.pending === 0 && <StateBadge state={item.state} />}
      {item.pending > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-card bg-foreground px-1 text-[10px] font-bold text-background">
          {item.pending}
        </span>
      )}
    </button>
  );
}

function StoryboardPill({
  active,
  locked,
  onClick,
  hoverLabel,
}: {
  active: boolean;
  locked: boolean;
  onClick: () => void;
  hoverLabel: boolean;
}) {
  const { t } = useLingui();
  const name = t`Storyboard`;
  return (
    <button
      type="button"
      onClick={active || locked ? undefined : onClick}
      aria-label={name}
      aria-current={active ? "page" : undefined}
      aria-disabled={locked || undefined}
      title={locked ? t`The storyboard opens once setup is done` : active ? undefined : t`Back to the storyboard`}
      className={cn(
        "group/pill relative flex h-10 shrink-0 items-center rounded-full px-2.5 text-white transition-[width] duration-300 ease-out motion-reduce:transition-none",
        active ? "w-36 cursor-default" : "w-10 cursor-pointer",
        locked && "cursor-not-allowed bg-muted text-muted-foreground outline outline-border",
      )}
      style={{ background: locked ? undefined : STORYBOARD_HEX }}
    >
      {hoverLabel && !active && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-[opacity,translate] duration-200 ease-out group-hover/pill:translate-y-0 group-hover/pill:opacity-100 group-focus-visible/pill:translate-y-0 group-focus-visible/pill:opacity-100 motion-reduce:transition-none"
        >
          {name}
        </span>
      )}
      <span className="grid size-5 shrink-0 place-items-center">
        <LayoutGrid className="size-[18px]" strokeWidth={2.4} />
      </span>
      {active && (
        <span className="min-w-0 flex-1 overflow-hidden animate-in fade-in duration-300 motion-reduce:animate-none">
          <span className="block truncate px-1 text-center text-[13px] font-semibold">{name}</span>
        </span>
      )}
    </button>
  );
}

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
  const { t, i18n } = useLingui();
  const featuresVariant = useVariant("features");
  const featuresMode = featuresVariant !== "current" && !!bookLabel;
  const suggestedMode = featuresVariant === "suggested";
  const [needsDismissed, dismissNeeds, undismissNeeds] = useNeedsDismissed(bookLabel ?? "");
  const [outputsOpen, setOutputsOpen] = useState(false);
  const [added, addOutput, removeOutput] = useAddedOutputs(bookLabel ?? "");
  const { stageState } = useBookRun();
  const hoverLabels = useVariant("docklabels") === "hover";
  const nav = usePipelineNavigation(bookLabel ?? "");
  const storyboard = {
    active: onStoryboard,
    locked: stageState("sectioning") !== "done",
    state: stageState("storyboard"),
    onClick: nav.openWorkspace,
  };
  const setupDone = foundations.every((item) => item.state === "done") && stageState("storyboard") === "done";
  const present = (item: DockItem) =>
    item.slug === activeSlug ||
    (PRESENT_STATES.has(item.state) && !isHiddenByJourney(item.slug));
  const shownPlugins = featuresMode ? plugins.filter(present) : plugins;
  const available = featuresMode ? plugins.filter((item) => !present(item)) : [];
  const groups = groupDockEntries([...foundations, ...shownPlugins]);
  const dockStyle = useVariant("dockstyle");
  const nextCue = useVariant("nextcue");
  const dockLayout = useVariant("docklayout");
  const hoverStyle = useVariant("hoverstyle");
  const dockOrder = useVariant("dockorder");
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

  if (dockStyle === "leading") {
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
        {nextCue === "card" && dockLayout !== "flat" && next && onStoryboard && (
          <NextStepCard
            next={next}
            item={plugins.find((candidate) => candidate.slug === next.slug)}
            onOpen={() => onOpenPlugin(next.slug)}
            onSkip={() => skip(next.key)}
          />
        )}
        <DockLeading
          layout={dockLayout}
          hoverStyle={hoverStyle}
          next={next}
          cue={nextCue}
          order={dockOrder}
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

  return (
    <div
      inert={minimized}
      aria-hidden={minimized}
      data-pipeline-dock={minimized ? "hidden" : "shown"}
      style={{ viewTransitionName: "step-dock" }}
      className={cn(
        "fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2 transition-[translate,opacity] duration-300 ease-out motion-reduce:transition-none",
        minimized
          ? "pointer-events-none translate-y-[calc(100%+1.5rem)] opacity-0"
          : "translate-y-0 opacity-100",
      )}
    >
      {hint && (
        <div className="rounded-full border bg-card px-3 py-1 text-[10.5px] text-muted-foreground">
          {hint}
        </div>
      )}
      {suggestedMode && setupDone && shownPlugins.length === 0 && !needsDismissed && !activeSlug && (
        <ReaderNeedsCard
          hidden={outputsOpen}
          available={available}
          onDismiss={dismissNeeds}
          onAddMany={(slugs) => {
            const extra = slugs.flatMap((slug) => {
              const item = plugins.find((candidate) => candidate.slug === slug);
              const needs = item?.lockedBy ? plugins.find((candidate) => candidate.slug === item.lockedBy) : undefined;
              return needs && !present(needs) && !slugs.includes(needs.slug) ? [{ slug: needs.slug, for: slug }] : [];
            });
            for (const slug of [...extra.map((entry) => entry.slug), ...slugs]) {
              addOutput(slug);
              markJustAdded(slug);
            }
            dismissNeeds();
            const names = [...slugs, ...extra.map((entry) => entry.slug)].map((slug) => outputName(slug, i18n)).join(", ");
            toast.success(t`Added ${names} — open each one in the dock to set it up.`, {
              description: extra[0]
                ? extra[0].slug === "translate"
                  ? t`${outputName(extra[0].slug, i18n)} came along — ${outputName(extra[0].for, i18n)} uses it to know which language to speak.`
                  : t`${outputName(extra[0].slug, i18n)} came along — ${outputName(extra[0].for, i18n)} uses it.`
                : undefined,
            });
          }}
        />
      )}
      <div
        className={cn(
          "relative flex px-2.5 items-center gap-2.5 rounded-full border bg-card py-2 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.35)] backdrop-blur-md",
        )}
      >
        <StoryboardPill active={storyboard.active} locked={storyboard.locked} onClick={storyboard.onClick} hoverLabel={hoverLabels} />
        <span className="h-7 w-px shrink-0 bg-border" />
        {groups.map((group, groupIndex) => (
          <Fragment key={group.key}>
            {groupIndex > 0 && <span className="h-7 w-px shrink-0 bg-border" />}
            {group.items.map((item, index) => (
              <DockPill
                key={item.slug}
                item={item}
                active={activeSlug === item.slug}
                linked={
                  index > 0 &&
                  stageDependsOn(item.slug, group.items[index - 1].slug)
                }
                onClick={() => onOpenPlugin(item.slug)}
                wasAdded={featuresMode && added.includes(item.slug)}
                hoverLabel={hoverLabels}
              />
            ))}
          </Fragment>
        ))}

        <span className="h-7 w-px shrink-0 bg-border" />

        {featuresMode ? (
          <AddOutputsPopover
            suggested={suggestedMode}
            onOpenChange={setOutputsOpen}
            onShowSuggestions={
              suggestedMode && setupDone && shownPlugins.length === 0 && needsDismissed ? undismissNeeds : undefined
            }
            available={available}
            removable={shownPlugins.filter((item) => added.includes(item.slug) && !PRESENT_STATES.has(item.state))}
            emphasize={setupDone && shownPlugins.length === 0}
            onRemove={(slug) => {
              const dependents = plugins.filter(
                (candidate) => candidate.lockedBy === slug && added.includes(candidate.slug) && !PRESENT_STATES.has(candidate.state),
              );
              for (const dependent of dependents) removeOutput(dependent.slug);
              removeOutput(slug);
              if (dependents.length > 0) {
                toast.message(t`Removed ${dependents.map((dependent) => getStageLabelI18n(dependent.slug)).join(", ")} too — it uses ${getStageLabelI18n(slug)}.`);
              }
            }}
            onAdd={addAndOpen}
          />
        ) : (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={t`All plugins`}
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
            >
              <Plus className="size-[18px]" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-[300px] p-1.5">
            {groups.map((group) => (
              <div key={group.key}>
                <div className="px-2 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                  {getStageGroupLabelI18n(group.key)}
                </div>
                {group.items.map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => onOpenPlugin(item.slug)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted",
                      item.state === "locked" && "opacity-55",
                    )}
                  >
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full text-white"
                      style={{ background: item.hex }}
                    >
                      <item.icon className="size-3.5" strokeWidth={2.4} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                      {getStageLabelI18n(item.slug)}
                    </span>
                    {item.state === "done" && (
                      <span className="shrink-0 text-[10px] font-medium text-emerald-600">
                        <Trans>done</Trans>
                      </span>
                    )}
                    {item.state === "running" && (
                      <span className="shrink-0 text-[10px] font-medium text-sky-600">
                        <Trans>running</Trans>
                      </span>
                    )}
                    {item.state === "queued" && (
                      <span className="shrink-0 text-[10px] font-medium text-amber-600">
                        <Trans>queued</Trans>
                      </span>
                    )}
                    {item.state === "error" && (
                      <span className="shrink-0 text-[10px] font-medium text-destructive">
                        <Trans>failed</Trans>
                      </span>
                    )}
                    {item.state === "locked" && (
                      <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                        {item.lockedBy
                          ? t`needs ${getStageLabelI18n(item.lockedBy)}`
                          : t`locked`}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </PopoverContent>
        </Popover>
        )}

        {onMinimize && (
          <button
            type="button"
            onClick={onMinimize}
            title={t`Minimize the dock`}
            aria-label={t`Minimize the dock`}
            className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className="size-[18px]" />
          </button>
        )}
      </div>
    </div>
  );
}
