import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { SCREEN, ScreenContent, type Device, type Shown } from "./layouts"

const FRAME: Record<Device, { side: number; top: number; bottom: number }> = {
  desktop: { side: 1, top: 34, bottom: 1 },
  phone: { side: 14, top: 14, bottom: 14 },
}

export function deviceSize(device: Device) {
  const s = SCREEN[device]
  const f = FRAME[device]
  return { w: s.w + 2 * f.side, h: s.h + f.top + f.bottom }
}

/** The scale that fits a device into a box. */
export function fitScale(device: Device, maxW: number, maxH: number) {
  const { w, h } = deviceSize(device)
  return Math.max(0.05, Math.min(maxW / w, maxH / h))
}

const DOTS = ["bg-rose-400", "bg-amber-400", "bg-emerald-400"]

/**
 * A computer (browser window) or a phone showing one screen of the finished book. Drawn at the
 * device's real size and scaled down as a whole, so a small comparison card and the big stage show
 * exactly the same thing. `label` is the text equivalent for screen readers; `overlay` sits on the
 * screen (e.g. the reading scan line).
 */
export function BookDevice({ device, scale, shown, srcs, label, overlay, className }: { device: Device; scale: number; shown: Shown; srcs: (string | undefined)[]; label: string; overlay?: ReactNode; className?: string }) {
  const { w, h } = deviceSize(device)
  const f = FRAME[device]
  const desktop = device === "desktop"
  return (
    <div role="img" aria-label={label} className={cn("relative shrink-0", className)} style={{ width: w * scale, height: h * scale }}>
      <div
        className={cn(
          "absolute left-0 top-0 origin-top-left overflow-hidden shadow-[0_40px_80px_-30px_rgba(15,23,42,0.55)]",
          desktop ? "rounded-[14px] border border-slate-300 bg-slate-100 dark:border-slate-600" : "rounded-[58px] bg-slate-900 ring-1 ring-slate-700 dark:ring-[3px] dark:ring-slate-500",
        )}
        style={{ width: w, height: h, transform: `scale(${scale})` }}
      >
        {desktop ? (
          <div className="absolute inset-x-0 top-0 flex h-[34px] items-center gap-2 px-4">
            {DOTS.map((d) => (
              <span key={d} className={cn("size-3 rounded-full", d)} />
            ))}
            <span className="mx-auto h-[18px] w-[38%] rounded-full bg-white ring-1 ring-slate-200" />
          </div>
        ) : (
          <span className="absolute left-1/2 top-[24px] z-10 h-[26px] w-[110px] -translate-x-1/2 rounded-full bg-slate-900" />
        )}
        <div className={cn("absolute overflow-hidden", desktop ? "rounded-b-[13px]" : "rounded-[44px]")} style={{ left: f.side, top: f.top, width: SCREEN[device].w, height: SCREEN[device].h }}>
          <ScreenContent shown={shown} device={device} srcs={srcs} />
          {overlay}
        </div>
      </div>
    </div>
  )
}
