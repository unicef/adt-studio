/* eslint-disable lingui/no-unlocalized-strings */
import { Check, Lock, Play, Search, Settings2 } from "lucide-react"
import { ArchiveMock } from "./ArchiveMock"
import { Cover } from "./MockCover"
import type { ExportFormat } from "@/components/pipeline/stages/export/export-formats"
import { cn } from "@/lib/utils"

function BrowserMock({ src, address }: { src: string | null; address: string }) {
  return (
    <div className="w-[248px] overflow-hidden rounded-xl border bg-card shadow-[0_18px_40px_-18px_rgba(0,0,0,0.35)]">
      <div className="flex h-7 items-center gap-1.5 border-b bg-muted/60 px-2.5">
        <span className="size-2 rounded-full bg-red-400/80" />
        <span className="size-2 rounded-full bg-amber-400/80" />
        <span className="size-2 rounded-full bg-emerald-400/80" />
        <span className="ml-2 h-4 flex-1 truncate rounded-full bg-background px-2 font-mono text-[9px] leading-4 text-muted-foreground">{address}</span>
      </div>
      <div className="flex gap-3 bg-background p-3">
        <Cover src={src} className="h-[168px] w-[124px] shrink-0 rounded-[4px] shadow-sm" />
        <div className="flex flex-1 flex-col gap-1.5 pt-1">
          <span className="h-2 w-4/5 rounded-full bg-(--accent)/40" />
          <span className="h-1.5 w-full rounded-full bg-muted" />
          <span className="h-1.5 w-11/12 rounded-full bg-muted" />
          <span className="h-1.5 w-3/4 rounded-full bg-muted" />
          <span className="mt-2 h-5 w-14 rounded-md bg-(--accent)/25" />
        </div>
      </div>
    </div>
  )
}

function ReaderMock({ src }: { src: string | null }) {
  return (
    <div className="rounded-[26px] bg-zinc-900 p-3 pb-7 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.5)] ring-1 ring-black/20 dark:bg-zinc-800">
      <Cover src={src} className="h-[220px] w-[160px] rounded-[6px]" />
    </div>
  )
}

function DocumentMock({ src }: { src: string | null }) {
  return (
    <div className="w-[196px] overflow-hidden rounded-lg border bg-card shadow-[0_18px_40px_-18px_rgba(0,0,0,0.35)]">
      <div className="flex h-6 items-center justify-between bg-(--accent-solid) px-2.5 text-[9px] font-semibold uppercase tracking-wider text-white">
        <span>PNLD</span>
        <span className="opacity-80">VALIDE</span>
      </div>
      <div className="p-3">
        <Cover src={src} className="h-[196px] w-full rounded-[3px]" />
      </div>
    </div>
  )
}

function DesktopAppMock({ src }: { src: string | null }) {
  return (
    <div className="w-[280px] overflow-hidden rounded-xl border bg-card shadow-[0_22px_44px_-20px_rgba(0,0,0,0.45)] ring-1 ring-black/5">
      <div className="flex h-7 items-center gap-1.5 border-b bg-muted/70 px-2.5">
        <span className="size-2 rounded-full bg-red-400/80" />
        <span className="size-2 rounded-full bg-amber-400/80" />
        <span className="size-2 rounded-full bg-emerald-400/80" />
        <span className="ml-auto flex items-center gap-1.5 text-muted-foreground/70">
          <Search className="size-2.5" />
          <Settings2 className="size-2.5" />
        </span>
      </div>
      <div className="flex h-[196px]">
        <div className="flex w-[52px] shrink-0 flex-col items-center gap-2 border-r bg-muted/40 py-2.5">
          <Cover src={src} className="h-[40px] w-[29px] rounded-[2px] ring-2 ring-(--accent) ring-offset-1 ring-offset-muted" />
          <span className="h-[40px] w-[29px] rounded-[2px] bg-foreground/10" />
          <span className="h-[40px] w-[29px] rounded-[2px] bg-foreground/[0.07]" />
        </div>
        <div className="flex flex-1 flex-col gap-2 p-2.5">
          <div className="flex flex-1 gap-1 rounded-md bg-background p-1.5 shadow-inner ring-1 ring-foreground/5">
            <Cover src={src} className="h-full w-[50%] rounded-[2px]" />
            <div className="flex flex-1 flex-col gap-1.5 px-1.5 pt-1">
              <span className="h-1.5 w-4/5 rounded-full bg-(--accent)/45" />
              <span className="h-1 w-full rounded-full bg-muted" />
              <span className="h-1 w-11/12 rounded-full bg-muted" />
              <span className="h-1 w-full rounded-full bg-muted" />
              <span className="h-1 w-3/4 rounded-full bg-muted" />
              <span className="mt-1 h-1 w-full rounded-full bg-muted" />
              <span className="h-1 w-5/6 rounded-full bg-muted" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full w-1/3 rounded-full bg-(--accent)" />
            </span>
            <span className="font-mono text-[8px] text-muted-foreground">3 / 21</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function CourseMock({ src }: { src: string | null }) {
  const lessons: ("done" | "current" | "locked")[] = ["done", "done", "current", "locked"]
  return (
    <div className="w-[264px] overflow-hidden rounded-xl border bg-card shadow-[0_22px_44px_-20px_rgba(0,0,0,0.45)] ring-1 ring-black/5">
      <div className="flex h-6 items-center gap-1.5 border-b bg-muted/60 px-2.5">
        <span className="size-3 rounded-[4px] bg-(--accent)" />
        <span className="h-1.5 w-12 rounded-full bg-foreground/20" />
        <span className="ml-auto h-1.5 w-8 rounded-full bg-foreground/10" />
      </div>
      <div className="relative h-[78px] overflow-hidden">
        {src && <img src={src} alt="" className="absolute inset-0 size-full scale-110 object-cover blur-md" />}
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
        <div className="relative flex h-full items-center gap-2.5 px-3">
          <Cover src={src} className="h-[60px] w-[44px] shrink-0 rounded-[3px] shadow-md ring-1 ring-white/30" />
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="h-2 w-4/5 rounded-full bg-white/85" />
            <span className="h-1.5 w-1/2 rounded-full bg-white/55" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1 p-2.5">
        {lessons.map((state, index) => (
          <div
            key={index}
            className={cn(
              "flex h-6 items-center gap-2 rounded-md px-1.5",
              state === "current" && "bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]",
            )}
          >
            <span
              className={cn(
                "grid size-3.5 shrink-0 place-items-center rounded-full",
                state === "done" && "bg-(--accent-solid) text-white",
                state === "current" && "bg-card text-(--accent-solid) ring-1 ring-(--accent)",
                state === "locked" && "bg-muted text-muted-foreground",
              )}
            >
              {state === "done" && <Check className="size-2" strokeWidth={4} />}
              {state === "current" && <Play className="size-1.5 fill-current" />}
              {state === "locked" && <Lock className="size-1.5" />}
            </span>
            <span className={cn("h-1.5 rounded-full", state === "locked" ? "w-1/2 bg-muted" : "w-2/3 bg-foreground/20")} />
          </div>
        ))}
        <div className="mt-1.5 flex items-center gap-2 border-t pt-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full w-1/2 rounded-full bg-(--accent)" />
          </span>
          <span className="flex h-5 items-center gap-1 rounded-full bg-(--accent-solid) px-2 text-white">
            <Play className="size-2 fill-current" />
            <span className="h-1 w-6 rounded-full bg-white/80" />
          </span>
        </div>
      </div>
    </div>
  )
}

export function BookMock({
  format,
  src,
  fileName,
  className,
}: {
  format: ExportFormat
  src: string | null
  fileName: string
  className?: string
}) {
  return (
    <div
      key={format}
      className={cn("grid place-items-center animate-in fade-in zoom-in-95 duration-300 ease-out motion-reduce:animate-none", className)}
    >
      {format === "adt" && <BrowserMock src={src} address="your-site.org/book" />}
      {format === "webpub" && <DesktopAppMock src={src} />}
      {format === "epub" && <ReaderMock src={src} />}
      {format === "pnld" && <DocumentMock src={src} />}
      {format === "scorm" && <CourseMock src={src} />}
      {format === "project" && <ArchiveMock src={src} fileName={fileName} />}
    </div>
  )
}
