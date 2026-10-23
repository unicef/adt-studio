import type { ReactNode } from "react"

export interface StepLandingLayoutProps {
  heading: ReactNode
  notices?: ReactNode
  settings: ReactNode
  beforeRun?: ReactNode
  action: ReactNode
  reason?: ReactNode
  advanced?: ReactNode
  preview: ReactNode
}

export function StepLandingLayout({ heading, notices, settings, beforeRun, action, reason, advanced, preview }: StepLandingLayoutProps) {
  return (
    <div className="@container/landing-layout flex h-full min-h-[520px] w-full animate-in fade-in duration-300 motion-reduce:animate-none">
      <aside className="flex w-full shrink-0 flex-col overflow-hidden @[1000px]/landing-layout:w-[560px] @[1000px]/landing-layout:border-r">
        <div className="flex shrink-0 flex-col gap-4 border-b px-8 pt-8 pb-5">
          {heading}
          {notices}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {action}
            {advanced}
          </div>
          {reason}
        </div>
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
