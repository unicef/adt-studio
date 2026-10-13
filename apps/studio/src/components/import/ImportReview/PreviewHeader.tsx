import { Trans } from "@lingui/react/macro"
import { FileArchive, FileText, Scissors } from "lucide-react"
import type { AnyImportPreview } from "@/api/client"
import { isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { previewCover, previewTitle } from "./helpers"

export function PreviewCover({ preview }: { preview: AnyImportPreview }) {
  const title = previewTitle(preview)
  const cover = previewCover(preview)

  return (
    <aside className="hidden min-h-[390px] flex-col items-center justify-center border-t border-border bg-muted/40 p-6 md:flex md:border-l md:border-t-0">
      <p className="mb-3 flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <span className="h-px w-6 shrink-0 bg-current opacity-50" />
        <Trans>Book cover</Trans>
      </p>
      {cover ? (
        <img
          src={cover.startsWith("data:") ? cover : `data:image/png;base64,${cover}`}
          alt={title}
          className="max-h-[285px] w-full max-w-[190px] rounded-md bg-card object-contain shadow-[0_1px_2px_rgba(0,0,0,0.06),0_16px_35px_-18px_rgba(0,0,0,0.45)] outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
        />
      ) : (
        <div className="flex aspect-[3/4] w-full max-w-[190px] flex-col items-center justify-center gap-3 rounded-md border border-border bg-gradient-to-br from-muted to-muted/60 text-center shadow-md">
          <FileText className="size-9 text-muted-foreground/60" />
          <p className="max-w-[14ch] text-xs font-medium leading-relaxed text-muted-foreground">
            <Trans>No cover available</Trans>
          </p>
        </div>
      )}
      <p className="mt-4 max-w-[210px] text-center text-xs leading-relaxed text-muted-foreground text-pretty">
        <Trans>Confirm that this is the publication you want to import.</Trans>
      </p>
    </aside>
  )
}


export function TypeBadge({ preview }: { preview: AnyImportPreview }) {
  if (isPartImportPreview(preview)) {
    return (
      <Badge className="gap-1.5 border-indigo-200 bg-indigo-50 py-1 text-[11px] text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/40">
        <Scissors className="size-3" />
        <Trans>Completed book part</Trans>
      </Badge>
    )
  }
  if (isAdtBundleImportPreview(preview)) {
    return (
      <Badge className="gap-1.5 border-violet-200 bg-violet-50 py-1 text-[11px] text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/40">
        <FileArchive className="size-3" />
        <Trans>Exported ADT</Trans>
      </Badge>
    )
  }
  return (
    <Badge variant="info" className="gap-1.5 py-1 text-[11px]">
      <FileArchive className="size-3" />
      <Trans>Project backup</Trans>
    </Badge>
  )
}


export function Definition({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  )
}
