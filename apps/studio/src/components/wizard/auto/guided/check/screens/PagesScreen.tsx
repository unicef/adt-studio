import { useState, type CSSProperties } from "react"
import { useStore } from "@tanstack/react-form"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { FileText, Scissors } from "lucide-react"
import { Collapsible } from "@/components/ui/collapsible"
import { PageRangeField } from "@/components/ui/page-range-field"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { getPresetAccent } from "../../../../core/constants"
import { SCOPE_LINK } from "../../../../core/fields/ScopeField"
import { usePageThumb } from "../../../../core/pdf/usePageThumb"
import { useWizardForm } from "../../../../core/wizardForm"

/**
 * A chosen end of the range, large enough to tell the pages apart. The frame takes the page's own
 * shape (read from the rendered image), so a landscape book gets landscape frames instead of a strip
 * inside a portrait box; it is portrait until the first image has loaded.
 */
function EndPage({ file, page, label }: { file: File | null; page: number; label: string }) {
  const src = usePageThumb(file, page, 220)
  const [ratio, setRatio] = useState(3 / 4)
  return (
    <figure className="flex shrink-0 flex-col items-center gap-1.5">
      {/* Height fits the window (the step's squeeze) but stays short enough that a wide page keeps to
          about a third of the row, so two of them leave the slider room; the width follows the page.
          Only the width eases: the height is measured at once by the window fit. */}
      <span
        style={{ "--page-ratio": ratio } as CSSProperties}
        className="grid h-(--thumb-h) w-[calc(var(--thumb-h)*var(--page-ratio))] [--thumb-h:min(max(92px,calc(clamp(120px,calc(var(--gd-vh,1vh)*19),180px)-var(--gd-squeeze,0px))),calc(30cqw/var(--page-ratio)))] place-items-center overflow-hidden rounded-[6px] bg-muted shadow-[0_8px_20px_-10px_rgba(15,23,42,0.4)] ring-1 ring-border transition-[width] duration-200 ease-out"
      >
        {src ? (
          <img
            key={src}
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget
              if (w > 0 && h > 0) setRatio(w / h)
            }}
            className="size-full object-contain animate-in fade-in duration-200"
          />
        ) : (
          <FileText aria-hidden className="size-5 text-muted-foreground/60" />
        )}
      </span>
      <figcaption className="text-[12px] font-semibold tabular-nums text-muted-foreground">
        {label} <Trans>p. {page}</Trans>
      </figcaption>
    </figure>
  )
}

/**
 * Screen · Pages to convert: the page picker is out from the start. The pages chosen in large type,
 * with From / To inputs beside it (as in the wizard), and the first and last pages either side of
 * a slider. Every page until the user moves them; Split sits underneath for sharing the work. The
 * assistant's line above suggests a few pages for a large book.
 */
export function PagesScreen({ pageCount }: { pageCount: number }) {
  const { t } = useLingui()
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const scope = useStore(form.store, (s) => s.values.scope)
  const total = Math.max(1, pageCount)
  const ranged = scope === "range"
  const startPage = parseInt(useStore(form.store, (s) => s.values.startPage))
  const endPage = parseInt(useStore(form.store, (s) => s.values.endPage))
  const start = ranged ? Math.min(total, Math.max(1, startPage || 1)) : 1
  const end = ranged ? Math.min(total, Math.max(start, endPage || total)) : total
  const count = end - start + 1
  const split = scope === "split"
  const whole = !split && count === total

  // Moving either end picks a range; the whole book again is simply every page.
  const setRange = (a: number, b: number) => {
    const lo = Math.max(1, Math.min(a, b, total))
    const hi = Math.min(total, Math.max(a, b, 1))
    form.setFieldValue("startPage", String(lo))
    form.setFieldValue("endPage", String(hi))
    form.setFieldValue("scope", lo === 1 && hi === total ? "whole" : "range")
  }
  const setScope = (next: "whole" | "split") => {
    form.setFieldValue("scope", next)
    form.setFieldValue("startPage", "1")
    form.setFieldValue("endPage", String(total))
  }

  return (
    <div className="lc-surface flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[14px] text-muted-foreground">
            <Trans>This PDF has {pageCount} pages.</Trans>
          </span>
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[22px] font-semibold leading-tight tracking-[-0.01em] lg:text-[26px]">
              {split ? <Trans>Split into parts</Trans> : whole ? <Trans>All {pageCount} pages</Trans> : <Trans>Pages {start}–{end}</Trans>}
            </span>
            {split ? (
              <button type="button" onClick={() => setScope("whole")} className={cn("shrink-0 text-[13.5px]", SCOPE_LINK)}>
                <Trans>Convert it here instead</Trans>
              </button>
            ) : (
              !whole && (
                <button type="button" onClick={() => setScope("whole")} className={cn("shrink-0 text-[13.5px]", SCOPE_LINK)}>
                  <Trans>Use all pages</Trans>
                </button>
              )
            )}
          </span>
        </div>
        {/* From / To, as in the wizard. Typing one end past the other moves the other along with it. */}
        {!split && (
          <div className="w-full sm:w-[340px]">
            <PageRangeField value={[start, end]} min={1} max={total} onChange={([a, b]) => (a !== start ? setRange(a, Math.max(a, b)) : setRange(Math.min(a, b), b))} />
          </div>
        )}
      </div>

      <Collapsible shown={!split}>
        <div inert={split} className="flex flex-col gap-3">
          {/* The range as the pages themselves: the first and last chosen page either side of the slider. */}
          <div className="@container flex items-center gap-3 rounded-2xl bg-muted/40 p-3 sm:gap-5 sm:px-5">
            <EndPage file={file} page={start} label={t`From`} />
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <Slider aria-label={t`Pages to convert`} min={1} max={total} step={1} minStepsBetweenThumbs={0} value={[start, end]} onValueChange={([a, b]) => setRange(a!, b!)} color={getPresetAccent(null).bg} />
              <span className="text-[12.5px] font-medium tabular-nums text-muted-foreground">
                <Plural value={count} one="# page" other="# pages" />
              </span>
            </div>
            <EndPage file={file} page={end} label={t`To`} />
          </div>
        </div>
      </Collapsible>

      <Collapsible shown={split}>
        <p inert={!split} className="flex gap-2 rounded-xl bg-muted/60 px-3 py-2 text-[13px] leading-relaxed text-muted-foreground">
          <Scissors aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />
          <Trans>Extraction is skipped now. After the book is created, use the Split & merge panel on its overview to export page-range parts and merge the completed results back.</Trans>
        </p>
      </Collapsible>

      {!split && (
        <p className="text-[12.5px] text-muted-foreground">
          <Trans>
            Several people converting this book together?{" "}
            <button type="button" onClick={() => setScope("split")} className={SCOPE_LINK}>
              Split it into parts
            </button>{" "}
            so each person converts some of the pages.
          </Trans>
        </p>
      )}
    </div>
  )
}
