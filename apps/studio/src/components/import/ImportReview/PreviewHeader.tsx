import { Trans } from "@lingui/react/macro"
import { FileArchive, FileText, Scissors } from "lucide-react"
import type { AnyImportPreview } from "@/api/client"
import { isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import { cn } from "@/lib/utils"
import { previewCover, previewTitle } from "./helpers"

export function PreviewCover({ preview }: { preview: AnyImportPreview }) {
  const title = previewTitle(preview)
  const cover = previewCover(preview)

  return (
    <aside className="hidden min-h-[390px] flex-col items-center justify-center border-t border-slate-200 bg-slate-50/80 p-6 md:flex md:border-l md:border-t-0">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <Trans>Book cover</Trans>
      </p>
      {cover ? (
        <img
          src={cover.startsWith("data:") ? cover : `data:image/png;base64,${cover}`}
          alt={title}
          className="max-h-[285px] w-full max-w-[190px] rounded-md border border-slate-200 bg-white object-contain shadow-[0_16px_35px_-18px_rgba(15,23,42,0.45)]"
        />
      ) : (
        <div className="flex aspect-[3/4] w-full max-w-[190px] flex-col items-center justify-center gap-3 rounded-md border border-slate-200 bg-white text-center shadow-[0_16px_35px_-18px_rgba(15,23,42,0.35)]">
          <FileText className="h-9 w-9 text-slate-300" />
          <p className="max-w-[14ch] text-xs font-medium leading-relaxed text-slate-500">
            <Trans>No cover available</Trans>
          </p>
        </div>
      )}
      <p className="mt-4 max-w-[210px] text-center text-xs leading-relaxed text-slate-500">
        <Trans>Confirm that this is the publication you want to import.</Trans>
      </p>
    </aside>
  )
}


export function TypeBadge({ preview }: { preview: AnyImportPreview }) {
  if (isPartImportPreview(preview)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
        <Scissors className="h-3 w-3" />
        <Trans>Completed book part</Trans>
      </span>
    )
  }
  if (isAdtBundleImportPreview(preview)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
        <FileArchive className="h-3 w-3" />
        <Trans>Exported ADT</Trans>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
      <FileArchive className="h-3 w-3" />
      <Trans>Project backup</Trans>
    </span>
  )
}


export function Definition({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  )
}

