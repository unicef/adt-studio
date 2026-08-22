import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { ArrowRight, Check, HelpCircle, LayoutGrid, Network, Plus, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/app/ui/EmptyState"
import { cn } from "@/lib/utils"

type TrailState = "done" | "current" | "todo"

export type StoryboardPhase = "sections" | "render"

const TRAIL: { key: string; label: MessageDescriptor }[] = [
  { key: "extract", label: msg`Extraction` },
  { key: "sections", label: msg`Sections` },
  { key: "storyboard", label: msg`Storyboard` },
  { key: "plugins", label: msg`Plugins` },
]

const TRAIL_STATES: Record<StoryboardPhase, Record<string, TrailState>> = {
  sections: { extract: "done", sections: "current", storyboard: "todo", plugins: "todo" },
  render: { extract: "done", sections: "done", storyboard: "current", plugins: "todo" },
}

function GhostPage({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block h-[98px] w-[74px] rounded-md border bg-muted", className)} />
}

export interface StoryboardEmptyStateProps {
  phase: StoryboardPhase
  pageCount: number
  sectionCount: number
  onGenerate: () => void
  onCreateManually: () => void
  onOpenSettings: () => void
  canGenerate?: boolean
  disabledReason?: React.ReactNode
}

export function StoryboardEmptyState({
  phase,
  pageCount,
  sectionCount,
  onGenerate,
  onCreateManually,
  onOpenSettings,
  canGenerate = true,
  disabledReason,
}: StoryboardEmptyStateProps) {
  const { t, i18n } = useLingui()
  const states = TRAIL_STATES[phase]
  const readyToRender = phase === "render"

  return (
    <EmptyState
      className="w-[640px]"
      illustration={
        <div aria-hidden className="mb-6 flex items-end justify-center gap-2.5">
          <GhostPage className="-rotate-[4deg]" />
          <GhostPage />
          <GhostPage className="rotate-[3deg]" />
          <ArrowRight className="mb-10 size-4 text-muted-foreground" />
          <span className="grid h-[98px] w-[74px] place-items-center rounded-md border-[1.5px] border-dashed border-brand-200 bg-brand-50 text-brand-500">
            {readyToRender ? <LayoutGrid className="size-5" /> : <HelpCircle className="size-5" />}
          </span>
        </div>
      }
      title={
        readyToRender ? (
          <Trans>Everything is ready to build the storyboard</Trans>
        ) : (
          <Trans>The storyboard is still empty</Trans>
        )
      }
      description={
        readyToRender
          ? t`Extraction and sectioning are done — ${sectionCount} sections across ${pageCount} pages. Rendering turns them into the pages the reader will actually see.`
          : t`We already have the text and images from ${pageCount} pages. The next step is splitting the content into sections — that is where the accessible book begins.`
      }
    >
      <div className="flex w-full flex-col items-center gap-5">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            <Button onClick={onGenerate} disabled={!canGenerate}>
              {readyToRender ? <LayoutGrid className="size-3.5" /> : <Network className="size-3.5" />}
              {readyToRender ? <Trans>Run the storyboard</Trans> : <Trans>Generate sections</Trans>}
            </Button>
            {readyToRender ? (
              <Button variant="outline" onClick={onOpenSettings}>
                <Settings className="size-3.5" />
                <Trans>Storyboard settings</Trans>
              </Button>
            ) : (
              <Button variant="outline" onClick={onCreateManually}>
                <Plus className="size-3.5" />
                <Trans>Create a section manually</Trans>
              </Button>
            )}
          </div>
          {!canGenerate && disabledReason && (
            <p className="text-[11.5px] text-muted-foreground">{disabledReason}</p>
          )}
        </div>

        <ol className="flex w-full items-center justify-center gap-3.5 border-t pt-4">
          {TRAIL.map((step, index) => {
            const state = states[step.key]
            return (
              <li key={step.key} className="flex items-center gap-3.5">
                {index > 0 && <span aria-hidden className="h-px w-6 bg-border" />}
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-xs",
                    state === "done" && "text-emerald-600",
                    state === "current" && "font-semibold text-brand-700",
                    state === "todo" && "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-4 place-items-center rounded-full",
                      state === "done" && "bg-emerald-500 text-white",
                      state === "current" && "border-2 border-brand-600",
                      state === "todo" && "border-[1.5px] border-border",
                    )}
                  >
                    {state === "done" && <Check className="size-2.5" strokeWidth={4} />}
                  </span>
                  {i18n._(step.label)}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </EmptyState>
  )
}
