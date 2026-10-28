import { AlertTriangle } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"
import { StageRerunButton } from "@/components/app/screens/pipeline/runs/StageRerunButton"
import type { StageRerun } from "@/components/app/screens/pipeline/runs/useStageRerun"
import { useCanvasEditing } from "../editing/CanvasEditing"
import { useStoryboardTools } from "../tools/StoryboardToolsContext"

export interface StaleNoticeProps {
  rerun: StageRerun
  outdatedCount: number
}

const amberSurface =
  "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-100"

function useCountLabel(count: number) {
  const { t } = useLingui()
  if (count === 0) return t`Pages out of date`
  return t`${plural(count, { one: "# page out of date", other: "# pages out of date" })}`
}

export function StalePill({ rerun, outdatedCount }: StaleNoticeProps) {
  const { dirty, saving } = useCanvasEditing()
  const tools = useStoryboardTools()
  const label = useCountLabel(outdatedCount)
  const lift = (tools?.htmlVisible ? tools.htmlHeight + 12 : 0) + (dirty || saving ? 48 : 0)
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30 flex justify-center transition-[bottom] duration-300 ease-out animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none motion-reduce:transition-none"
      style={{ bottom: 104 + lift }}
    >
      <div
        role="status"
        className={cn(
          "pointer-events-auto flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border py-1 pl-3 pr-1 text-[12px] shadow-[0_14px_36px_-16px_rgba(0,0,0,0.45)] backdrop-blur-md",
          amberSurface,
        )}
      >
        <AlertTriangle className="size-3.5 shrink-0" />
        <span className="shrink-0 font-semibold">{label}</span>
        <span className="min-w-0 truncate opacity-80 max-lg:hidden">
          <Trans>Sectioning changed after they were built</Trans>
        </span>
        <StageRerunButton slug="storyboard" rerun={rerun} variant="banner" />
      </div>
    </div>
  )
}

export function StaleRailNotice({ rerun, outdatedCount }: StaleNoticeProps) {
  const label = useCountLabel(outdatedCount)
  return (
    <div
      role="status"
      className={cn(
        "mx-2.5 mt-2 flex shrink-0 flex-col gap-2 rounded-lg border p-2.5 animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none",
        amberSurface,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[12.5px] font-semibold">{label}</span>
          <span className="text-[11.5px] leading-snug opacity-80">
            <Trans>Sectioning changed after they were built. They're marked in the list below.</Trans>
          </span>
        </div>
      </div>
      <div className="flex justify-end">
        <StageRerunButton slug="storyboard" rerun={rerun} variant="banner" />
      </div>
    </div>
  )
}

export function StalePageNotice({ rerun, outdatedCount, pageOutdated }: StaleNoticeProps & { pageOutdated: boolean }) {
  const label = useCountLabel(outdatedCount)
  return (
    <div
      role="status"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-1.5 text-[12px] animate-in fade-in duration-200 motion-reduce:animate-none",
        amberSurface,
      )}
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 leading-snug">
        {pageOutdated ? (
          <Trans>This page is out of date: sectioning changed after it was built.</Trans>
        ) : (
          <>
            <span className="font-semibold">{label}</span>
            <span className="opacity-80">
              {" · "}
              <Trans>Sectioning changed after they were built.</Trans>
            </span>
          </>
        )}
      </span>
      <StageRerunButton slug="storyboard" rerun={rerun} variant="banner" />
    </div>
  )
}

export function StaleTopChip({ rerun, outdatedCount }: StaleNoticeProps) {
  const label = useCountLabel(outdatedCount)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={NO_DRAG_REGION}
          className="ml-1 flex items-center gap-1 rounded-full bg-amber-100 px-2 font-medium text-amber-800 transition-colors duration-150 hover:bg-amber-200 data-[state=open]:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25 dark:data-[state=open]:bg-amber-500/25"
        >
          <AlertTriangle className="size-3 shrink-0" />
          <Trans>Out of date</Trans>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={10} className="flex w-80 flex-col gap-3 p-3.5">
        <div className="flex items-start gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <AlertTriangle className="size-3.5" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-semibold">{label}</span>
            <span className="text-[12px] leading-snug text-muted-foreground">
              <Trans>Sectioning changed after these pages were built. Re-run Storyboard to rebuild them.</Trans>
            </span>
          </div>
        </div>
        <div className="flex justify-end">
          <StageRerunButton slug="storyboard" rerun={rerun} variant="topbar" />
        </div>
      </PopoverContent>
    </Popover>
  )
}
