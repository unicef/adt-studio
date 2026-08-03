import { ChevronLeft, ChevronRight } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { KidsBuddyImage } from "@/features/kids/components/KidsBuddyImage"
import { KidsDialogClose } from "@/features/kids/components/kids-dialogs"
import { KidsSpeedControl } from "@/features/kids/components/KidsSpeedControl"
import {
  actionsInGroup,
  type KidsMenuAction,
  type KidsMenuGroup,
  type KidsMenuProps,
} from "@/features/kids/components/menu/kids-menu-model"
import { cn } from "@/shared/lib/utils"

const GROUP_TONE: Record<KidsMenuGroup, { heading: string; icon: string }> = {
  reading: { heading: "text-sky-800", icon: "bg-sky-100 text-sky-800" },
  look: { heading: "text-violet-800", icon: "bg-violet-100 text-violet-800" },
  mine: {
    heading: "text-emerald-800",
    icon: "bg-emerald-100 text-emerald-800",
  },
  footer: { heading: "text-slate-600", icon: "bg-slate-100 text-slate-700" },
}

const GROUP_DELAYS = ["delay-75", "delay-150", "delay-[225ms]"]
const FOCUS_RING =
  "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500 focus-visible:ring-offset-2"

/** Touch-friendly bottom sheet for mobile viewports. */
export function KidsMenuShelf({
  model,
  panelRef,
  panelCloseRef,
  reduceMotion,
}: KidsMenuProps) {
  const footer = actionsInGroup(model, "footer")
  const visibleGroups = model.groups.filter((group) => {
    if (group.id === "footer") return false
    return (
      actionsInGroup(model, group.id).length > 0 ||
      (group.id === "reading" && model.showSpeed)
    )
  })

  return (
    <div
      ref={panelRef}
      data-testid="kids-buddy-panel"
      data-menu-layout="bottom-sheet"
      role="region"
      aria-labelledby="kids-buddy-panel-message"
      tabIndex={-1}
      className="pointer-events-none fixed inset-0 z-[70]"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={model.closeLabel}
        onClick={model.close}
        className={cn(
          "pointer-events-auto absolute inset-0 cursor-default bg-slate-950/25",
          reduceMotion ? "transition-none" : "animate-in fade-in duration-200",
        )}
      />

      <div
        className={cn(
          "pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-0.5rem)] flex-col overflow-hidden rounded-t-[2rem] bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-slate-950 shadow-[0_-12px_50px_rgba(15,23,42,0.22)] ring-2 ring-sky-100 sm:px-5 lg:px-7 lg:pb-5 lg:pt-5",
          !reduceMotion &&
            "animate-in slide-in-from-bottom-full duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        )}
      >
        <div className="mx-auto mb-2 h-1.5 w-14 shrink-0 rounded-full bg-slate-300 lg:hidden" />
        <div className="absolute right-3 top-3 z-30 [&_button]:focus-visible:ring-offset-2 sm:right-5 lg:right-7 lg:top-5">
          <KidsDialogClose
            buttonRef={panelCloseRef}
            label={model.closeLabel}
            onClick={model.close}
          />
        </div>

        <BuddyMessage model={model} />

        <div
          role="region"
          aria-label={model.regionLabel}
          tabIndex={0}
          className="min-h-0 overflow-y-auto px-1 pb-1 pt-3 focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-sky-500 xl:grid xl:grid-cols-3 xl:gap-4 xl:overflow-visible xl:px-0 xl:pt-4"
        >
          {visibleGroups.map((group, index) => (
            <ActionGroup
              key={group.id}
              group={group.id}
              title={group.title}
              actions={actionsInGroup(model, group.id)}
              model={model}
              showSpeed={group.id === "reading" && model.showSpeed}
              reduceMotion={reduceMotion}
              delayClass={GROUP_DELAYS[index] ?? "delay-[225ms]"}
            />
          ))}
        </div>

        {footer.length ? (
          <div className="mt-3 flex shrink-0 flex-wrap justify-end gap-2 border-t-2 border-slate-100 pt-3">
            {footer.map((action) => (
              <FooterAction
                key={action.id}
                action={action}
                reduceMotion={reduceMotion}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function BuddyMessage({ model }: { model: KidsMenuProps["model"] }) {
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-3 border-b-2 border-sky-100 pb-3 pr-14 lg:gap-4 lg:pr-16">
      <span
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem] shadow-[0_3px_0_#D9EBF8] ring-2 ring-sky-100 lg:h-20 lg:w-20"
        style={{ backgroundColor: model.buddyBackground }}
        aria-hidden="true"
      >
        <KidsBuddyImage
          images={model.buddyImages}
          variant="happy"
          title={model.buddyName}
          className="h-[92%] w-[92%]"
        />
      </span>
      <div className="min-w-0 max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-sky-800">
          {model.buddyName}
        </p>
        <h2
          id="kids-buddy-panel-message"
          data-testid="kids-buddy-panel-message"
          aria-live="polite"
          className="mt-0.5 text-balance text-lg font-black leading-tight text-slate-950 lg:text-xl"
        >
          {model.message}
        </h2>
      </div>
    </div>
  )
}

function ActionGroup({
  group,
  title,
  actions,
  model,
  showSpeed,
  reduceMotion,
  delayClass,
}: {
  group: KidsMenuGroup
  title: string
  actions: KidsMenuAction[]
  model: KidsMenuProps["model"]
  showSpeed: boolean
  reduceMotion: boolean
  delayClass: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollState, setScrollState] = useState({
    overflows: false,
    atStart: true,
    atEnd: true,
  })
  const tone = GROUP_TONE[group]

  const measure = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const overflows = scroller.scrollWidth > scroller.clientWidth + 4
    setScrollState({
      overflows,
      atStart: !overflows || scroller.scrollLeft <= 4,
      atEnd:
        !overflows ||
        scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft <= 4,
    })
  }, [])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    measure()
    scroller.addEventListener("scroll", measure, { passive: true })
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure)
    observer?.observe(scroller)
    Array.from(scroller.children).forEach((child) => observer?.observe(child))
    return () => {
      scroller.removeEventListener("scroll", measure)
      observer?.disconnect()
    }
  }, [measure, actions.length, showSpeed])

  const page = (direction: -1 | 1) => {
    const scroller = scrollerRef.current
    scroller?.scrollBy({
      left: direction * Math.max(220, scroller.clientWidth * 0.72),
      behavior: reduceMotion ? "auto" : "smooth",
    })
  }

  return (
    <section
      className={cn(
        "mb-3 min-w-0 last:mb-0 xl:mb-0 xl:rounded-2xl xl:bg-slate-50/70 xl:p-3 xl:ring-1 xl:ring-sky-100",
        !reduceMotion &&
          "animate-in slide-in-from-bottom-4 fade-in fill-mode-backwards duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        !reduceMotion && delayClass,
      )}
    >
      <h3
        className={cn(
          "mb-1.5 text-xs font-black uppercase tracking-[0.12em]",
          tone.heading,
        )}
      >
        {title}
      </h3>
      <div className="flex min-w-0 items-center gap-1.5">
        {scrollState.overflows ? (
          <div className="flex w-11 shrink-0 items-center justify-center xl:hidden">
            {!scrollState.atStart ? (
              <PagingButton
                direction="previous"
                label={`${title}: ${model.previousLabel}`}
                onClick={() => page(-1)}
              />
            ) : null}
          </div>
        ) : null}
        <div
          ref={scrollerRef}
          className={cn(
            "flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "xl:grid xl:grid-cols-[repeat(2,minmax(0,1fr))] xl:overflow-visible",
            "xl:[&>*:last-child:nth-child(odd)]:col-span-2",
          )}
        >
          {actions.map((action) => (
            <ActionTile
              key={action.id}
              action={action}
              tone={tone.icon}
              onLabel={model.onLabel}
              offLabel={model.offLabel}
              reduceMotion={reduceMotion}
            />
          ))}
        </div>
        {scrollState.overflows ? (
          <div className="flex w-11 shrink-0 items-center justify-center xl:hidden">
            {!scrollState.atEnd ? (
              <PagingButton
                direction="next"
                label={`${title}: ${model.nextLabel}`}
                onClick={() => page(1)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {showSpeed ? (
        <div className="mt-2 w-full min-w-0">
          <KidsSpeedControl
            speed={model.speed}
            onChange={model.setSpeed}
            groupLabel={model.speedLabels.group}
            slowLabel={model.speedLabels.slow}
            normalLabel={model.speedLabels.normal}
            fastLabel={model.speedLabels.fast}
            reduceMotion={reduceMotion}
          />
        </div>
      ) : null}
    </section>
  )
}

function ActionTile({
  action,
  tone,
  onLabel,
  offLabel,
  reduceMotion,
}: {
  action: KidsMenuAction
  tone: string
  onLabel: string
  offLabel: string
  reduceMotion: boolean
}) {
  return (
    <button
      type="button"
      data-testid={action.testId}
      aria-pressed={action.toggle ? action.active : undefined}
      onClick={action.onSelect}
      disabled={action.disabled}
      className={cn(
        "flex h-[5.75rem] w-[6.5rem] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center shadow-[0_3px_0_#D9EBF8] ring-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-[7.25rem] xl:h-full xl:min-h-[5.75rem] xl:w-auto xl:min-w-0 xl:shrink xl:self-stretch",
        FOCUS_RING,
        action.active
          ? "bg-[#FFF6D6] text-slate-950 ring-[#FFC800]"
          : "bg-white text-slate-900 ring-sky-100 hover:bg-sky-50",
        reduceMotion
          ? "transition-none"
          : "transition-[transform,background-color,box-shadow] duration-150 ease-out active:translate-y-0.5 active:shadow-none",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-xl [&_svg]:h-6 [&_svg]:w-6",
          tone,
        )}
      >
        {action.icon}
      </span>
      <span className="line-clamp-2 text-xs font-black leading-tight">
        {action.shortLabel}
      </span>
      {action.toggle ? (
        <span className="flex items-center gap-1.5 text-[0.65rem] font-black leading-none text-slate-700">
          <span
            aria-hidden="true"
            className={cn(
              "relative h-4 w-8 rounded-full ring-1 ring-inset",
              action.active
                ? "bg-[#FFC800] ring-[#B88E00]"
                : "bg-slate-300 ring-slate-400",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm",
                !reduceMotion &&
                  "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                action.active ? "translate-x-[1.125rem]" : "translate-x-0.5",
              )}
            />
          </span>
          <span>{action.active ? onLabel : offLabel}</span>
        </span>
      ) : null}
    </button>
  )
}

function FooterAction({
  action,
  reduceMotion,
}: {
  action: KidsMenuAction
  reduceMotion: boolean
}) {
  return (
    <button
      type="button"
      data-testid={action.testId}
      onClick={action.onSelect}
      disabled={action.disabled}
      className={cn(
        "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-center text-xs font-bold leading-tight text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45",
        FOCUS_RING,
        reduceMotion
          ? "transition-none"
          : "transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]",
      )}
    >
      <span aria-hidden="true" className="shrink-0">
        {action.icon}
      </span>
      <span>{action.label}</span>
    </button>
  )
}

function PagingButton({
  direction,
  label,
  onClick,
}: {
  direction: "previous" | "next"
  label: string
  onClick: () => void
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-800 shadow-sm hover:bg-sky-200 xl:hidden",
        FOCUS_RING,
      )}
    >
      <Icon className="h-7 w-7" aria-hidden="true" />
    </button>
  )
}
