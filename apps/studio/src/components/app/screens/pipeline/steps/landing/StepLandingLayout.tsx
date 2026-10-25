import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface StepLandingLayoutProps {
  heading: ReactNode
  notices?: ReactNode
  settings: ReactNode
  beforeRun?: ReactNode
  action: ReactNode
  reason?: ReactNode
  advanced?: ReactNode
  preview: ReactNode
  canvas?: ReactNode
}

function Lead({ heading, notices, action, advanced, reason }: Pick<StepLandingLayoutProps, "heading" | "notices" | "action" | "advanced" | "reason">) {
  return (
    <>
      {heading}
      {notices}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {action}
        {advanced}
      </div>
      {reason}
    </>
  )
}

const FLAT_SETTINGS = cn(
  "gap-0! [&_[data-settings-card]]:rounded-none [&_[data-settings-card]]:border-0 [&_[data-settings-card]]:border-b [&_[data-settings-card]]:bg-transparent [&_[data-settings-card]]:px-0 [&_[data-settings-card]]:py-5 [&_[data-settings-card]]:shadow-none [&_[data-settings-card]:hover]:bg-transparent [&_[data-settings-card]:last-child]:border-b-0",
)

export function StepLandingLayout(props: StepLandingLayoutProps) {
  const { heading, notices, settings, beforeRun, action, reason, advanced, preview, canvas } = props
  const lead = <Lead heading={heading} notices={notices} action={action} advanced={advanced} reason={reason} />

  if (canvas)
    return (
      <div className="relative h-full w-full overflow-hidden animate-in fade-in duration-300 motion-reduce:animate-none">
        {canvas}
        <aside className="absolute inset-y-0 left-0 flex w-[min(480px,42%)] flex-col overflow-hidden border-r bg-card">
          <div className="flex shrink-0 flex-col gap-4 border-b px-7 pt-7 pb-5">{lead}</div>
          <div className={cn("flex flex-1 flex-col overflow-y-auto px-7 pt-5 pb-28", FLAT_SETTINGS)}>
            {settings}
            {beforeRun}
          </div>
        </aside>
      </div>
    )

  return (
    <div className="@container/landing-layout flex h-full min-h-[520px] w-full animate-in fade-in duration-300 motion-reduce:animate-none">
      <aside className="flex w-full shrink-0 flex-col overflow-hidden @[1000px]/landing-layout:w-[560px] @[1000px]/landing-layout:border-r">
        <div className="flex shrink-0 flex-col gap-4 border-b px-8 pt-8 pb-5">{lead}</div>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-8 pt-6 pb-28">
          {settings}
          {beforeRun}
        </div>
      </aside>
      <div className="hidden min-w-0 flex-1 items-center justify-center overflow-hidden px-8 pt-8 pb-28 @[1000px]/landing-layout:flex">
        <div className="aspect-[650/812] h-full max-h-[700px] max-w-full shrink-0">{preview}</div>
      </div>
    </div>
  )
}
