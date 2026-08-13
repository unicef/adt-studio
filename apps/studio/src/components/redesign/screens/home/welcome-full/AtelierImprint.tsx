import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowRight, BookText } from "lucide-react"
import type { WelcomeVariantProps } from "./DropZoneLauncher"


const STEPS = [
  {
    n: "01",
    title: <Trans>Extract</Trans>,
    body: <Trans>Pages, figures, and structure, pulled cleanly from your PDF.</Trans>,
  },
  {
    n: "02",
    title: <Trans>Enhance</Trans>,
    body: <Trans>Narration, alt text, translations, and quizzes, generated and inspectable.</Trans>,
  },
  {
    n: "03",
    title: <Trans>Bind</Trans>,
    body: <Trans>An accessible, interactive edition, assembled and versioned.</Trans>,
  },
]

export function AtelierImprint({ onAddBook, onOpenSample, onOpenDocs }: WelcomeVariantProps) {
  return (
    <div className="relative grid h-full grid-cols-1 items-center gap-14 overflow-hidden bg-background px-10 py-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:px-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{ backgroundImage: "radial-gradient(oklch(0.55 0.02 265 / 0.04) 0.5px, transparent 0.6px)", backgroundSize: "4px 4px" }}
      />

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

        <h1 className="text-[clamp(2.1rem,3.6vw,2.9rem)] font-bold leading-[1.04] tracking-[-0.025em] text-foreground">
          <Trans>Bring a book</Trans>
          <br />
          <span className="text-brand-700">
            <Trans>into the world.</Trans>
          </span>
        </h1>

        <p className="mt-6 max-w-[46ch] text-[14.5px] leading-[1.7] text-muted-foreground">
          <Trans>ADT Studio turns a plain educational PDF into a finished, accessible edition, narrated, captioned, translated, and quiz-ready. Composed with care, every step on the record.</Trans>
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-5">
          <button
            type="button"
            onClick={onAddBook}
            className="group inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-[13.5px] font-semibold text-background transition-transform duration-200 hover:scale-[1.015] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Trans>Set your first book</Trans>
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
          <button
            type="button"
            onClick={onOpenSample}
            className="text-[13.5px] font-medium text-muted-foreground underline decoration-border underline-offset-[5px] transition-colors hover:text-foreground hover:decoration-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            <Trans>or read the sample edition</Trans>
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

      <div className="relative">
        <div className="mb-1 flex items-baseline justify-between border-b border-foreground/15 pb-3">
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-foreground">
            <Trans>The imprint</Trans>
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            <Trans>3 movements</Trans>
          </span>
        </div>
        <ol>
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 border-b border-border py-6 transition-colors hover:bg-brand-500/[0.03]"
            >
              <span className="text-[26px] font-bold leading-none text-brand-500/70 tabular-nums">{s.n}</span>
              <div>
                <div className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">{s.title}</div>
                <p className="mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <Trans>Automated Document Toolkit · every result versioned</Trans>
        </p>
      </div>
    </div>
  )
}
