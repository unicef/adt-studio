import { useEffect, useState } from "react"
import { ReaderBar } from "../../../decide/examples"
import { cn } from "@/lib/utils"
import type { Look } from "../useSetup"
import { ActivityCard, FigureMark, HeadingBar, Lines, Part, Pic, WordBox } from "./marks"
import { useArtBox } from "./useArtBox"

export type Device = "desktop" | "phone"
/** What the screen shows: a render strategy, or the page as printed while the look isn't known yet. */
export type Shown = Pick<Look, "sectioningMode" | "activitiesGenerator" | "figureExtraction"> & { renderStrategy: Look["renderStrategy"] | "raw" }

/** The "real" screen each preview is drawn at, then scaled into its frame (the reader's bar included). */
export const SCREEN: Record<Device, { w: number; h: number; bar: number }> = { desktop: { w: 1024, h: 640, bar: 44 }, phone: { w: 390, h: 800, bar: 52 } }

const ratios = new Map<string, number>()

/** Width ÷ height of a page image, once it has loaded. */
function useRatio(src?: string): number {
  const [ratio, setRatio] = useState(() => (src ? ratios.get(src) ?? 0.72 : 0.72))
  useEffect(() => {
    if (!src) return
    const known = ratios.get(src)
    if (known) return setRatio(known)
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      const r = img.naturalWidth / img.naturalHeight
      ratios.set(src, r)
      if (!cancelled) setRatio(r)
    }
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src])
  return ratio
}

/** The printed page(s), as big as fits the screen: one page, or two facing pages joined at the fold. */
function Printed({ srcs, area, figures, children }: { srcs: (string | undefined)[]; area: { w: number; h: number }; figures?: boolean; children?: React.ReactNode }) {
  const first = useRatio(srcs[0])
  const second = useRatio(srcs[1])
  const total = srcs.length === 2 ? first + second : first
  const w = Math.min(area.w, area.h * total)
  const h = w / total
  const box = useArtBox(srcs[0])
  return (
    <div className="relative flex shrink-0 shadow-[0_10px_30px_-10px_rgba(15,23,42,0.45)]" style={{ width: w, height: h }}>
      {srcs.map((src, i) => (
        <div key={i} className="relative h-full bg-white" style={{ width: srcs.length === 2 ? (h * (i === 0 ? first : second)) : w }}>
          {src ? <img src={src} alt="" className="absolute inset-0 size-full" /> : <span className="absolute inset-0 animate-pulse bg-slate-200 motion-reduce:animate-none" />}
          {figures && i === 0 && <FigureMark box={box} />}
        </div>
      ))}
      {srcs.length === 2 && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-10 -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(15,23,42,0.18)_48%,rgba(15,23,42,0.28)_50%,rgba(15,23,42,0.18)_52%,transparent)]" style={{ left: srcs.length === 2 ? h * first : undefined }} />}
      {children}
    </div>
  )
}

function Body({ shown, device, srcs }: { shown: Shown; device: Device; srcs: (string | undefined)[] }) {
  const phone = device === "phone"
  const s = SCREEN[device]
  const area = { w: s.w, h: s.h - s.bar }
  const split = shown.sectioningMode === "dynamic"
  const act = shown.activitiesGenerator
  const fig = shown.figureExtraction === "auto"

  if (shown.renderStrategy === "raw" || shown.renderStrategy === "fixed_layout")
    return (
      <div className={cn("grid size-full place-items-center", phone ? "bg-white" : "bg-slate-100")}>
        <Part n={1} on={split && shown.renderStrategy !== "raw"}>
          <Printed srcs={srcs} area={{ w: area.w - (phone ? 16 : 48), h: area.h - (phone ? 16 : 40) }} figures={fig && shown.renderStrategy !== "raw"} />
        </Part>
      </div>
    )

  if (shown.renderStrategy === "llm-overlay")
    return phone ? (
      <div className="flex size-full flex-col bg-[#fffaf2]">
        <div className="grid h-[42%] shrink-0 place-items-center bg-slate-100">
          <Printed srcs={srcs} area={{ w: area.w - 16, h: area.h * 0.42 - 16 }} figures={fig} />
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <Part n={1} on={split}>
            <WordBox />
          </Part>
          {act ? (
            <Part n={2} on={split}>
              <ActivityCard compact />
            </Part>
          ) : (
            <WordBox lines={3} />
          )}
        </div>
      </div>
    ) : (
      <div className="grid size-full place-items-center bg-slate-100">
        <Printed srcs={srcs} area={{ w: area.w - 48, h: area.h - 40 }} figures={fig}>
          <Part n={1} on={split} className="absolute left-[6%] top-[7%] w-[44%] max-w-[380px]">
            <WordBox />
          </Part>
          {act ? (
            <Part n={2} on={split} className="absolute bottom-[6%] right-[5%] w-[56%] max-w-[480px]">
              <ActivityCard />
            </Part>
          ) : (
            <WordBox className="absolute bottom-[7%] right-[6%] w-[44%] max-w-[380px]" lines={3} />
          )}
        </Printed>
      </div>
    )

  if (shown.renderStrategy === "two_column_story")
    return phone ? (
      <div className="flex size-full flex-col gap-6 bg-[#FFFAF5] p-5">
        <Part n={1} on={split}>
          <Pic srcs={srcs} figures={fig} className="aspect-[4/3] w-full rounded-[16px]" />
        </Part>
        <Lines n={4} big center />
        {act && (
          <Part n={2} on={split}>
            <ActivityCard compact />
          </Part>
        )}
      </div>
    ) : (
      <div className="grid size-full grid-cols-[1.15fr_1fr] items-center gap-12 bg-[#FFFAF5] p-12">
        <Part n={1} on={split} className="h-full">
          <Pic srcs={srcs} figures={fig} className="h-full w-full rounded-[18px]" />
        </Part>
        <div className="flex flex-col gap-8">
          <Lines n={act ? 3 : 5} big />
          {act && (
            <Part n={2} on={split}>
              <ActivityCard compact />
            </Part>
          )}
        </div>
      </div>
    )

  if (shown.renderStrategy === "single_column")
    return phone ? (
      <div className="flex size-full flex-col gap-5 bg-white p-6">
        <Part n={1} on={split} className="flex flex-col gap-5">
          <HeadingBar />
          <Lines n={6} />
          <Pic srcs={srcs} figures={fig} className="aspect-[4/3] w-full rounded-[10px]" />
        </Part>
        {act ? (
          <Part n={2} on={split}>
            <ActivityCard compact />
          </Part>
        ) : (
          <Lines n={5} />
        )}
      </div>
    ) : (
      <div className="flex size-full flex-col items-center gap-6 bg-white px-[22%] py-9">
        <Part n={1} on={split} className="flex w-full flex-col items-center gap-6">
          <HeadingBar className="w-full" />
          <Lines n={3} />
          <Pic srcs={srcs} figures={fig} className="aspect-[16/9] w-[62%] rounded-[10px]" />
        </Part>
        {act ? (
          <Part n={2} on={split} className="w-full">
            <ActivityCard />
          </Part>
        ) : (
          <Lines n={4} />
        )}
      </div>
    )

  // Dynamic (llm): a fresh layout per page, the page's picture and words rearranged for the screen.
  return phone ? (
    <div className="flex size-full flex-col gap-5 bg-white p-5">
      <Part n={1} on={split} className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="size-11 shrink-0 rounded-xl bg-blue-500" />
          <HeadingBar className="flex-1" />
        </div>
        <Pic srcs={srcs} figures={fig} className="h-[200px] w-full rounded-[16px]" />
        <Lines n={4} />
      </Part>
      {act && (
        <Part n={2} on={split}>
          <ActivityCard compact />
        </Part>
      )}
    </div>
  ) : (
    <div className="flex size-full flex-col gap-7 bg-white px-12 py-9">
      <Part n={1} on={split} className="flex flex-col gap-7">
        <div className="flex items-center gap-4">
          <span className="size-12 shrink-0 rounded-xl bg-blue-500" />
          <HeadingBar className="flex-1" />
        </div>
        <div className="grid grid-cols-[1.1fr_1fr] gap-8">
          <Lines n={act ? 6 : 9} />
          <Pic srcs={srcs} figures={fig} className={cn("w-full rounded-[16px]", act ? "h-[170px]" : "h-[260px]")} />
        </div>
      </Part>
      {act && (
        <Part n={2} on={split}>
          <ActivityCard />
        </Part>
      )}
    </div>
  )
}

/** One screen of the finished book at its real size: the page area above the reader's bar. */
export function ScreenContent({ shown, device, srcs }: { shown: Shown; device: Device; srcs: (string | undefined)[] }) {
  const s = SCREEN[device]
  return (
    <div className="flex flex-col overflow-hidden bg-white" style={{ width: s.w, height: s.h }}>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Body shown={shown} device={device} srcs={srcs} />
      </div>
      <ReaderBar phone={device === "phone"} />
    </div>
  )
}
