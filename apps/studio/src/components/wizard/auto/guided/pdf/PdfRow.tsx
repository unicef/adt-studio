import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileUp, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePageThumb } from "../../../core/pdf/usePageThumb"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"
import type { RowLook } from "./options"
import { Cover, MUTED, PdfMeta } from "./parts"
import { PdfPages } from "./PdfPages"

const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]"
const OUTLINE_BUTTON =
  "group/btn flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium ring-1 ring-border transition-[background-color,box-shadow,transform] duration-150 hover:bg-[var(--lc-bubble)] hover:ring-brand-300 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:ring-border motion-reduce:transition-none max-sm:w-8 max-sm:justify-center max-sm:px-0"
const LINK = "rounded-sm font-medium text-brand-700 underline decoration-brand-200 underline-offset-4 transition-colors hover:decoration-brand-500 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"

/**
 * Opens and closes the row by its height (grid rows 0fr → 1fr) with a fade and a short slide, so
 * the steps and the page below glide instead of jumping. Closed, it can't take focus.
 */
function Reveal({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <div className={cn("grid transition-[grid-template-rows,opacity,margin] duration-500 motion-reduce:transition-none", EASE, shown ? "mb-4 grid-rows-[1fr] opacity-100" : "mb-0 grid-rows-[0fr] opacity-0")} inert={!shown} aria-hidden={!shown || undefined}>
      <div className="min-h-0 overflow-hidden">
        <div className={cn("transition-transform duration-500 motion-reduce:transition-none", EASE, shown ? "translate-y-0" : "-translate-y-2")}>{children}</div>
      </div>
    </div>
  )
}

function StripPage({ file, page, wide }: { file: File; page: number; wide?: boolean }) {
  const src = usePageThumb(file, page, 40)
  return (
    <span className={cn("grid h-10 w-[30px] place-items-center overflow-hidden rounded-[4px] bg-muted shadow-[0_3px_8px_-5px_rgba(15,23,42,0.5)] ring-1 ring-border transition-transform duration-200 group-hover/strip:-translate-y-0.5 motion-reduce:transition-none", wide && "max-sm:hidden")}>
      {src && <img src={src} alt="" className="size-full object-cover animate-in fade-in duration-300 motion-reduce:animate-none" />}
    </span>
  )
}

/**
 * The PDF as a row in the page, above the steps: what the book is (cover, name, pages, size), its
 * pages and Change PDF, always in view. `look` is the design being compared (dev lab). It opens
 * smoothly when a PDF is chosen and its content fades over when the PDF changes. `locked`: the
 * book is being saved, so the PDF can't change.
 */
export function PdfRow({ flow, locked, look = "plain" }: { flow: UploadFlow; locked: boolean; look?: RowLook }) {
  const { t } = useLingui()
  const [pagesOpen, setPagesOpen] = useState(false)
  const file = flow.file
  const lockedNote = locked ? t`The book is being set up, so its PDF can't change now.` : undefined
  const seePages = () => setPagesOpen(true)

  const name = (
    <div className="min-w-0 flex-1">
      <p className={cn("truncate font-semibold leading-tight", look === "compact" ? "text-[13.5px]" : "text-[14px]")}>{flow.title}</p>
      {look !== "compact" && (
        <p className={cn("text-[12.5px] tabular-nums", MUTED)}>
          <PdfMeta flow={flow} />
        </p>
      )}
    </div>
  )
  const changeButton = (
    <button type="button" onClick={flow.openPicker} disabled={locked} title={lockedNote} className={OUTLINE_BUTTON}>
      <FileUp className="size-3.5 text-brand-600 transition-transform duration-200 group-hover/btn:-translate-y-0.5 motion-reduce:transition-none" />
      <span className="max-sm:sr-only">
        <Trans>Change PDF</Trans>
      </span>
    </button>
  )

  let body: ReactNode = null
  if (file && look === "compact") {
    body = (
      <div className="flex items-center gap-2.5 text-[13px]">
        <Cover flow={flow} />
        {name}
        <span className={cn("shrink-0 tabular-nums max-sm:hidden", MUTED)}>
          <PdfMeta flow={flow} />
        </span>
        <span aria-hidden className="text-border max-sm:hidden">
          |
        </span>
        <button type="button" onClick={seePages} className={LINK}>
          <Trans>See pages</Trans>
        </button>
        <span aria-hidden className={MUTED}>
          ·
        </span>
        <button type="button" onClick={flow.openPicker} disabled={locked} title={lockedNote} className={LINK}>
          <Trans>Change PDF</Trans>
        </button>
      </div>
    )
  } else if (file && look === "strip") {
    const n = flow.pageCount
    const strip = [...new Set([1, Math.max(1, Math.ceil(n / 2)), Math.max(1, n)])].slice(0, n || 1)
    body = (
      <div className="flex items-center gap-3">
        {name}
        <button type="button" onClick={seePages} aria-label={t`See pages`} title={t`See pages`} className="group/strip flex shrink-0 items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-[var(--lc-bubble)]">
          {strip.map((p, i) => (
            <StripPage key={p} file={file} page={p} wide={i > 0} />
          ))}
          <LayoutGrid className="ml-0.5 size-3.5 text-brand-600" />
        </button>
        {changeButton}
      </div>
    )
  } else if (file) {
    body = (
      <div className={cn("flex items-center gap-3", look === "card" && "rounded-[16px] bg-[var(--lc-bubble)] px-3 py-2.5 shadow-[var(--lc-shadow)]")}>
        <Cover flow={flow} size="md" />
        {name}
        <button type="button" onClick={seePages} className={OUTLINE_BUTTON}>
          <LayoutGrid className="size-3.5 text-brand-600 transition-transform duration-200 group-hover/btn:scale-110 motion-reduce:transition-none" />
          <span className="max-sm:sr-only">
            <Trans>See pages</Trans>
          </span>
        </button>
        {changeButton}
      </div>
    )
  }

  return (
    <Reveal shown={!!file}>
      {/* A new PDF fades its own content in where the old one was. */}
      <div key={flow.fileKey} className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
        {body}
      </div>
      {file && <PdfPages file={file} title={flow.title} pageCount={flow.pageCount} open={pagesOpen} onClose={() => setPagesOpen(false)} onChange={() => { setPagesOpen(false); flow.openPicker() }} locked={locked} />}
    </Reveal>
  )
}
