import type { MessageDescriptor } from "@lingui/core"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { FileText, FileUp, LayoutGrid, Pencil } from "lucide-react"
import { cn, formatBytes } from "@/lib/utils"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"
import type { ScreenId } from "../check/screens"

/** One pick the user made on Check: the screen it was made on, its name and the answer in words. */
export type PdfPick = { screen: ScreenId; title: MessageDescriptor; value: string }

/** What every PDF placement gets from the flow. `locked`: the book is being set up, so the PDF can't change and picks can't be edited. */
export type PdfProps = { flow: UploadFlow; picks: PdfPick[]; onEdit: ((screen: ScreenId) => void) | null; locked: boolean }

export const MUTED = "text-muted-foreground"
/** A quiet action: a soft pill that tints on hover and presses in. */
export const PANEL_BUTTON =
  "group/btn flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-muted/70 px-3 text-[13px] font-medium transition-[background-color,transform] duration-150 hover:bg-brand-50 hover:text-brand-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-muted/70 disabled:hover:text-current disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100"

export function Cover({ flow, size = "sm" }: { flow: UploadFlow; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden bg-muted ring-1 ring-border",
        size === "lg" ? "h-14 w-[42px] rounded-[6px] shadow-[0_6px_14px_-8px_rgba(15,23,42,0.5)]" : size === "md" ? "h-10 w-[30px] rounded-[5px] shadow-[0_4px_10px_-6px_rgba(15,23,42,0.45)]" : "h-6 w-[18px] rounded-[4px]",
      )}
    >
      {flow.cover ? <img key={flow.cover} src={flow.cover} alt="" className="size-full object-cover animate-in fade-in duration-300 motion-reduce:animate-none" /> : <FileText className={cn(size === "sm" ? "size-3" : "size-4", MUTED)} />}
    </span>
  )
}

/** "100 pages · 2.4 MB" */
export function PdfMeta({ flow }: { flow: UploadFlow }) {
  return (
    <>
      {flow.pageCount > 0 && <Plural value={flow.pageCount} one="# page" other="# pages" />}
      {flow.file && <> · {formatBytes(flow.file.size)}</>}
    </>
  )
}

/** The PDF's actions: its pages, and another PDF (off while the book is being set up). */
export function PdfActions({ flow, locked, onSeePages, onDone, className }: { flow: UploadFlow; locked: boolean; onSeePages: () => void; onDone?: () => void; className?: string }) {
  const { t } = useLingui()
  return (
    <div className={cn("flex gap-2", className)}>
      <button
        type="button"
        className={PANEL_BUTTON}
        onClick={() => {
          onDone?.()
          onSeePages()
        }}
      >
        <LayoutGrid className="size-3.5 text-brand-600 transition-transform duration-200 group-hover/btn:scale-110 motion-reduce:transition-none" />
        <Trans>See pages</Trans>
      </button>
      <button
        type="button"
        className={PANEL_BUTTON}
        disabled={locked}
        title={locked ? t`The book is being set up, so its PDF can't change now.` : undefined}
        onClick={() => {
          onDone?.()
          flow.openPicker()
        }}
      >
        <FileUp className="size-3.5 text-brand-600 transition-transform duration-200 group-hover/btn:-translate-y-0.5 motion-reduce:transition-none" />
        <Trans>Change PDF</Trans>
      </button>
    </div>
  )
}

/** The picks so far as rows (name, answer); each opens its Check screen again while that's possible. */
export function PickList({ picks, onEdit, onDone, shown = true }: { picks: PdfPick[]; onEdit: ((screen: ScreenId) => void) | null; onDone?: () => void; shown?: boolean }) {
  const { t, i18n } = useLingui()
  if (!picks.length) return null
  return (
    <div>
      <p className={cn("mb-1 text-[11.5px] font-semibold uppercase tracking-wide", MUTED)}>
        <Trans>Your picks</Trans>
      </p>
      <ul className="flex flex-col">
        {picks.map((p, i) => {
          const title = i18n._(p.title)
          const row = (
            <>
              <span className={cn("w-[42%] shrink-0 text-[13px]", MUTED)}>{title}</span>
              <span className="min-w-0 flex-1 text-[13.5px] font-medium">{p.value}</span>
            </>
          )
          return (
            <li key={p.screen} className={cn("transition-[opacity,transform] duration-300 motion-reduce:transition-none", shown ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0")} style={{ transitionDelay: shown ? `${180 + i * 40}ms` : "0ms" }}>
              {onEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    onDone?.()
                    onEdit(p.screen)
                  }}
                  aria-label={t`Change ${title}: ${p.value}`}
                  className="group/pick -mx-2 flex w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  {row}
                  <Pencil aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand-600 opacity-60 transition-opacity duration-200 group-hover/pick:opacity-100 group-focus-visible/pick:opacity-100 motion-reduce:transition-none" />
                </button>
              ) : (
                <div className="flex items-start gap-2 py-1.5">{row}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The PDF in full: big cover, name, pages and size, its actions, and the picks. */
export function PdfDetails({ flow, picks, onEdit, locked, onSeePages, onDone, shown = true, stacked = false }: PdfProps & { onSeePages: () => void; onDone?: () => void; shown?: boolean; stacked?: boolean }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Cover flow={flow} size="lg" />
        <div className="min-w-0">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{flow.title}</p>
          <p className={cn("text-[12.5px] tabular-nums", MUTED)}>
            <PdfMeta flow={flow} />
          </p>
        </div>
      </div>
      <PdfActions flow={flow} locked={locked} onSeePages={onSeePages} onDone={onDone} className={cn("mt-3.5", stacked && "flex-col [&>button]:flex-none")} />
      {picks.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <PickList picks={picks} onEdit={locked ? null : onEdit} onDone={onDone} shown={shown} />
        </div>
      )}
    </>
  )
}
