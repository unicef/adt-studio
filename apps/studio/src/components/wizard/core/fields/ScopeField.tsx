import type { ReactNode } from "react"
import { useStore } from "@tanstack/react-form"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { FileText, Scissors, SlidersHorizontal } from "lucide-react"
import { Collapsible } from "@/components/ui/collapsible"
import { Slider } from "@/components/ui/slider"
import { getPresetAccent } from "@/components/wizard/core/constants"
import { usePdfField } from "@/components/wizard/core/fields/PdfField"
import { useWizardForm, type WizardFormValues } from "@/components/wizard/core/wizardForm"
import { cn } from "@/lib/utils"
import { usePageThumb } from "../pdf/usePageThumb"

type Scope = WizardFormValues["scope"]

/** The scope a book will be processed with, in words: every page, a range, or split into parts. */
export function useScopeSummary(numPages: number): ReactNode {
  const form = useWizardForm()
  const scope = useStore(form.store, (s) => s.values.scope)
  const start = parseInt(useStore(form.store, (s) => s.values.startPage)) || 1
  const end = parseInt(useStore(form.store, (s) => s.values.endPage)) || numPages
  if (scope === "range" && (start > 1 || end < numPages))
    return (
      <Trans>
        Pages {start}–{end} of {numPages}
      </Trans>
    )
  if (scope === "split") return <Trans>{numPages} pages, split into parts</Trans>
  return <Trans>{numPages} pages</Trans>
}

function useScope() {
  const form = useWizardForm()
  const scope = useStore(form.store, (s) => s.values.scope)
  const { totalPages } = usePdfField()
  const start = parseInt(useStore(form.store, (s) => s.values.startPage)) || 1
  const end = parseInt(useStore(form.store, (s) => s.values.endPage)) || totalPages || 1
  const setScope = (next: Scope) => {
    form.setFieldValue("scope", next)
    if (next === "whole" && totalPages) {
      form.setFieldValue("startPage", "1")
      form.setFieldValue("endPage", String(totalPages))
    }
  }
  const setRange = (a: number, b: number) => {
    form.setFieldValue("startPage", String(a))
    form.setFieldValue("endPage", String(b))
  }
  return { form, scope, totalPages, start, end, setScope, setRange }
}

function SplitNote({ shown }: { shown: boolean }) {
  return (
    <Collapsible shown={shown}>
      <p inert={!shown} className="mt-1 rounded-xl bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <Trans>Extraction is skipped now. After the book is created, use the Split & merge panel on its overview to export page-range parts and merge the completed results back.</Trans>
      </p>
    </Collapsible>
  )
}

function RangeReveal({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <Collapsible shown={shown}>
      <div inert={!shown} className="pt-1">
        {children}
      </div>
    </Collapsible>
  )
}

const LINK = "font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 transition-colors hover:text-brand-800"

function Layer({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <div inert={!shown} className={cn("col-start-1 row-start-1 flex min-w-0 items-center gap-2 transition-[opacity,filter] duration-200", shown ? "opacity-100" : "pointer-events-none opacity-0 blur-[2px]")}>
      {children}
    </div>
  )
}

function PageThumb({ file, page }: { file: File | null; page: number }) {
  const src = usePageThumb(file, page)
  return (
    <div className="flex w-[64px] shrink-0 flex-col items-center gap-1">
      <div className="grid h-[84px] w-[64px] place-items-center overflow-hidden rounded-[5px] bg-muted shadow-[0_4px_12px_-6px_rgba(15,23,42,0.35)] ring-1 ring-border">
        {src ? <img key={src} src={src} alt="" className="max-h-full max-w-full animate-in fade-in duration-200" /> : <FileText className="size-4 text-muted-foreground/60" />}
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
        <Trans>p. {page}</Trans>
      </span>
    </div>
  )
}

/** The range as the pages themselves: the first and last chosen page either side of the slider. */
function VisualRange() {
  const { t } = useLingui()
  const { form, totalPages, start, end, setRange } = useScope()
  const file = useStore(form.store, (s) => s.values.file)
  const count = end - start + 1
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted/40 p-3">
      <PageThumb file={file} page={start} />
      <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
        <Slider aria-label={t`Pages to convert`} min={1} max={totalPages || 1} step={1} minStepsBetweenThumbs={0} value={[start, end]} onValueChange={([a, b]) => setRange(a, b)} color={getPresetAccent(null).bg} />
        <span className="text-[12px] font-medium text-muted-foreground">
          <Plural value={count} one="# page" other="# pages" />
        </span>
      </div>
      <PageThumb file={file} page={end} />
    </div>
  )
}

/**
 * How much of the book to convert (the wizard's step 1 "Scope"). The whole book is the default and
 * the only thing shown; "Choose pages" opens a slider flanked by the first and last chosen page, and
 * Split sits underneath as a quieter option for sharing the work.
 */
export function ScopeField({ className }: { className?: string }) {
  const { scope, totalPages, start, end, setScope } = useScope()
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="grid text-[13.5px]">
        <Layer shown={scope === "whole"}>
          <FileText className="size-4 shrink-0 text-brand-600" />
          <span className="font-medium">{totalPages > 0 ? <Plural value={totalPages} one="The page will be converted" other="All # pages will be converted" /> : <Trans>Counting pages…</Trans>}</span>
          <button type="button" onClick={() => setScope("range")} className={cn("ml-auto shrink-0", LINK)}>
            <Trans>Choose pages</Trans>
          </button>
        </Layer>
        <Layer shown={scope === "range"}>
          <SlidersHorizontal className="size-4 shrink-0 text-brand-600" />
          <span className="font-medium">
            <Trans>
              Pages {start}–{end}
            </Trans>
          </span>
          <button type="button" onClick={() => setScope("whole")} className={cn("ml-auto shrink-0", LINK)}>
            <Trans>Use all pages</Trans>
          </button>
        </Layer>
        <Layer shown={scope === "split"}>
          <Scissors className="size-4 shrink-0 text-brand-600" />
          <span className="font-medium">
            <Trans>Split into parts</Trans>
          </span>
          <button type="button" onClick={() => setScope("whole")} className={cn("ml-auto shrink-0", LINK)}>
            <Trans>Convert it here instead</Trans>
          </button>
        </Layer>
      </div>
      <RangeReveal shown={scope === "range"}><VisualRange /></RangeReveal>
      <SplitNote shown={scope === "split"} />
      <Collapsible shown={scope !== "split"}>
        <p inert={scope === "split"} className="pt-1 text-[12px] text-muted-foreground">
          <Trans>
            Sharing the work with others?{" "}
            <button type="button" onClick={() => setScope("split")} className={LINK}>
              Split into parts
            </button>
          </Trans>
        </p>
      </Collapsible>
    </div>
  )
}
