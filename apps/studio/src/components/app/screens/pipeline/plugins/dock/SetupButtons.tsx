import { Fragment } from "react"
import { useLingui } from "@lingui/react/macro"
import { ChevronRight } from "lucide-react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { InBookTile } from "./InBookTile"
import { StatusBadge } from "./StoryboardEntry"
import { SKIN, tabFocusClassName } from "./style"

export interface SetupButtonsProps {
  foundations: DockItem[]
  look: "tile" | "attached" | "path"
  activeSlug: string | null | undefined
  previewing: string | null
  onPill?: boolean
  register: (key: string) => (element: HTMLElement | null) => void
  onGo: (slug: string) => void
  showCard: (item: DockItem, element: HTMLElement, via?: "focus" | "pointer") => void
  hideTip: () => void
}

export function SetupButtons({ foundations, look, activeSlug, previewing, onPill = false, register, onGo, showCard, hideTip }: SetupButtonsProps) {
  const { t } = useLingui()
  const stateOf = (item: DockItem) =>
    item.state === "done" ? t`done` : item.state === "running" || item.state === "queued" ? t`running` : item.state === "error" ? t`needs attention` : t`not run yet`

  const buttons = foundations.map((item) => {
    const here = item.slug === activeSlug
    const name = getStageLabelI18n(item.slug)
    const problem = item.state === "error"
    const running = item.state === "running" || item.state === "queued"
    return (
      <button
        key={item.slug}
        ref={register(item.slug)}
        type="button"
        aria-current={here ? "page" : undefined}
        aria-label={t`${name}, ${stateOf(item)}`}
        onClick={() => onGo(item.slug)}
        onPointerEnter={(event) => showCard(item, event.currentTarget)}
        onFocus={(event) => showCard(item, event.currentTarget, "focus")}
        onPointerLeave={hideTip}
        onBlur={hideTip}
        data-preview={previewing === item.slug || undefined}
        style={{ ["--tint" as string]: item.hex }}
        className={cn(
          "group/tab relative grid shrink-0 cursor-pointer place-items-center outline-none",
          "transition-[background-color,scale] duration-200 ease-out active:scale-[0.94] motion-reduce:transition-none",
          tabFocusClassName,
          look === "tile" ? "size-12 rounded-[16px]" : look === "path" ? "size-10 rounded-[13px]" : "size-10 rounded-[12px]",
          look === "attached" && !here && "hover:bg-[color-mix(in_srgb,var(--tint)_14%,transparent)]",
          look === "attached" && onPill && !here && "hover:bg-black/12",
        )}
      >
        {look === "tile" && !here ? (
          <InBookTile item={item} attention={false} />
        ) : look === "path" && !here ? (
          <span className="relative grid size-7 place-items-center rounded-[9px] bg-[color-mix(in_srgb,var(--tint)_12%,transparent)] transition-colors duration-200 group-hover/tab:bg-[var(--tint)] motion-reduce:transition-none">
            <item.icon aria-hidden className="size-4 text-[var(--tint)] transition-colors duration-200 group-hover/tab:text-white motion-reduce:transition-none" strokeWidth={2} />
            {problem && <StatusBadge status="problem" />}
            {running && <StatusBadge status="building" />}
          </span>
        ) : (
          <span className="relative grid place-items-center">
            <item.icon
              aria-hidden
              className="size-[18px] transition-colors duration-200"
              strokeWidth={2}
              style={{ color: here || onPill ? "#ffffff" : item.hex }}
            />
            {problem && <StatusBadge status="problem" />}
            {running && <StatusBadge status="building" />}
          </span>
        )}
      </button>
    )
  })

  if (look === "attached")
    return (
      <div role="group" aria-label={t`Setup`} className="flex shrink-0 items-center gap-0.5 pr-1">
        <span aria-hidden className={cn("mr-1 h-5 w-px shrink-0", onPill ? "bg-white/30" : "bg-zinc-950/[0.08] dark:bg-white/[0.08]")} />
        {buttons}
      </div>
    )
  if (look === "path")
    return (
      <div role="group" aria-label={t`Setup`} className="flex shrink-0 items-center gap-1">
        {buttons.map((button, index) => (
          <Fragment key={foundations[index]?.slug}>
            {button}
            <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 opacity-70", SKIN.muted)} strokeWidth={2.25} />
          </Fragment>
        ))}
      </div>
    )
  return (
    <div role="group" aria-label={t`Setup`} className="flex shrink-0 items-center gap-1.5">
      {buttons}
    </div>
  )
}
