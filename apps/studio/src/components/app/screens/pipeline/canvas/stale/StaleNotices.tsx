import type { ReactNode } from "react"
import { AlertTriangle, ArrowRight, Loader2, RefreshCw } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { cn } from "@/lib/utils"
import { StageRerunButton } from "@/components/app/screens/pipeline/runs/StageRerunButton"
import type { StaleNotice } from "./useStaleNotice"

type ButtonLook = "solid" | "outline" | "quiet"

const LOOK: Record<ButtonLook, string> = {
  solid: "h-7 rounded-full bg-foreground px-3.5 text-[12px] font-semibold text-background hover:scale-[1.02] active:scale-95",
  outline: "h-8 rounded-lg border px-2.5 text-[13px] font-medium text-foreground hover:bg-muted",
  quiet: "h-8 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
}

function useCopy(notice: StaleNotice) {
  const { t } = useLingui()
  const count = notice.outdatedIds.length
  const others = count - (notice.pageOutdated ? 1 : 0)
  const pageNumber = notice.page?.pageNumber ?? 0
  return {
    count,
    others,
    countLabel: t`${plural(count, { one: "# page out of date", other: "# pages out of date" })}`,
    othersLabel: t`${plural(others, { one: "# other page out of date", other: "# other pages out of date" })}`,
    pageTitle: t`Page ${pageNumber} is out of date`,
    pageReason: t`Sectioning changed after it was built.`,
    bookReason: t`Sectioning changed after they were built.`,
    rebuildingPage: t`Rebuilding page ${pageNumber}…`,
    rebuildingMany: t`${plural(notice.rebuildingCount, { one: "Rebuilding # page…", other: "Rebuilding # pages…" })}`,
  }
}

function ActionButton({
  look,
  onClick,
  disabledReason,
  busy,
  icon,
  label,
  title,
}: {
  look: ButtonLook
  onClick: () => void
  disabledReason?: string | null
  busy?: boolean
  icon?: ReactNode
  label: ReactNode
  title?: string
}) {
  const disabled = !!disabledReason || busy
  return (
    <button
      type="button"
      onClick={() => !disabled && onClick()}
      aria-disabled={disabled || undefined}
      title={disabledReason ?? title}
      className={cn(
        "flex shrink-0 items-center gap-1.5 transition-[background-color,color,scale,opacity] duration-150 motion-reduce:transition-none",
        LOOK[look],
        disabled && "cursor-default opacity-60 hover:scale-100",
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : icon}
      {label}
    </button>
  )
}

function RebuildPage({ notice, look }: { notice: StaleNotice; look: ButtonLook }) {
  if (!notice.page) return null
  const pageId = notice.page.pageId
  return (
    <ActionButton
      look={look}
      onClick={() => notice.rebuild.rebuild([pageId])}
      disabledReason={notice.rebuild.disabledReason}
      busy={notice.pageRebuilding}
      icon={<RefreshCw className="size-3.5" />}
      label={<Trans>Rebuild page</Trans>}
    />
  )
}

function RebuildAll({ notice, look }: { notice: StaleNotice; look: ButtonLook }) {
  const { t } = useLingui()
  const count = notice.outdatedIds.length
  return (
    <ActionButton
      look={look}
      onClick={() => notice.rebuild.rebuild(notice.outdatedIds)}
      disabledReason={notice.rebuild.disabledReason}
      busy={notice.rebuildingCount === count}
      icon={<RefreshCw className="size-3.5" />}
      label={t`Rebuild all ${count}`}
      title={t`Rebuild the ${count} out-of-date pages, and leave the rest of the storyboard as it is`}
    />
  )
}

function NextPage({ notice, look }: { notice: StaleNotice; look: ButtonLook }) {
  const { t } = useLingui()
  const nextId = notice.nextId
  if (!nextId) return null
  return (
    <ActionButton
      look={look}
      onClick={() => notice.onSelectPage(nextId)}
      icon={<ArrowRight className="size-3.5" />}
      label={<Trans>Next</Trans>}
      title={t`Go to the next out-of-date page`}
    />
  )
}

function StatusIcon({ busy, className }: { busy: boolean; className?: string }) {
  return busy ? (
    <Loader2 className={cn("animate-spin motion-reduce:animate-none", className)} />
  ) : (
    <AlertTriangle className={className} />
  )
}

export function StalePageChip({ notice }: { notice: StaleNotice }) {
  const copy = useCopy(notice)
  if (!notice.pageOutdated) return null
  return (
    <div className="relative z-10 -mb-[70px] flex justify-center pt-3">
      <div
        role="status"
        className="flex w-fit items-center gap-3 rounded-full border bg-card/95 p-1 shadow-[0_14px_36px_-16px_rgba(0,0,0,0.45)] backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <StatusIcon busy={notice.pageRebuilding} className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col pr-1 leading-tight">
          <span className="text-[12.5px] font-medium">{notice.pageRebuilding ? copy.rebuildingPage : copy.pageTitle}</span>
          <span className="text-[11px] text-muted-foreground">{copy.pageReason}</span>
        </span>
        <RebuildPage notice={notice} look="solid" />
      </div>
    </div>
  )
}

function PopoverRow({ busy, title, detail, children }: { busy: boolean; title: ReactNode; detail: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          <StatusIcon busy={busy} className="size-3.5" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-semibold">{title}</span>
          <span className="text-[12px] leading-snug text-muted-foreground">{detail}</span>
        </div>
      </div>
      <div className="flex justify-end gap-1">{children}</div>
    </div>
  )
}

export function StalePopoverBody({ notice }: { notice: StaleNotice }) {
  const copy = useCopy(notice)
  if (copy.count === 0) {
    return (
      <PopoverRow
        busy={false}
        title={<Trans>The storyboard is out of date</Trans>}
        detail={<Trans>Sectioning changed after these pages were built. Re-run Storyboard to rebuild them.</Trans>}
      >
        <StageRerunButton slug="storyboard" rerun={notice.rerun} variant="topbar" />
      </PopoverRow>
    )
  }
  const othersBusy = !notice.pageOutdated && notice.rebuildingCount > 0
  return (
    <>
      {notice.pageOutdated && (
        <PopoverRow busy={notice.pageRebuilding} title={notice.pageRebuilding ? copy.rebuildingPage : copy.pageTitle} detail={copy.pageReason}>
          <RebuildPage notice={notice} look="outline" />
        </PopoverRow>
      )}
      {copy.others > 0 && (
        <>
          {notice.pageOutdated && <div className="-mx-3.5 border-t" />}
          <PopoverRow
            busy={othersBusy}
            title={othersBusy ? copy.rebuildingMany : notice.pageOutdated ? copy.othersLabel : copy.countLabel}
            detail={copy.bookReason}
          >
            <NextPage notice={notice} look="quiet" />
            <RebuildAll notice={notice} look="outline" />
          </PopoverRow>
        </>
      )}
    </>
  )
}
