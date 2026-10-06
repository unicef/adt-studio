import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { LayoutTemplate, Monitor, Palette, Puzzle, Smartphone, Sparkles, Timer, type LucideIcon } from "lucide-react"
import { DynamicExample, OverlayExample, ReaderBar } from "./examples"
import { cn } from "@/lib/utils"

export type Device = "desktop" | "phone"

/** AI-powered strategies are laid out fresh per page, so they can only be shown with an example. */
export const isAi = (id: string) => id === "llm" || id === "llm-overlay"

type Glance = { key: string; icon: LucideIcon; label: ReactNode; value: ReactNode; good: boolean }

/** The four things people care about, per strategy — shown as icon tiles so options compare at a glance. */
export function useGlance(id: string): Glance[] {
  const phones = id === "fixed_layout" ? { value: <Trans>Page shrinks</Trans>, good: false } : { value: <Trans>Adapts</Trans>, good: true }
  const speed = id === "llm" ? { value: <Trans>Slowest</Trans>, good: false } : id === "llm-overlay" ? { value: <Trans>Slower</Trans>, good: false } : { value: <Trans>Fast</Trans>, good: true }
  const activities = id === "fixed_layout" ? { value: <Trans>Not in pages</Trans>, good: false } : { value: <Trans>Supported</Trans>, good: true }
  const look = id === "fixed_layout" || id === "llm-overlay" ? { value: <Trans>Kept</Trans>, good: true } : { value: <Trans>New layout</Trans>, good: false }
  return [
    { key: "phones", icon: Smartphone, label: <Trans>On phones</Trans>, ...phones },
    { key: "look", icon: Palette, label: <Trans>Original look</Trans>, ...look },
    { key: "speed", icon: Timer, label: <Trans>Time to create</Trans>, ...speed },
    { key: "activities", icon: Puzzle, label: <Trans>Activities</Trans>, ...activities },
  ]
}

export function KindTag({ id, className }: { id: string; className?: string }) {
  return isAi(id) ? (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200", className)}>
      <Sparkles className="size-3" />
      <Trans>AI-powered</Trans>
    </span>
  ) : (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/75 ring-1 ring-border", className)}>
      <LayoutTemplate className="size-3" />
      <Trans>Template-based</Trans>
    </span>
  )
}

const frameHeight = (device: Device, width: number) => Math.round(device === "desktop" ? width * 0.64 : width * 2.05)

const WINDOW_DOTS = [{ className: "bg-rose-400" }, { className: "bg-amber-400" }, { className: "bg-emerald-400" }]

/** The browser title bar on the computer frame: window dots and an address bar, scaled with the frame. */
function WindowBar({ width }: { width: number }) {
  const h = windowBar(width)
  const dot = Math.max(2, Math.round(h * 0.28))
  return (
    <div className="absolute inset-x-0 top-0 flex items-center border-b border-slate-200 bg-slate-100" style={{ height: h, paddingInline: h * 0.45, gap: dot * 0.8 }}>
      {WINDOW_DOTS.map((d) => (
        <span key={d.className} className={cn("shrink-0 rounded-full", d.className)} style={{ width: dot, height: dot }} />
      ))}
      <span className="mx-auto rounded-full bg-white ring-1 ring-slate-200" style={{ height: h * 0.52, width: "38%" }} />
    </div>
  )
}

/** A computer (browser window) or phone frame of a given width; everything inside scales with it. */
function DeviceFrame({ device, width, children, className }: { device: Device; width: number; children: ReactNode; className?: string }) {
  const desktop = device === "desktop"
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden bg-white shadow-[0_24px_50px_-24px_rgba(15,23,42,0.55)]", desktop ? "border-slate-300" : "border-slate-800", className)}
      style={{ width, height: frameHeight(device, width), borderWidth: bezel(device, width), borderRadius: Math.round(width * (desktop ? 0.02 : 0.15)) }}
    >
      {desktop && <WindowBar width={width} />}
      {children}
    </div>
  )
}

function Bars({ n, u, center, dark }: { n: number; u: number; center?: boolean; dark?: boolean }) {
  return (
    <div className={cn("flex w-full flex-col", center && "items-center")} style={{ gap: Math.max(2, u * 1.6) }}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cn("rounded-full", dark ? "bg-slate-500/70" : "bg-slate-300")} style={{ height: Math.max(1.5, u * 1.5), width: `${[94, 80, 88, 66, 84, 72, 90][i % 7]}%` }} />
      ))}
    </div>
  )
}

function Heading({ u }: { u: number }) {
  return <span className="block rounded-full bg-slate-800" style={{ height: Math.max(2, u * 2.4), width: "62%" }} />
}

const artCache = new Map<string, Box>()
type Box = { x: number; y: number; w: number; h: number }
const FULL: Box = { x: 0, y: 0, w: 1, h: 1 }

/**
 * Finds where the artwork sits on a page: renders it small and takes the bounding box of the
 * colourful pixels (text is dark/grey on light paper, illustrations are saturated). Falls back to
 * the whole page. A rough heuristic — the real templates use the images extracted from the PDF.
 */
function useArtBox(src?: string): Box | null {
  const [box, setBox] = useState<Box | null>(() => (src ? artCache.get(src) ?? null : FULL))
  useEffect(() => {
    if (!src) return setBox(FULL)
    const cached = artCache.get(src)
    if (cached) return setBox(cached)
    const img = new Image()
    img.onload = () => {
      const W = 96
      const H = Math.max(1, Math.round((W * img.naturalHeight) / img.naturalWidth))
      const canvas = document.createElement("canvas")
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (!ctx) return setBox(FULL)
      ctx.drawImage(img, 0, 0, W, H)
      const { data } = ctx.getImageData(0, 0, W, H)
      const cols = new Array(W).fill(0)
      const rows = new Array(H).fill(0)
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4
          const r = data[i], g = data[i + 1], b = data[i + 2]
          const max = Math.max(r, g, b), min = Math.min(r, g, b)
          if (max - min > 30 && max > 40) {
            cols[x]++
            rows[y]++
          }
        }
      const span = (arr: number[], len: number) => {
        const th = Math.max(2, len * 0.05)
        let a = arr.findIndex((v) => v >= th)
        let b = arr.length - 1 - [...arr].reverse().findIndex((v) => v >= th)
        if (a < 0) return null
        return [a, b + 1] as const
      }
      const sx = span(cols, H)
      const sy = span(rows, W)
      const found = sx && sy && (sx[1] - sx[0]) * (sy[1] - sy[0]) > W * H * 0.06 ? { x: sx[0] / W, y: sy[0] / H, w: (sx[1] - sx[0]) / W, h: (sy[1] - sy[0]) / H } : FULL
      artCache.set(src, found)
      setBox(found)
    }
    img.onerror = () => setBox(FULL)
    img.src = src
  }, [src])
  return box
}

/** Share of colourful pixels on a page (0–1), used to find the most illustrated page. */
export function colourfulness(src: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const W = 64
      const H = Math.max(1, Math.round((W * img.naturalHeight) / img.naturalWidth))
      const canvas = document.createElement("canvas")
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext(`2d`, { willReadFrequently: true })
      if (!ctx) return resolve(0)
      ctx.drawImage(img, 0, 0, W, H)
      const { data } = ctx.getImageData(0, 0, W, H)
      let n = 0
      for (let i = 0; i < data.length; i += 4) if (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 30) n++
      resolve(n / (W * H))
    }
    img.onerror = () => resolve(0)
    img.src = src
  })
}

/** Just the artwork, as a template would place it: the page cropped to its detected picture. */
function Pic({ src, className }: { src?: string; className?: string }) {
  const box = useArtBox(src)
  const view = box ? [box.y, 1 - box.x - box.w, 1 - box.y - box.h, box.x].map((n) => `${n * 100}%`).join(" ") : undefined
  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-br from-brand-100 to-brand-200", className)}>
      {src && box && <img src={src} alt="" className="absolute inset-0 size-full object-cover" style={{ objectViewBox: view && `inset(${view})` } as CSSProperties} />}
    </div>
  )
}

const bezel = (device: Device, width: number) => (device === "desktop" ? 1 : Math.max(1.5, Math.round(width * 0.04)))
const windowBar = (width: number) => Math.max(5, Math.round(width * 0.04))
/** The drawable screen inside a frame: below the title bar on a computer, inside the bezel on a phone. */
const screenArea = (device: Device, width: number) => {
  const b = bezel(device, width)
  const top = device === "desktop" ? windowBar(width) - b : 0
  return { top, w: width - 2 * b, h: frameHeight(device, width) - 2 * b - top }
}

/** Every screen is drawn at a fixed "real" size and scaled into its frame, so a 46px thumbnail and the 600px stage show exactly the same thing. */
const VIRTUAL: Record<Device, { w: number; h: number }> = { desktop: { w: 1024, h: 614 }, phone: { w: 390, h: 800 } }

/** Readable placeholder text for template previews — reads like story text, not a wireframe. */
function StoryText({ u, center }: { u: number; center?: boolean }) {
  return (
    <div className={cn("flex w-full flex-col", center && "items-center text-center")} style={{ gap: u * 3 }}>
      {[0, 1].map((i) => (
        <p key={i} className="font-semibold leading-snug text-slate-800" style={{ fontSize: u * (center ? 5 : 3.2) }}>
          {i === 0 ? <Trans>The text from your page goes here, in large and easy-to-read letters.</Trans> : <Trans>Each page keeps its picture next to its words.</Trans>}
        </p>
      ))}
    </div>
  )
}

/** The contents of one screen at virtual size (u = 1% of the virtual width), above the reader's bar. */
function ScreenBody({ id, device, page }: { id: string; device: Device; page?: string }) {
  const phone = device === "phone"
  return (
    <div className="flex size-full flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <PageArea id={id} device={device} page={page} />
      </div>
      <ReaderBar phone={phone} />
    </div>
  )
}

function PageArea({ id, device, page }: { id: string; device: Device; page?: string }) {
  const u = VIRTUAL[device].w / 100
  const phone = device === "phone"
  const pad = { padding: u * (phone ? 6 : 4) }
  if (id === "llm") return <DynamicExample phone={phone} />
  if (id === "llm-overlay") return <OverlayExample phone={phone} />
  if (id === "fixed_layout")
    return (
      <div className={cn("relative size-full", phone ? "bg-white" : "bg-slate-100")}>
        {page ? <img src={page} alt="" className="absolute inset-0 size-full object-contain" /> : <div className="absolute inset-x-0 top-1/4 h-1/2 bg-brand-100" />}
      </div>
    )
  if (id === "two_column_story")
    return phone ? (
      <div className="flex size-full flex-col items-center bg-[#FFFAF5]" style={{ ...pad, gap: u * 6 }}>
        <Pic src={page} className="aspect-[4/3] w-full shrink-0 rounded-[14px]" />
        <StoryText u={u} center />
      </div>
    ) : (
      <div className="grid size-full grid-cols-[1.1fr_1fr] items-center bg-[#FFFAF5]" style={{ padding: u * 5, gap: u * 5 }}>
        <Pic src={page} className="h-full w-full rounded-[14px]" />
        <StoryText u={u} />
      </div>
    )
  return phone ? (
    <div className="flex size-full flex-col" style={{ ...pad, gap: u * 4 }}>
      <Heading u={u} />
      <Bars n={8} u={u} />
      <Pic src={page} className="aspect-[4/3] w-2/3 rounded-[8px]" />
      <Bars n={4} u={u} />
    </div>
  ) : (
    <div className="flex size-full flex-col items-center" style={{ paddingBlock: u * 4, paddingInline: "20%", gap: u * 3 }}>
      <Heading u={u} />
      <Bars n={3} u={u} />
      <Pic src={page} className="aspect-[16/9] w-1/2 rounded-[6px]" />
      <Bars n={3} u={u} />
    </div>
  )
}

/**
 * How a page looks under each render strategy, on a computer or a phone. Fixed layout and templates are
 * predictable, so they use the book's own page; AI-powered strategies design each page fresh, so they
 * show the wizard's example mockup (callers label it as an example). Drawn at a virtual device size
 * and scaled to `width`. Content only; wrap it in a DeviceFrame.
 */
export function Screen({ id, device, width, page }: { id: string; device: Device; width: number; page?: string }) {
  const v = VIRTUAL[device]
  const area = screenArea(device, width)
  const scale = area.w / v.w
  return (
    <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ top: area.top }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: v.w, height: area.h / scale, transform: `scale(${scale})` }}>
        <ScreenBody id={id} device={device} page={page} />
      </div>
    </div>
  )
}

export function Preview({ id, device, width, page, className }: { id: string; device: Device; width: number; page?: string; className?: string }) {
  return (
    <DeviceFrame device={device} width={width} className={className}>
      <Screen id={id} device={device} width={width} page={page} />
    </DeviceFrame>
  )
}

export function DeviceToggle({ value, onChange }: { value: Device; onChange: (d: Device) => void }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-full bg-muted p-1 text-[13px] font-medium">
      {(["desktop", "phone"] as const).map((d) => (
        <button key={d} type="button" role="radio" aria-checked={value === d} onClick={() => onChange(d)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 transition-[background-color,color,box-shadow] duration-200", value === d ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {d === "desktop" ? <Monitor className="size-4" /> : <Smartphone className="size-4" />}
          {d === "desktop" ? <Trans>Computer</Trans> : <Trans>Phone</Trans>}
        </button>
      ))}
    </div>
  )
}
