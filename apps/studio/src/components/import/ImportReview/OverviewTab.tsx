import { Trans, useLingui } from "@lingui/react/macro"
import { AlertCircle, Check, Globe, Image, ShieldCheck, Video } from "lucide-react"
import type { AnyImportPreview } from "@/api/client"
import { isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import { cn } from "@/lib/utils"
import { Definition } from "./PreviewHeader"

export function OverviewTab({ preview }: { preview: AnyImportPreview }) {
  const { t } = useLingui()

  if (isPartImportPreview(preview)) {
    const pageWindow = preview.range.endPage - preview.range.startPage + 1
    return (
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Definition label={<Trans>Pages in part</Trans>} value={pageWindow} />
          <Definition label={<Trans>Page range</Trans>} value={`${preview.range.startPage}–${preview.range.endPage}`} />
          <Definition label={<Trans>Original book</Trans>} value={preview.sourceLabel} />
        </dl>
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
          <div>
            <p className="text-sm font-semibold"><Trans>A separate project will be created</Trans></p>
            <p className="mt-1 text-xs leading-relaxed text-blue-900">
              <Trans>Work on these pages independently, then export the project to merge it back into the full book.</Trans>
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (isAdtBundleImportPreview(preview)) {
    return (
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Definition label={<Trans>Pages</Trans>} value={preview.pageCount} />
          <Definition label={<Trans>Source language</Trans>} value={preview.sourceLanguage.toUpperCase()} />
          <Definition
            label={<Trans>Output languages</Trans>}
            value={preview.outputLanguages.length > 0
              ? preview.outputLanguages.map((language) => language.toUpperCase()).join(", ")
              : t`None`}
          />
        </dl>
        {preview.exportComparisonStatus === "unavailable" ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold"><Trans>Export baseline unavailable</Trans></p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900">
                <Trans>This export does not include fingerprints that can prove whether its HTML changed. The published HTML becomes the working source, so review generated features after import.</Trans>
              </p>
            </div>
          </div>
        ) : preview.exportComparisonStatus === "changed" ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold"><Trans>Changes since export detected</Trans></p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900">
                <Trans>This book differs from its ADT Studio export baseline. The imported HTML becomes the working source, so review generated features such as Speech after import.</Trans>
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div>
              <p className="text-sm font-semibold"><Trans>Ready to become a new project</Trans></p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-900">
                <Trans>The imported HTML becomes the working source for editing and feature generation.</Trans>
              </p>
            </div>
          </div>
        )}
        <p className="flex items-center gap-2 text-xs leading-relaxed text-slate-600">
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>
            <span className="font-medium text-slate-800"><Trans>A separate project will be created.</Trans></span>{" "}
            <Trans>Existing projects stay unchanged.</Trans>
          </span>
        </p>
      </div>
    )
  }

  const authors = preview.authors.join(", ")
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Definition label={<Trans>Pages</Trans>} value={preview.pageCount || t`Not available`} />
        <Definition label={<Trans>Language</Trans>} value={preview.languageCode?.toUpperCase() ?? t`Not available`} />
        <Definition label={<Trans>Publisher</Trans>} value={preview.publisher ?? t`Not available`} />
      </dl>
      <div className="grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
        <p className="flex items-center gap-2"><Globe className="h-4 w-4 text-slate-400" />{authors || t`Author not listed`}</p>
        <p className="flex items-center gap-2"><Image className="h-4 w-4 text-slate-400" /><Trans>{preview.imageCount} images</Trans></p>
        {preview.videoCount > 0 ? (
          <p className="flex items-center gap-2"><Video className="h-4 w-4 text-slate-400" /><Trans>{preview.videoCount} videos</Trans></p>
        ) : null}
      </div>
      <p className="flex items-center gap-2 text-xs leading-relaxed text-slate-600">
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>
          <span className="font-medium text-slate-800"><Trans>A separate project will be created.</Trans></span>{" "}
          <Trans>Existing projects stay unchanged.</Trans>
        </span>
      </p>
    </div>
  )
}
