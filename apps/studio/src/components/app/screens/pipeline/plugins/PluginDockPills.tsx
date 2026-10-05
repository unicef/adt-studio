import { Fragment } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, ChevronDown, Clock, Loader2, Plus, TriangleAlert } from "lucide-react";
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
  groupDockEntries,
  stageDependsOn,
} from "@/components/app/screens/pipeline/shared/plugins";
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState";
import type { PluginDockProps } from "./PluginDock";

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
}: {
  item: DockItem;
  active: boolean;
  linked: boolean;
  onClick: () => void;
}) {
  const { t } = useLingui();
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
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative flex h-10 shrink-0 cursor-pointer items-center rounded-full px-2.5 text-white outline-border outline",
        active ? "w-36" : "w-10",
        !isDone ? "text-muted-foreground" : undefined,
        isDone && "outline-none",
      )}
      style={{
        background: !isDone ? "var(--muted)" : item.hex,
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
      {active && (
        <span className="min-w-0 flex-1 overflow-hidden">
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

export function PluginDockPills({
  foundations,
  plugins,
  activeSlug,
  onOpenPlugin,
  hint,
  onMinimize,
  minimized,
}: PluginDockProps) {
  const { t } = useLingui();
  const groups = groupDockEntries([...foundations, ...plugins]);

  return (
    <div
      inert={minimized}
      aria-hidden={minimized}
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
      <div
        className={cn(
          "flex px-2.5 items-center gap-2.5 rounded-full border bg-card py-2 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.35)] backdrop-blur-md",
        )}
      >
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
              />
            ))}
          </Fragment>
        ))}

        <span className="h-7 w-px shrink-0 bg-border" />

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
