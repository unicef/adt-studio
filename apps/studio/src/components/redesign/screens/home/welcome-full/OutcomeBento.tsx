import { useLingui } from "@lingui/react/macro"
import { Trans } from "@lingui/react/macro"
import { Plus, ArrowRight, FolderInput, BookText, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { CATEGORIES } from "../welcome-variants/categories"
import type { WelcomeVariantProps } from "./DropZoneLauncher"

export function OutcomeBento({ onAddBook, onImport, onOpenDocs }: WelcomeVariantProps) {
  const { i18n } = useLingui()
  return (
    <div className="flex h-full flex-col justify-center px-10 py-10 lg:px-16">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-brand-600">
        <Trans>What every book gets</Trans>
      </div>
      <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.025em]">
        <Trans>Turn a PDF into an accessible edition.</Trans>
      </h1>
      <p className="mt-2 max-w-[56ch] text-[14px] leading-relaxed text-muted-foreground">
        <Trans>ADT runs the whole pipeline. You add the file, it does the rest, every step inspectable.</Trans>
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <button
          type="button"
          onClick={onAddBook}
          className="group relative flex flex-col justify-between overflow-hidden rounded-2xl p-5 text-left text-white shadow-lg transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:row-span-2"
          style={{ background: "linear-gradient(158deg, oklch(0.56 0.17 260), oklch(0.47 0.16 263))" }}
        >
          <span className="grid size-11 place-items-center rounded-xl bg-white/15 backdrop-blur-sm">
            <Plus className="size-6" />
          </span>
          <span>
            <span className="block text-[17px] font-semibold leading-tight">
              <Trans>Add your first book</Trans>
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-[12.5px] text-white/80">
              <Trans>Drop a PDF to begin</Trans>
              <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </span>
        </button>

        {CATEGORIES.map((c) => {
          const Icon = c.icon
          return (
            <div
              key={c.id}
              className={cn("flex flex-col gap-2.5 rounded-2xl border p-4 transition-transform duration-200 hover:-translate-y-0.5", c.tint.split(" ")[0])}
            >
              <span className={cn("grid size-9 place-items-center rounded-[10px] text-white", c.accentBg)}>
                <Icon className="size-[18px]" />
              </span>
              <div>
                <div className="text-[13.5px] font-semibold">{i18n._(c.label)}</div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{i18n._(c.tagline)}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        <span className="inline-flex items-center gap-1.5 text-stage-validation">
          <ShieldCheck className="size-4" />
          <span className="font-medium text-foreground">
            <Trans>WCAG-checked before every export</Trans>
          </span>
        </span>
        <span className="ml-auto flex items-center gap-4">
          <button
            type="button"
            onClick={onImport}
            className="inline-flex items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            <FolderInput className="size-3.5" />
            <Trans>Import a project</Trans>
          </button>
          <button
            type="button"
            onClick={onOpenDocs}
            className="inline-flex items-center gap-1.5 font-medium text-brand-700 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            <BookText className="size-3.5" />
            <Trans>Read the docs</Trans>
          </button>
        </span>
      </div>
    </div>
  )
}
