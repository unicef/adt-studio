import { useState } from "react"
import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronLeft, ChevronRight, Play, Languages, ImageIcon, CircleCheck, ArrowRight, Plus, BookText } from "lucide-react"
import { cn } from "@/lib/utils"
import { Equalizer } from "../welcome-variants/parts"
import type { WelcomeVariantProps } from "./DropZoneLauncher"


const PAGE = "bg-[oklch(0.985_0.006_85)] text-[oklch(0.29_0.02_265)]"
const INK_SOFT = "text-[oklch(0.48_0.015_265)]"
const RULE = "bg-[oklch(0.9_0.01_85)]"

function Line({ w = "100%", soft }: { w?: string; soft?: boolean }) {
  return <span className={cn("block h-[6px] rounded-full", soft ? "bg-[oklch(0.92_0.008_85)]" : "bg-[oklch(0.87_0.01_85)]")} style={{ width: w }} />
}

type Spread = { key: string; label: ReactNode; tint: string; render: () => ReactNode }

function useSpreads(): Spread[] {
  const { t } = useLingui()
  return [
    {
      key: "open",
      label: <Trans>Opening</Trans>,
      tint: "text-stage-storyboard",
      render: () => (
        <div>
          <div className={cn("mb-3 font-mono text-[10px] uppercase tracking-[0.16em]", INK_SOFT)}>
            <Trans>Chapter 3</Trans>
          </div>
          <h4 className="mb-3 text-[19px] font-semibold leading-tight">
            <Trans>The Water Cycle</Trans>
          </h4>
          <p className="text-[12.5px] leading-[1.7]">
            <span className="float-left mr-1.5 text-[34px] font-bold leading-[0.8] text-stage-storyboard">W</span>
            <Trans>ater moves in an endless loop between the sky, the land, and the sea. Driven by the sun, it evaporates, gathers into clouds, and returns as rain.</Trans>
          </p>
          <div className="mt-3 space-y-2">
            <Line w="96%" /> <Line w="88%" /> <Line w="92%" soft />
          </div>
        </div>
      ),
    },
    {
      key: "listen",
      label: <Trans>Narration</Trans>,
      tint: "text-stage-speech",
      render: () => (
        <div>
          <div className="space-y-2">
            <Line w="94%" /> <Line w="80%" />
          </div>
          <div className="my-4 flex items-center gap-3 rounded-xl bg-[oklch(0.96_0.01_20)] px-3 py-2.5">
            <span className="grid size-7 place-items-center rounded-full bg-stage-speech text-white">
              <Play className="size-3.5" />
            </span>
            <span className="text-stage-speech">
              <Equalizer />
            </span>
            <span className={cn("ml-auto font-mono text-[10px]", INK_SOFT)}>0:42</span>
          </div>
          <p className="text-[12.5px] leading-[1.7]">
            <Trans>Every page is narrated with natural, human-quality speech, timed to the text so learners can read and listen together.</Trans>
          </p>
        </div>
      ),
    },
    {
      key: "caption",
      label: <Trans>Alt text</Trans>,
      tint: "text-stage-captions",
      render: () => (
        <div>
          <div className="relative grid h-[92px] place-items-center rounded-xl bg-[oklch(0.94_0.012_85)]">
            <ImageIcon className="size-7 text-[oklch(0.6_0.02_85)]" />
            <span className="absolute -bottom-2 left-3 right-6 rounded-lg border border-[oklch(0.9_0.01_85)] bg-white/95 px-2.5 py-1.5 text-[10.5px] leading-snug shadow-sm">
              <span className="font-semibold text-stage-captions">
                <Trans>Alt: </Trans>
              </span>
              <Trans>Rain falling from a grey cloud onto a green hillside and a winding river.</Trans>
            </span>
          </div>
          <div className="mt-6 space-y-2">
            <Line w="90%" /> <Line w="97%" soft /> <Line w="72%" />
          </div>
        </div>
      ),
    },
    {
      key: "translate",
      label: <Trans>Translation</Trans>,
      tint: "text-stage-translate",
      render: () => (
        <div>
          <div className="mb-3 flex gap-1.5">
            {["en", "es", "fr"].map((languageCode, i) => (
              <span
                key={languageCode}
                className={cn(
                  "rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold",
                  i === 1 ? "bg-stage-translate text-white" : "bg-[oklch(0.93_0.01_85)] text-[oklch(0.5_0.02_265)]",
                )}
              >
                {languageCode.toUpperCase()}
              </span>
            ))}
          </div>
          <h4 className="mb-2 text-[17px] font-semibold leading-tight">
            <Trans>El Ciclo del Agua</Trans>
          </h4>
          <p className="text-[12.5px] leading-[1.7]">
            <Trans>El agua se mueve en un ciclo interminable entre el cielo, la tierra y el mar, impulsada por el sol.</Trans>
          </p>
          <div className="mt-3 space-y-2">
            <Line w="93%" /> <Line w="85%" soft />
          </div>
        </div>
      ),
    },
    {
      key: "quiz",
      label: <Trans>Quiz</Trans>,
      tint: "text-stage-quizzes",
      render: () => (
        <div>
          <div className={cn("mb-2 font-mono text-[10px] uppercase tracking-[0.14em]", INK_SOFT)}>
            <Trans>Check your understanding</Trans>
          </div>
          <p className="mb-3 text-[13px] font-semibold leading-snug">
            <Trans>What makes water evaporate from the sea?</Trans>
          </p>
          <div className="space-y-1.5">
            {[
              { label: <Trans>Heat from the sun</Trans>, ok: true },
              { label: <Trans>The pull of the moon</Trans>, ok: false },
              { label: <Trans>Wind from the mountains</Trans>, ok: false },
            ].map((o, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px]",
                  o.ok ? "border-stage-quizzes/40 bg-[oklch(0.97_0.02_60)]" : "border-[oklch(0.9_0.01_85)] bg-white/60",
                )}
              >
                {o.ok ? <CircleCheck className="size-4 text-stage-quizzes" /> : <span className="size-4 rounded-full border border-[oklch(0.82_0.01_85)]" />}
                {o.label}
              </div>
            ))}
          </div>
        </div>
      ),
    },
  ]
}

export function SampleReader({ onAddBook, onOpenSample, onOpenDocs }: WelcomeVariantProps) {
  const { t } = useLingui()
  const spreads = useSpreads()
  const [i, setI] = useState(0)
  const go = (n: number) => setI((p) => (p + n + spreads.length) % spreads.length)
  const spread = spreads[i]

  return (
    <div className="grid h-full grid-cols-1 items-center gap-10 bg-background px-8 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)] lg:px-16">
      <div className="flex flex-col items-center">
        <div
          role="group"
          aria-roledescription={t`Sample book`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1)
            if (e.key === "ArrowLeft") go(-1)
          }}
          className="relative w-full max-w-[380px] rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          <div aria-hidden className="absolute inset-x-4 -bottom-2 top-2 -z-10 rounded-2xl bg-[oklch(0.9_0.01_85)] opacity-70" />
          <div aria-hidden className="absolute inset-x-2 -bottom-1 top-1 -z-10 rounded-2xl bg-[oklch(0.94_0.008_85)]" />

          <div className={cn("min-h-[300px] rounded-2xl border border-[oklch(0.88_0.01_85)] px-6 py-5 shadow-[0_24px_60px_-24px_rgba(20,22,40,0.45)]", PAGE)}>
            <div className="mb-4 flex items-center justify-between">
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
            <div className={cn("h-px w-full", RULE)} />
            <div key={spread.key} className="pt-4 motion-safe:animate-[onboarding-fade-up_320ms_cubic-bezier(0.22,1,0.36,1)]">
              {spread.render()}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-4">
            <PagerBtn onClick={() => go(-1)} label={t`Previous page`}>
              <ChevronLeft className="size-4" />
            </PagerBtn>
            <div className="flex items-center gap-1.5">
              {spreads.map((s, idx) => (
                <button
                  key={s.key}
                  type="button"
                  aria-label={t`Go to page ${idx + 1}`}
                  aria-current={idx === i}
                  onClick={() => setI(idx)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-200",
                    idx === i ? "w-5 bg-brand-500" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                  )}
                />
              ))}
            </div>
            <PagerBtn onClick={() => go(1)} label={t`Next page`}>
              <ChevronRight className="size-4" />
            </PagerBtn>
          </div>
        </div>
        <p className="mt-4 text-[11.5px] text-muted-foreground">
          <Trans>Sample edition · generated from a 42-page PDF</Trans>
        </p>
      </div>

      <div className="max-w-[42ch]">
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-brand-600">
          <Trans>The output</Trans>
        </div>
        <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.02em]">
          <Trans>This is what ADT makes.</Trans>
        </h1>
        <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
          <Trans>Every page here started as a plain PDF. Narration, alt text, translations, and quizzes are all generated, all inspectable, all versioned. Flip through it, then make your own.</Trans>
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onAddBook}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13.5px] font-semibold text-background transition-transform duration-200 hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Plus className="size-4" />
            <Trans>Make one from your PDF</Trans>
          </button>
          <button
            type="button"
            onClick={onOpenSample}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            <Trans>Open the full sample</Trans>
            <ArrowRight className="size-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenDocs}
          className="mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-700 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        >
          <BookText className="size-3.5" />
          <Trans>Read the docs</Trans>
        </button>
      </div>
    </div>
  )
}

function PagerBtn({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-8 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm transition-all duration-150 hover:-translate-y-px hover:border-brand-300 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
    >
      {children}
    </button>
  )
}
