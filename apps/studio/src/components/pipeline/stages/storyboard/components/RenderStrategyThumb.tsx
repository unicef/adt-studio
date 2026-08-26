import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export function StrategyThumbPaper({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "aspect-[3/4] w-full overflow-hidden rounded-sm border border-[#e5e5e5] bg-white p-2 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SingleColumnThumb() {
  return (
    <div className="flex h-full w-full flex-col gap-[3px]">
      <p className="text-[8px] font-semibold leading-tight text-neutral-800">
        <Trans>The Water Cycle</Trans>
      </p>
      <p className="text-[5.5px] uppercase tracking-wider leading-none text-neutral-400">
        <Trans>Chapter 3</Trans>
      </p>
      <div className="mt-[2px] flex h-7 w-full items-center justify-center overflow-hidden rounded-[1px] bg-gradient-to-br from-violet-200 via-violet-100 to-white">
        <div className="h-2 w-2 rounded-full bg-violet-300/70" />
      </div>
      <p className="mt-[1px] text-justify text-[5.5px] leading-[1.4] text-neutral-500">
        <Trans>
          Water moves continuously through evaporation, condensation, and
          precipitation. Most vapor returns to the oceans, while some falls
          on land as rain or snow before flowing back to the sea.
        </Trans>
      </p>
    </div>
  )
}

export function AiGeneratedThumb() {
  return (
    <div className="flex h-full w-full flex-col gap-1">
      <p className="text-[8px] font-semibold leading-tight text-neutral-800">
        <Trans>Volcanic Origins</Trans>
      </p>
      <div className="grid grid-cols-[1fr_1.1fr] gap-1">
        <p className="text-[5.5px] leading-[1.4] text-neutral-500">
          <Trans>
            Beneath Earth's crust, molten rock builds pressure over
            millennia until it finds a path to the surface.
          </Trans>
        </p>
        <div className="relative h-9 overflow-hidden rounded-[1px] bg-gradient-to-br from-violet-300 via-violet-400 to-violet-600">
          <div className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white/70" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent" />
        </div>
      </div>
      <div className="rounded-[1px] border-l-2 border-violet-400 bg-violet-50/80 px-1 py-[2px]">
        <p className="text-[6px] font-medium italic leading-[1.3] text-violet-700">
          <Trans>"A landscape forged by fire."</Trans>
        </p>
      </div>
      <p className="text-[5.5px] leading-[1.4] text-neutral-500">
        <Trans>Eruptions reshape entire regions in mere days.</Trans>
      </p>
    </div>
  )
}

export function DynamicOverlayThumb() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[1px]">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-700 via-violet-500 to-violet-300" />
      <div className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-white/60 blur-[1px]" />
      <div className="absolute left-2 top-3 h-[1px] w-[1px] rounded-full bg-white" />
      <div className="absolute right-3 top-2 h-[1px] w-[1px] rounded-full bg-white/80" />
      <div className="absolute left-3 top-5 h-[1px] w-[1px] rounded-full bg-white/70" />
      <div className="absolute inset-x-0 top-1/2 h-1/2 bg-gradient-to-b from-transparent to-black/25" />
      <div className="absolute inset-x-1.5 bottom-1.5 rounded-[2px] border border-white/40 bg-white/85 px-1.5 py-[5px] shadow-sm backdrop-blur-[1px]">
        <p className="text-[7px] font-semibold leading-tight text-neutral-800">
          <Trans>Among the Stars</Trans>
        </p>
        <p className="mt-[2px] text-[5.5px] leading-[1.35] text-neutral-500">
          <Trans>First images from the deep-field telescope.</Trans>
        </p>
      </div>
    </div>
  )
}

export function TwoColumnStoryThumb() {
  return (
    <div className="grid h-full w-full grid-cols-[1.05fr_1fr] gap-1">
      <div className="relative overflow-hidden rounded-[1px] bg-gradient-to-b from-violet-200 via-violet-100 to-violet-50">
        <div className="absolute right-1 top-1 h-2 w-2 rounded-full bg-violet-400/80" />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-violet-500/40 via-violet-300/25 to-transparent" />
        <div className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full bg-violet-500/70" />
        <div className="absolute bottom-1.5 left-2.5 h-2 w-1 rounded-full bg-violet-600/55" />
        <div className="absolute bottom-[3px] right-2 h-1.5 w-[3px] rounded-full bg-violet-700/55" />
      </div>
      <div className="flex flex-col gap-[3px] pt-[2px]">
        <p className="text-[7.5px] font-semibold leading-tight text-neutral-800">
          <Trans>The Lost Forest</Trans>
        </p>
        <p className="mt-[1px] text-[5.5px] leading-[1.4] text-neutral-500">
          <Trans>
            Lila wandered between the tall pines, her flashlight catching
            glimmers of gold among the leaves. The path narrowed, and the
            wind began to whisper her name.
          </Trans>
        </p>
      </div>
    </div>
  )
}

export function TwoColumnThumb() {
  return (
    <div className="flex h-full w-full flex-col gap-[3px]">
      <p className="text-[8px] font-semibold leading-tight text-neutral-800">
        <Trans>Rivers and Deltas</Trans>
      </p>
      <div className="mt-[1px] grid flex-1 grid-cols-2 gap-1.5">
        <div className="flex flex-col gap-[3px]">
          <div className="flex h-6 w-full items-center justify-center overflow-hidden rounded-[1px] bg-gradient-to-br from-violet-200 via-violet-100 to-white">
            <div className="h-1.5 w-1.5 rounded-full bg-violet-300/70" />
          </div>
          <p className="text-justify text-[5.5px] leading-[1.4] text-neutral-500">
            <Trans>
              Sediment carried downstream settles where the current slows,
              building fertile land at the river mouth.
            </Trans>
          </p>
        </div>
        <p className="text-justify text-[5.5px] leading-[1.4] text-neutral-500">
          <Trans>
            Over centuries these deposits form wide plains that shelter birds,
            fish, and the villages that farm them.
          </Trans>
        </p>
      </div>
    </div>
  )
}

export function FixedLayoutThumb() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[1px] bg-neutral-50 ring-1 ring-inset ring-neutral-200">
      <div className="absolute inset-1 flex flex-col gap-[3px]">
        <div className="h-[3px] w-3/5 rounded-full bg-neutral-400/70" />
        <div className="h-[2px] w-2/5 rounded-full bg-neutral-300" />
        <div className="mt-[2px] flex flex-1 gap-1">
          <div className="flex flex-1 flex-col gap-[2px]">
            <div className="h-[2px] w-full rounded-full bg-neutral-300" />
            <div className="h-[2px] w-11/12 rounded-full bg-neutral-300" />
            <div className="h-[2px] w-full rounded-full bg-neutral-300" />
            <div className="h-[2px] w-3/4 rounded-full bg-neutral-300" />
          </div>
          <div className="h-8 w-[42%] rounded-[1px] bg-gradient-to-br from-violet-200 to-violet-100" />
        </div>
        <div className="flex flex-col gap-[2px]">
          <div className="h-[2px] w-full rounded-full bg-neutral-300" />
          <div className="h-[2px] w-5/6 rounded-full bg-neutral-300" />
        </div>
      </div>
      <div className="absolute inset-0 border border-dashed border-violet-400/70" />
      <div className="absolute bottom-1 right-1 rounded-[2px] bg-violet-600/90 px-1 py-[1px] text-[4.5px] font-semibold uppercase tracking-wider text-white">
        <Trans>Original layout</Trans>
      </div>
    </div>
  )
}

const THUMBS_BY_STRATEGY: Record<string, () => ReactNode> = {
  llm: AiGeneratedThumb,
  "llm-overlay": DynamicOverlayThumb,
  one_column: SingleColumnThumb,
  two_column: TwoColumnThumb,
  two_column_story: TwoColumnStoryThumb,
  fixed_layout: FixedLayoutThumb,
}

export function RenderStrategyThumb({
  strategy,
  renderType,
}: {
  strategy: string
  renderType?: string
}) {
  const Thumb =
    THUMBS_BY_STRATEGY[strategy] ??
    (renderType === "llm" ? AiGeneratedThumb : SingleColumnThumb)
  return <Thumb />
}
