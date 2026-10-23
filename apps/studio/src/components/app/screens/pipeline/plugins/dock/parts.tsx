import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { Loader2, Plus } from "lucide-react"
import { getStageDescriptionI18n, getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { SKIN, rowEnterClassName, stagger, suggestedRowClassName } from "./style"

const STATUS_TEXT = {
  running: "text-sky-700 dark:text-sky-300",
  error: "text-red-700 dark:text-red-300",
  review: "text-amber-700 dark:text-amber-300",
  done: "text-zinc-500 dark:text-zinc-400",
  quiet: "text-zinc-500 dark:text-zinc-400",
}

export function Status({ item }: { item: DockItem }) {
  const { t } = useLingui()
  const [label, dot, kind, spin] =
    item.state === "running" || item.state === "queued"
      ? [t`Running`, "bg-sky-500", "running" as const, true]
      : item.state === "error"
        ? [t`Failed`, "bg-red-500", "error" as const, false]
        : item.state === "done" && item.pending > 0
          ? [t`${plural(item.pending, { one: "# to review", other: "# to review" })}`, "bg-amber-500", "review" as const, false]
          : item.state === "done"
            ? [t`Ready`, "bg-emerald-500", "done" as const, false]
            : item.state === "locked"
              ? [t`Not available yet`, "bg-zinc-400", "quiet" as const, false]
              : [t`Not run`, "bg-zinc-300 dark:bg-zinc-600", "quiet" as const, false]
  return (
    <span className={cn("flex items-center gap-1.5 text-[11.5px]", STATUS_TEXT[kind])}>
      {spin ? <Loader2 className="size-3 animate-spin motion-reduce:animate-none" /> : <span className={cn("size-1.5 rounded-full", dot)} />}
      {label}
    </span>
  )
}

export function Badge({ items, attention = false }: { items: DockItem[]; attention?: boolean }) {
  const failed = items.some((item) => item.state === "error")
  const running = items.some((item) => item.state === "running" || item.state === "queued")
  const review = attention || items.some((item) => item.pending > 0)
  if (!failed && !running && !review) return null
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-[var(--dock-surface)]",
        failed ? "bg-red-500" : running ? "animate-pulse bg-sky-500 motion-reduce:animate-none" : "bg-amber-500",
      )}
    />
  )
}

export function NextChip() {
  return (
    <span className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-1.5 py-px text-[9px] font-bold uppercase leading-[13px] tracking-[0.06em] text-white shadow-[0_2px_6px_-1px_rgba(37,99,235,0.6)] ring-2 ring-[var(--dock-surface)] animate-in fade-in zoom-in-75 duration-300 motion-reduce:animate-none">
      <Trans>Next</Trans>
    </span>
  )
}

const rowClassName =
  "group/row flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-[background-color,box-shadow] duration-150 ease-out active:scale-[0.98]"

const noticeClassName = "truncate text-[11.5px] font-medium text-amber-700 dark:text-amber-300"

export interface StepRowProps {
  item: DockItem
  index: number
  here: boolean
  suggested: boolean
  notice: string | undefined
  explain?: boolean
  essential?: boolean
  onClick: () => void
}

function EssentialBadge({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-px text-[9.5px] font-bold uppercase leading-[14px] tracking-[0.06em]",
        done ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-800 dark:text-amber-200",
      )}
    >
      <Trans>Essential</Trans>
    </span>
  )
}

function Description({ slug }: { slug: string }) {
  const description = getStageDescriptionI18n(slug)
  if (!description) return null
  return <span className={cn("line-clamp-2 text-[11.5px] leading-snug", SKIN.muted)}>{description}</span>
}

export function StepRow({ item, index, here, suggested, notice, explain = false, essential = false, onClick }: StepRowProps) {
  return (
    <button
      type="button"
      aria-current={here ? "page" : undefined}
      onClick={onClick}
      title={getStageDescriptionI18n(item.slug) ?? undefined}
      style={stagger(index)}
      className={cn(rowClassName, explain && "items-start", essential && "col-span-2", here ? SKIN.rowHere : SKIN.row, suggested && suggestedRowClassName, rowEnterClassName)}
    >
      <span
        className="relative grid size-8 shrink-0 place-items-center rounded-[10px] transition-transform duration-200 ease-out group-hover/row:scale-105 motion-reduce:transition-none"
        style={{ background: `color-mix(in srgb, ${item.hex} var(--dock-chip), transparent)` }}
      >
        <item.icon className="size-4" strokeWidth={1.9} style={{ color: item.hex }} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn("truncate text-[13px] font-medium", SKIN.strong)}>{getStageLabelI18n(item.slug)}</span>
          {essential && <EssentialBadge done={item.state === "done"} />}
        </span>
        {explain && <Description slug={item.slug} />}
        {notice ? (
          <span className={noticeClassName} title={notice}>
            {notice}
          </span>
        ) : here ? (
          <span className="text-[11.5px] font-medium" style={{ color: item.hex }}>
            <Trans>You're here</Trans>
          </span>
        ) : suggested ? (
          <span className="text-[11.5px] font-medium text-brand-700 dark:text-brand-300">
            <Trans>Suggested next</Trans>
          </span>
        ) : (
          <Status item={item} />
        )}
      </span>
    </button>
  )
}

export function AddRow({ item, index, suggested, notice, explain = false, essential = false, onClick }: Omit<StepRowProps, "here">) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={stagger(index)}
      className={cn(
        rowClassName,
        explain && "items-start",
        essential
          ? "col-span-2 bg-amber-500/[0.06] ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/[0.1] dark:bg-amber-400/[0.08] dark:ring-amber-400/30"
          : SKIN.row,
        !essential && suggested && suggestedRowClassName,
        rowEnterClassName,
      )}
    >
      <NotInBookIcon item={item} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn("truncate text-[13px] font-medium", SKIN.strong)}>{getStageLabelI18n(item.slug)}</span>
          {essential && <EssentialBadge done={false} />}
        </span>
        {explain && <Description slug={item.slug} />}
        {essential ? (
          <>
            <span className="text-[11.5px] font-medium text-amber-700 dark:text-amber-300">
              <Trans>Not in the book yet. Screen-reader users won't know what the pictures show.</Trans>
            </span>
            <span className="mt-1.5 flex h-7 items-center gap-1 self-start rounded-[9px] bg-brand-600 px-2.5 text-[12px] font-semibold text-white transition-colors duration-150 group-hover/row:bg-brand-700">
              <Plus className="size-3.5" strokeWidth={2.5} />
              <Trans>Add to book</Trans>
            </span>
          </>
        ) : suggested ? (
          <span className="text-[11.5px] font-medium text-brand-700 dark:text-brand-300">
            <Trans>Suggested next</Trans>
          </span>
        ) : notice ? (
          <span className={noticeClassName} title={notice}>
            {notice}
          </span>
        ) : (
          <span className={cn("text-[11.5px]", SKIN.muted)}>
            <Trans>Not in the book yet</Trans>
          </span>
        )}
      </span>
    </button>
  )
}

export function NotInBookIcon({ item, size = "row" }: { item: DockItem; size?: "row" | "tab" }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center border border-dashed transition-transform duration-200 ease-out motion-reduce:transition-none",
        size === "row" ? "size-8 rounded-[10px] group-hover/row:scale-105" : "size-8 rounded-[10px]",
      )}
      style={{ borderColor: `color-mix(in srgb, ${item.hex} 45%, transparent)` }}
    >
      <item.icon className="size-4" strokeWidth={1.9} style={{ color: item.hex }} />
      <span className="absolute -right-1.5 -bottom-1.5 grid size-4 place-items-center rounded-full bg-[var(--dock-surface)] ring-1 ring-zinc-950/10 dark:ring-white/15">
        <Plus className="size-2.5" strokeWidth={2.75} style={{ color: item.hex }} />
      </span>
    </span>
  )
}
