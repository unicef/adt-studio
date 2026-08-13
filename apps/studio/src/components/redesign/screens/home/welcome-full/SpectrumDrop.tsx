import { useCallback, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileUp, FolderInput, BookText } from "lucide-react"
import { cn } from "@/lib/utils"
import { CAPABILITIES } from "../welcome-variants/capabilities"
import type { WelcomeVariantProps } from "./DropZoneLauncher"


const ORBIT = [
  { cap: 4, pos: "left-[6%] top-[18%]", delay: "0s" },
  { cap: 3, pos: "right-[8%] top-[12%]", delay: "0.8s" },
  { cap: 5, pos: "left-[10%] bottom-[20%]", delay: "0.4s" },
  { cap: 8, pos: "right-[6%] bottom-[24%]", delay: "1.2s" },
  { cap: 6, pos: "left-[24%] top-[6%]", delay: "1.6s" },
  { cap: 11, pos: "right-[22%] bottom-[8%]", delay: "0.2s" },
]

export function SpectrumDrop({ onAddBook, onImport, onOpenDocs }: WelcomeVariantProps) {
  const { t, i18n } = useLingui()
  const [over, setOver] = useState(false)
  const depth = useRef(0)

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return
    e.preventDefault()
    depth.current += 1
    setOver(true)
  }, [])
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    depth.current -= 1
    if (depth.current <= 0) {
      depth.current = 0
      setOver(false)
    }
  }, [])
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      depth.current = 0
      setOver(false)
      onAddBook()
    },
    [onAddBook],
  )

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative grid h-full place-items-center overflow-hidden bg-background px-6"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {ORBIT.map(({ cap, pos, delay }) => {
          const c = CAPABILITIES[cap]
          const Icon = c.icon
          return (
            <span
              key={cap}
              className={cn(
                "absolute inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[11px] font-semibold shadow-md transition-all duration-500 motion-safe:animate-float-y",
                c.tint,
                pos,
                over ? "scale-105 opacity-100 shadow-lg" : "opacity-85",
              )}
              style={{ animationDelay: delay }}
            >
              <Icon className="size-3.5" />
              {i18n._(c.title)}
            </span>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onAddBook}
        aria-label={t`Add a book from a PDF`}
        className={cn(
          "group relative z-10 flex w-full max-w-[440px] cursor-pointer flex-col items-center rounded-[28px] border bg-card/70 px-10 py-14 text-center outline-none backdrop-blur-sm transition-all duration-300",
          "focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          over ? "-translate-y-1 border-brand-500 shadow-[0_20px_60px_-16px] shadow-brand-500/30" : "shadow-md hover:-translate-y-0.5 hover:shadow-lg",
        )}
      >
        <span
          aria-hidden
          className={cn("mb-7 grid size-[92px] place-items-center rounded-full transition-transform duration-300", over && "scale-105")}
          style={{
            background: "conic-gradient(from 210deg, var(--color-stage-speech), var(--color-stage-quizzes), var(--color-stage-translate), var(--color-stage-sign), var(--color-stage-captions), var(--color-stage-validation), var(--color-stage-speech))",
          }}
        >
          <span className="grid size-[72px] place-items-center rounded-full bg-card text-brand-600 shadow-inner">
            <FileUp className={cn("size-7 transition-transform duration-300", over && "-translate-y-0.5")} />
          </span>
        </span>

        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">
          {over ? <Trans>Release to open your book</Trans> : <Trans>Drop a PDF to start a book</Trans>}
        </h1>
        <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-muted-foreground">
          <Trans>One file in, a fully accessible edition out: narration, captions, translation, quizzes, and WCAG checks.</Trans>
        </p>
        <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition-transform duration-200 group-hover:scale-[1.02] group-active:scale-95">
          <Trans>Choose a PDF</Trans>
        </span>
      </button>

      <div className="absolute bottom-9 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 text-[13px] text-muted-foreground">
        <button
          type="button"
          onClick={onImport}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        >
          <FolderInput className="size-3.5" />
          <Trans>Import an existing project</Trans>
        </button>
        <span aria-hidden className="text-border">·</span>
        <button
          type="button"
          onClick={onOpenDocs}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        >
          <BookText className="size-3.5" />
          <Trans>Read the docs</Trans>
        </button>
      </div>
    </div>
  )
}
