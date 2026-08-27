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
      role="dialog"
      aria-modal="true"
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
          "pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-0.5rem)] flex-col overflow-hidden rounded-t-[2rem] bg-[#FFFEFA] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-slate-950 shadow-[0_-12px_50px_rgba(15,23,42,0.22)] ring-2 ring-sky-100",
          !reduceMotion &&
            "animate-in slide-in-from-bottom-full duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        )}
      >
        <div className="mx-auto mb-2 h-1.5 w-14 shrink-0 rounded-full bg-slate-300" />
        <div className="absolute right-3 top-3 z-30 [&_button]:focus-visible:ring-offset-2">
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
          className="min-h-0 overflow-y-auto px-1 pb-1 pt-3 focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-sky-500"
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
          <div className="mt-3 flex shrink-0 border-t-2 border-slate-100 pt-3">
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
    <div className="flex min-w-0 shrink-0 items-center gap-3 border-b-2 border-sky-100 pb-3 pr-14">
      <span
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem] shadow-[0_3px_0_#D9EBF8] ring-2 ring-sky-100"
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
          className="mt-0.5 text-balance text-lg font-black leading-tight text-slate-950"
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
  const tone = GROUP_TONE[group]
  const primaryActions = group === "reading" ? actions : []
  const tileActions = group === "reading" ? [] : actions

  return (
    <section
      className={cn(
        "mb-3 min-w-0 last:mb-0",
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
      {primaryActions.length > 0 ? (
        <div className="grid gap-2">
          {primaryActions.map((action) => (
            <ActionTile
              key={action.id}
              action={action}
              tone={tone.icon}
              reduceMotion={reduceMotion}
              wide
            />
          ))}
        </div>
      ) : null}
      {tileActions.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {tileActions.map((action) => (
            <ActionTile
              key={action.id}
              action={action}
              tone={tone.icon}
              reduceMotion={reduceMotion}
            />
          ))}
        </div>
      ) : null}
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
  reduceMotion,
  wide = false,
}: {
  action: KidsMenuAction
  tone: string
  reduceMotion: boolean
  wide?: boolean
}) {
  const portrait = action.id === "avatar"
  return (
    <button
      type="button"
      data-testid={action.testId}
      aria-pressed={action.toggle ? action.active : undefined}
      onClick={action.onSelect}
      disabled={action.disabled}
      data-action-layout={wide ? "primary" : "tile"}
      className={cn(
        "flex w-full items-center justify-center gap-1 rounded-2xl text-center shadow-[0_3px_0_#D9EBF8] ring-2 disabled:cursor-not-allowed disabled:opacity-45",
        wide
          ? "min-h-[4.5rem] flex-row px-4 py-3 text-left"
          : "min-h-[6.75rem] flex-col px-1.5 py-2.5",
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
          wide && "h-10 w-10 rounded-2xl",
          portrait && "h-11 w-11 overflow-hidden rounded-full",
          !portrait && tone,
        )}
      >
        {action.icon}
      </span>
      <span
        className={cn(
          "font-black leading-tight",
          wide ? "text-base" : "line-clamp-3 text-[0.72rem]",
        )}
      >
        {action.shortLabel}
      </span>
      {action.toggle ? (
        <span className="flex shrink-0 items-center justify-center">
          <span
            aria-hidden="true"
            className={cn(
              "relative h-4 w-7 shrink-0 rounded-full ring-1 ring-inset",
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
                action.active ? "translate-x-[0.875rem]" : "translate-x-0.5",
              )}
            />
          </span>
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
        "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-center text-xs font-bold leading-tight text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45",
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
