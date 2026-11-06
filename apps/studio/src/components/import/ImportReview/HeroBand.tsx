import { Trans } from "@lingui/react/macro"
import { AlertCircle, Check, FileArchive, FileText, FileUp, Scissors, TriangleAlert } from "lucide-react"
import type { AnyImportPreview } from "@/api/client"
import { isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn, formatBytes } from "@/lib/utils"
import { previewCover, previewTitle } from "./helpers"
import type { ReviewMode, Stat } from "./use-review-model"

function TypeBadge({ preview }: { preview: AnyImportPreview }) {
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

function StateBadge({ mode }: { mode: ReviewMode }) {
  if (mode === "repair") {
    return <Badge variant="destructive" className="gap-1.5 py-1 text-[11px]"><TriangleAlert className="size-3" /><Trans>Needs repair</Trans></Badge>
  }
  if (mode === "blocked") {
    return <Badge variant="destructive" className="gap-1.5 py-1 text-[11px]"><AlertCircle className="size-3" /><Trans>Can’t be imported</Trans></Badge>
  }
  if (mode === "activity") {
    return <Badge variant="warning" className="gap-1.5 py-1 text-[11px]"><AlertCircle className="size-3" /><Trans>Needs attention</Trans></Badge>
  }
  return <Badge variant="success" className="gap-1.5 py-1 text-[11px]"><Check className="size-3" /><Trans>Ready to import</Trans></Badge>
}

/** The top band of the review step: the book, the archive it came from, and
 * its key numbers. Gets denser on short windows. */
export function HeroBand({
  preview,
  file,
  mode,
  subtitle,
  stats,
  replaceDisabled,
  onReplace,
}: {
  preview: AnyImportPreview
  file: File
  mode: ReviewMode
  subtitle: string | null
  stats: Stat[]
  replaceDisabled: boolean
  onReplace: () => void
}) {
  const cover = previewCover(preview)
  const title = previewTitle(preview)
  return (
    <section className="flex shrink-0 flex-wrap items-center gap-x-7 gap-y-4 rounded-2xl border border-border bg-muted/50 px-6 py-5 [@media(max-height:960px)]:gap-x-5 [@media(max-height:960px)]:px-5 [@media(max-height:960px)]:py-3.5">
      {cover ? (
        <img
          src={cover.startsWith("data:") ? cover : `data:image/png;base64,${cover}`}
          alt={title}
          className="w-24 shrink-0 rounded-md bg-card object-contain shadow-[0_1px_2px_rgba(0,0,0,0.06),0_16px_35px_-18px_rgba(0,0,0,0.45)] outline outline-1 -outline-offset-1 outline-black/10 2xl:w-32 dark:outline-white/10 [@media(max-height:960px)]:w-[72px]"
        />
      ) : (
        <span className="grid aspect-[3/4] w-24 shrink-0 place-items-center rounded-md border border-dashed border-border bg-card text-muted-foreground [@media(max-height:960px)]:w-[72px]">
          <FileText aria-hidden="true" className="size-7" />
          <span className="sr-only"><Trans>No cover available</Trans></span>
        </span>
      )}
      <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap gap-2">
          <TypeBadge preview={preview} />
          <StateBadge mode={mode} />
        </div>
        <h2 title={title} className="line-clamp-2 break-words text-[28px] font-semibold leading-tight tracking-[-0.5px] text-foreground 2xl:text-[34px] [@media(max-height:960px)]:text-2xl">{title}</h2>
        {subtitle ? <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-1 flex max-w-md items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-card text-muted-foreground">
            <FileArchive aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-foreground">{file.name}</span>
            <span className="block text-[11px] tabular-nums text-muted-foreground">{formatBytes(file.size)}</span>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onReplace} disabled={replaceDisabled} className="h-8 shrink-0 px-3 text-xs">
            <FileUp className="size-3.5" />
            <Trans>Replace archive</Trans>
          </Button>
        </div>
      </div>
      <dl className="flex flex-wrap">
        {stats.map((stat, index) => (
          <div key={stat.label} className={cn("flex flex-col-reverse px-5 2xl:px-8", index > 0 ? "border-l border-border" : "pl-0")}>
            <dt className="mt-1.5 whitespace-nowrap text-[13px] text-muted-foreground">{stat.label}</dt>
            <dd className={cn(
              "font-semibold leading-none tracking-[-1px] tabular-nums text-foreground",
              stat.long ? "max-w-[14rem] truncate text-2xl" : "text-[40px] 2xl:text-5xl [@media(max-height:960px)]:text-[30px]",
            )}>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
