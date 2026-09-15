import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertCircle, Check, Globe, Image, ShieldCheck, Video } from "lucide-react"
import type { AnyImportPreview } from "@/api/client"
import { isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import { cn } from "@/lib/utils"
import { Definition } from "./PreviewHeader"

const NOTICE_TONES = {
  info: {
    box: "border-brand-300/50 bg-brand-500/10 text-foreground",
    icon: "text-brand-600 dark:text-brand-400",
  },
  warning: {
    box: "border-amber-400/40 bg-amber-500/10 text-amber-900 dark:text-amber-100",
    icon: "text-amber-700 dark:text-amber-400",
  },
  success: {
    box: "border-emerald-400/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
    icon: "text-emerald-700 dark:text-emerald-400",
  },
} as const

function Notice({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: keyof typeof NOTICE_TONES
  icon: typeof AlertCircle
  title: ReactNode
  children: ReactNode
}) {
  const classes = NOTICE_TONES[tone]
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-4 py-3", classes.box)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", classes.icon)} />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-pretty opacity-85">{children}</p>
      </div>
    </div>
  )
}

function SeparateProjectNote() {
  return (
    <p className="flex items-center gap-2 text-xs leading-relaxed text-muted-foreground">
      <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span>
        <span className="font-medium text-foreground"><Trans>A separate project will be created.</Trans></span>{" "}
        <Trans>Existing projects stay unchanged.</Trans>
      </span>
    </p>
  )
}

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
        <Notice tone="info" icon={ShieldCheck} title={<Trans>A separate project will be created</Trans>}>
          <Trans>Work on these pages independently, then export the project to merge it back into the full book.</Trans>
        </Notice>
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
          <Notice tone="warning" icon={AlertCircle} title={<Trans>Export baseline unavailable</Trans>}>
            <Trans>This export does not include fingerprints that can prove whether its HTML changed. The published HTML becomes the working source, so review generated features after import.</Trans>
          </Notice>
        ) : preview.exportComparisonStatus === "changed" ? (
          <Notice tone="warning" icon={AlertCircle} title={<Trans>Changes since export detected</Trans>}>
            <Trans>This book differs from its ADT Studio export baseline. The imported HTML becomes the working source, so review generated features such as Speech after import.</Trans>
          </Notice>
        ) : (
          <Notice tone="success" icon={Check} title={<Trans>Ready to become a new project</Trans>}>
            <Trans>The imported HTML becomes the working source for editing and feature generation.</Trans>
          </Notice>
        )}
        <SeparateProjectNote />
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
      <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
        <p className="flex items-center gap-2"><Globe className="size-4 text-muted-foreground/70" />{authors || t`Author not listed`}</p>
        <p className="flex items-center gap-2 tabular-nums"><Image className="size-4 text-muted-foreground/70" /><Trans>{preview.imageCount} images</Trans></p>
        {preview.videoCount > 0 ? (
          <p className="flex items-center gap-2 tabular-nums"><Video className="size-4 text-muted-foreground/70" /><Trans>{preview.videoCount} videos</Trans></p>
        ) : null}
      </div>
      <SeparateProjectNote />
    </div>
  )
}
