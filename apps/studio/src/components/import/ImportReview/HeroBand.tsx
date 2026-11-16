import { Trans } from "@lingui/react/macro"
import { AlertCircle, Check, FileArchive, FileText, FileUp, Scissors, TriangleAlert } from "lucide-react"
import type { AnyImportPreview } from "@/api/client"
import { isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn, formatBytes } from "@/lib/utils"
import type { ReviewMode, Stat } from "./use-review-model"

export type ArchiveKind = "part" | "adt" | "backup"

export function archiveKind(preview: AnyImportPreview): ArchiveKind {
  if (isPartImportPreview(preview)) return "part"
  if (isAdtBundleImportPreview(preview)) return "adt"
  return "backup"
}

/** The archive type, as quiet text: the state badge beside it is the one
 * thing in the band that should catch the eye. */
function TypeLabel({ kind }: { kind: ArchiveKind }) {
  const Icon = kind === "part" ? Scissors : FileArchive
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon aria-hidden="true" className="size-3.5" />
      {kind === "part" ? <Trans>Completed book part</Trans> : kind === "adt" ? <Trans>Exported ADT</Trans> : <Trans>Project backup</Trans>}
    </span>
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

/** Title size steps down as the title grows, so a long one still fits in two
 * lines instead of being clipped at display size. */
const longTitleClass = "text-xl 2xl:text-2xl [@media(max-height:960px)]:text-lg"
const mediumTitleClass = "text-2xl 2xl:text-[28px] [@media(max-height:960px)]:text-xl"
const shortTitleClass = "text-[28px] 2xl:text-[32px] [@media(max-height:960px)]:text-2xl"

function titleSize(title: string): string {
  if (title.length > 70) return longTitleClass
  if (title.length > 32) return mediumTitleClass
  return shortTitleClass
}

/** The top band of the review step: the book, the archive it came from, and
 * its key numbers. Gets denser on short windows. */
export function HeroBand({
  kind,
  cover,
  title,
  file,
  mode,
  subtitle,
  stats,
  replaceDisabled,
  onReplace,
}: {
  kind: ArchiveKind
  cover: string | null
  /** Null when the archive's title couldn't be read; the band says so. */
  title: string | null
  file: File
  mode: ReviewMode
  subtitle: string | null
  stats: Stat[]
  replaceDisabled: boolean
  onReplace: () => void
}) {
  return (
    <section className="flex shrink-0 flex-wrap items-center gap-x-7 gap-y-4 rounded-2xl border border-border bg-muted/50 px-6 py-5 [@media(max-height:960px)]:gap-x-5 [@media(max-height:960px)]:px-5 [@media(max-height:960px)]:py-3.5">
      {cover ? (
        <img
          src={cover.startsWith("data:") ? cover : `data:image/png;base64,${cover}`}
          alt={title ?? ""}
          className="w-24 shrink-0 rounded-md bg-card object-contain shadow-[0_1px_2px_rgba(0,0,0,0.06),0_16px_35px_-18px_rgba(0,0,0,0.45)] outline outline-1 -outline-offset-1 outline-black/10 2xl:w-28 dark:outline-white/10 [@media(max-height:960px)]:w-[72px]"
        />
      ) : (
        <span className="grid aspect-[3/4] w-24 shrink-0 place-items-center rounded-md border border-dashed border-border bg-card text-muted-foreground [@media(max-height:960px)]:w-[72px]">
          <FileText aria-hidden="true" className="size-7" />
          <span className="sr-only"><Trans>No cover available</Trans></span>
        </span>
      )}
      <div className="flex min-w-[22rem] flex-[2_1_22rem] flex-col gap-1 2xl:min-w-[26rem]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <TypeLabel kind={kind} />
          <StateBadge mode={mode} />
        </div>
        {title ? (
          <h2 title={title} className={cn("mt-0.5 line-clamp-2 text-pretty break-words font-semibold leading-tight tracking-[-0.5px] text-foreground", titleSize(title))}>{title}</h2>
        ) : (
          <h2 className="mt-0.5 text-[28px] font-semibold leading-tight tracking-[-0.5px] text-muted-foreground 2xl:text-[32px] [@media(max-height:960px)]:text-2xl">
            <Trans>Title couldn’t be read</Trans>
          </h2>
        )}
        {subtitle ? <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p> : null}
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <FileArchive aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate" title={file.name}>{file.name}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0 tabular-nums">{formatBytes(file.size)}</span>
          <span aria-hidden="true">·</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={onReplace}
            disabled={replaceDisabled}
            className="h-auto shrink-0 gap-1 p-0 text-xs font-medium"
          >
            <FileUp aria-hidden="true" className="size-3.5" />
            <Trans>Replace archive</Trans>
          </Button>
        </div>
      </div>
      <dl className="flex flex-wrap">
        {stats.map((stat, index) => (
          <div key={stat.label} className={cn("flex flex-col-reverse px-4 2xl:px-5", index > 0 ? "border-l border-border" : "pl-0")}>
            <dt className="mt-1 max-w-[9rem] text-balance text-xs leading-snug text-muted-foreground">{stat.label}</dt>
            <dd className={cn(
              "font-semibold leading-none tracking-[-1px] tabular-nums text-foreground",
              stat.long ? "max-w-[14rem] truncate text-xl" : "text-[28px] [@media(max-height:960px)]:text-2xl",
            )}>
              {stat.value === null ? (
                <span className="text-muted-foreground/60">
                  <span aria-hidden="true">—</span>
                  <span className="sr-only"><Trans>Couldn’t be read</Trans></span>
                </span>
              ) : stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
