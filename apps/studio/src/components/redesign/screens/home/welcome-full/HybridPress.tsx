import { useCallback, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Play, ImageIcon, CircleCheck, ArrowRight, FileUp, BookText } from "lucide-react"
import { cn } from "@/lib/utils"
import { Equalizer } from "../welcome-variants/parts"
import type { WelcomeVariantProps } from "./DropZoneLauncher"


const PAGE = "bg-[oklch(0.985_0.006_85)] text-[oklch(0.29_0.02_265)]"
const INK_SOFT = "text-[oklch(0.48_0.015_265)]"
const CMD_O = ["⌘", "O"].join("")

function useMiniSpreads() {
  return [
    {
      key: "open",
      label: <Trans>Opening</Trans>,
      tint: "text-stage-storyboard",
      body: (
        <>
          <h4 className="mb-2 text-[17px] font-semibold leading-tight">
            <Trans>The Water Cycle</Trans>
          </h4>
          <p className="text-[12px] leading-[1.7]">
            <span className="float-left mr-1.5 text-[30px] font-bold leading-[0.8] text-stage-storyboard">W</span>
            <Trans>ater moves in an endless loop between the sky, the land, and the sea, driven by the sun.</Trans>
          </p>
        </>
      ),
    },
    {
      key: "listen",
      label: <Trans>Narration</Trans>,
      tint: "text-stage-speech",
      body: (
        <>
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-[oklch(0.96_0.01_20)] px-3 py-2.5">
            <span className="grid size-7 place-items-center rounded-full bg-stage-speech text-white">
              <Play className="size-3.5" />
            </span>
            <span className="text-stage-speech">
              <Equalizer />
            </span>
            <span className={cn("ml-auto font-mono text-[10px]", INK_SOFT)}>0:42</span>
          </div>
          <p className="text-[12px] leading-[1.7]">
            <Trans>Every page is narrated with natural, human-quality speech, timed to the text.</Trans>
          </p>
        </>
      ),
    },
    {
      key: "quiz",
      label: <Trans>Quiz</Trans>,
      tint: "text-stage-quizzes",
      body: (
        <>
          <p className="mb-2.5 text-[12.5px] font-semibold leading-snug">
            <Trans>What makes water evaporate from the sea?</Trans>
          </p>
          <div className="space-y-1.5">
            {[
              { label: <Trans>Heat from the sun</Trans>, ok: true },
              { label: <Trans>The pull of the moon</Trans>, ok: false },
            ].map((o, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11.5px]",
                  o.ok ? "border-stage-quizzes/40 bg-[oklch(0.97_0.02_60)]" : "border-[oklch(0.9_0.01_85)] bg-white/60",
                )}
              >
                {o.ok ? <CircleCheck className="size-3.5 text-stage-quizzes" /> : <span className="size-3.5 rounded-full border border-[oklch(0.82_0.01_85)]" />}
                {o.label}
              </div>
            ))}
          </div>
        </>
      ),
    },
  ]
}

export function HybridPress({ onAddBook, onOpenDocs }: WelcomeVariantProps) {
  const { t } = useLingui()
  const spreads = useMiniSpreads()
  const [i, setI] = useState(0)
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const spread = spreads[i]

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
      className={cn("relative h-full overflow-hidden bg-background transition-colors duration-300", over && "bg-brand-50/50")}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{ backgroundImage: "radial-gradient(oklch(0.55 0.02 265 / 0.04) 0.5px, transparent 0.6px)", backgroundSize: "4px 4px" }}
      />
      <div className="grid h-full grid-cols-1 items-center gap-12 px-10 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)] lg:px-20">
        <div className="relative">
          <div className="mb-6 flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              <Trans>ADT Studio</Trans>
            </span>
            <span className="h-px w-8 bg-border" />
            <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand-600">
              <Trans>Book Atelier</Trans>
            </span>
          </div>

          <h1 className="text-[clamp(2rem,3.4vw,2.8rem)] font-bold leading-[1.05] tracking-[-0.025em] text-foreground">
            <Trans>Bring a book</Trans>
            <br />
            <span className="text-brand-700">
              <Trans>into the world.</Trans>
            </span>
          </h1>

          <p className="mt-5 max-w-[44ch] text-[14px] leading-[1.7] text-muted-foreground">
            <Trans>Drop a PDF anywhere on this page and ADT sets it as a finished, accessible edition, narrated, captioned, translated, and quiz-ready.</Trans>
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={onAddBook}
              className="group inline-flex items-center gap-2.5 rounded-full bg-foreground px-6 py-3 text-[13.5px] font-semibold text-background transition-transform duration-200 hover:scale-[1.015] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <FileUp className="size-4" />
              <Trans>Drop or choose a PDF</Trans>
              <kbd className="rounded bg-background/20 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide">{CMD_O}</kbd>
            </button>
            <button
              type="button"
              onClick={onOpenDocs}
              className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-brand-700 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              <BookText className="size-3.5" />
              <Trans>Read the docs</Trans>
            </button>
          </div>
        </div>

        <div className="relative flex flex-col items-center">
          <MiniSpecimen spread={spread} />
          <div className="mt-4 flex items-center gap-1.5">
            {spreads.map((s, idx) => (
              <button
                key={s.key}
                type="button"
                aria-label={t`Show preview ${idx + 1}`}
                aria-current={idx === i}
                onClick={() => setI(idx)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  idx === i ? "w-5 bg-brand-500" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            <Trans>Illustrative preview of a finished edition</Trans>
          </p>
        </div>
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-300",
          over ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="absolute inset-5 rounded-[28px] border-2 border-brand-500/70 bg-brand-50/40 backdrop-blur-[1px]" />
        <div className="relative flex flex-col items-center gap-3 text-brand-700">
          <FileUp className="size-8" />
          <span className="text-lg font-semibold">
            <Trans>Release to open your book</Trans>
          </span>
        </div>
      </div>
    </div>
  )
}

function MiniSpecimen({ spread }: { spread: { key: string; label: ReactNode; tint: string; body: ReactNode } }) {
  return (
    <div className="relative w-full max-w-[320px]">
      <div aria-hidden className="absolute inset-x-4 -bottom-2 top-2 -z-10 rounded-2xl bg-[oklch(0.9_0.01_85)] opacity-70" />
      <div aria-hidden className="absolute inset-x-2 -bottom-1 top-1 -z-10 rounded-2xl bg-[oklch(0.94_0.008_85)]" />
      <div className={cn("min-h-[236px] rounded-2xl border border-[oklch(0.88_0.01_85)] px-5 py-4 shadow-[0_24px_60px_-24px_rgba(20,22,40,0.45)]", PAGE)}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" className="size-4" alt="" />
            <span className={cn("text-[10px] font-medium", INK_SOFT)}>
              <Trans>Water & Weather · Grade 4</Trans>
            </span>
          </div>
          <span className={cn("inline-flex items-center gap-1 rounded-full bg-[oklch(0.95_0.008_85)] px-2 py-0.5 text-[10px] font-semibold", spread.tint)}>
            {spread.label}
          </span>
        </div>
        <div className="h-px w-full bg-[oklch(0.9_0.01_85)]" />
        <div key={spread.key} className="pt-3.5 motion-safe:animate-[onboarding-fade-up_320ms_cubic-bezier(0.22,1,0.36,1)]">
          {spread.body}
        </div>
      </div>
      <span className="pointer-events-none absolute -right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm">
        <ArrowRight className="size-3.5" />
      </span>
    </div>
  )
}
