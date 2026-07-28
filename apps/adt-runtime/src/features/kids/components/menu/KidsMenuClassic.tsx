import { ChevronDown } from "lucide-react"
import { useEffect, useState } from "react"
import {
  KidsActionButton,
  type KidsActionTone,
} from "@/features/kids/components/KidsActionButton"
import { KidsBuddyImage } from "@/features/kids/components/KidsBuddyImage"
import { KidsDialogClose } from "@/features/kids/components/kids-dialogs"
import { KidsSpeedSlider } from "@/features/kids/components/KidsSpeedSlider"
import type { KidsSpeed } from "@/features/kids/components/KidsSpeedControl"
import {
  actionsInGroup,
  type KidsMenuGroup,
  type KidsMenuProps,
} from "@/features/kids/components/menu/kids-menu-model"
import { KIDS_SCROLLBAR_CLASS } from "@/features/kids/lib/kids-styles"
import { cn } from "@/shared/lib/utils"

const GROUP_TONE: Record<KidsMenuGroup, KidsActionTone> = {
  reading: "reading",
  look: "look",
  mine: "mine",
  footer: "quiet",
}

const GROUP_TITLE_TONE: Record<KidsActionTone, string> = {
  reading: "text-sky-800",
  look: "text-violet-800",
  mine: "text-emerald-800",
  quiet: "text-slate-600",
}

/**
 * Grouped two-column popover — the current shipped design.
 */
export function KidsMenuClassic({
  model,
  panelRef,
  panelCloseRef,
  reduceMotion,
}: KidsMenuProps) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const moreBelow = useScrollHint(scroller)
  const footer = actionsInGroup(model, "footer")

  return (
    <div
      ref={panelRef}
      data-testid="kids-buddy-panel"
      role="region"
      aria-labelledby="kids-buddy-panel-message"
      tabIndex={-1}
      className={cn(
        "relative mb-1 flex flex-col overflow-visible rounded-[2rem] bg-white p-3 text-slate-950 shadow-2xl ring-2 ring-sky-100",
        "w-[min(26rem,calc(100vw-2rem))] md:w-[min(44rem,calc(100vw-2.5rem))]",
        "max-h-[min(calc(100vh-7.75rem),46rem)]",
        reduceMotion ? "transition-none" : "transition-all duration-200 ease-out",
        !reduceMotion && "animate-kidsPanelOpen",
        "after:absolute after:-bottom-2 after:right-8 after:h-5 after:w-5 after:rotate-45 after:border-b-2 after:border-r-2 after:border-sky-100 after:bg-white",
      )}
    >
      <div className="relative z-10 flex shrink-0 items-start justify-between gap-3 px-1.5 pb-2 pt-0.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-[0_2px_0_#C4DFF2] ring-2 ring-white"
            style={{ backgroundColor: model.buddyBackground }}
            aria-hidden="true"
          >
            <KidsBuddyImage
              images={model.buddyImages}
              variant="happy"
              title={model.buddyName}
              className="h-11 w-11"
            />
          </span>
          <h2
            id="kids-buddy-panel-message"
            data-testid="kids-buddy-panel-message"
            aria-live="polite"
            className="text-balance text-2xl font-black leading-tight text-slate-950"
          >
            {model.message}
          </h2>
        </div>
        <KidsDialogClose
          buttonRef={panelCloseRef}
          label={model.closeLabel}
          onClick={model.close}
        />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div
          ref={setScroller}
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-1.5 pb-1",
            KIDS_SCROLLBAR_CLASS,
            "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sky-700",
          )}
          role="region"
          aria-label={model.regionLabel}
          tabIndex={0}
        >
          {model.groups.map((group) => {
            const actions = actionsInGroup(model, group.id)
            const withSpeed = group.id === "reading" && model.showSpeed
            if (!actions.length && !withSpeed) return null
            const tone = GROUP_TONE[group.id]
            return (
              <section key={group.id} className="flex flex-col gap-1.5">
                <h3
                  className={cn(
                    "px-1 text-sm font-black uppercase leading-none tracking-[0.12em]",
                    GROUP_TITLE_TONE[tone],
                  )}
                >
                  {group.title}
                </h3>
                <div
                  className={cn(
                    "grid grid-cols-1 gap-1.5 md:grid-cols-2",
                    "md:[&>*:last-child:nth-child(odd)]:col-span-2",
                  )}
                >
                  {actions.map((action) => (
                    <div
                      key={action.id}
                      className={cn(action.id === "read" && "md:col-span-2")}
                    >
                      <KidsActionButton
                        testId={action.testId}
                        variant="list"
                        tone={tone}
                        iconPlain={action.id === "avatar"}
                        icon={action.icon}
                        label={action.label}
                        onClick={action.onSelect}
                        disabled={action.disabled}
                        active={action.active}
                        toggle={action.toggle}
                        onLabel={model.onLabel}
                        offLabel={model.offLabel}
                        reduceMotion={reduceMotion}
                      />
                    </div>
                  ))}
                  {withSpeed ? (
                    <div className="md:col-span-2">
                      <KidsSpeedSlider
                        speed={model.speed}
                        onChange={(speed) =>
                          model.setSpeed(speed as KidsSpeed)
                        }
                        groupLabel={model.speedLabels.group}
                        slowLabel={model.speedLabels.slow}
                        normalLabel={model.speedLabels.normal}
                        fastLabel={model.speedLabels.fast}
                        reduceMotion={reduceMotion}
                      />
                    </div>
                  ) : null}
                </div>
              </section>
            )
          })}
        </div>

        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-gradient-to-t from-white via-white/85 to-transparent",
            "transition-opacity duration-200 ease-out",
            moreBelow ? "opacity-100" : "opacity-0",
          )}
        >
          <span className="mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 shadow-sm">
            <ChevronDown className="h-5 w-5" />
          </span>
        </div>
      </div>

      {footer.length ? (
        <div className="relative z-10 mt-2 shrink-0 border-t-2 border-sky-50 px-1.5 pt-2">
          {footer.map((action) => (
            <KidsActionButton
              key={action.id}
              testId={action.testId}
              variant="list"
              quiet
              icon={action.icon}
              label={action.label}
              onClick={action.onSelect}
              reduceMotion={reduceMotion}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Reports whether the scroller still has content below the fold, so the panel
 * can show a fade + chevron. Without it the list simply clips mid-card and a
 * young reader has no way to know the rest of the menu exists.
 */
function useScrollHint(element: HTMLDivElement | null) {
  const [moreBelow, setMoreBelow] = useState(false)

  useEffect(() => {
    if (!element) {
      setMoreBelow(false)
      return
    }
    const update = () => {
      setMoreBelow(
        element.scrollHeight - element.clientHeight - element.scrollTop > 8,
      )
    }
    update()
    element.addEventListener("scroll", update, { passive: true })
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)
    observer?.observe(element)
    return () => {
      element.removeEventListener("scroll", update)
      observer?.disconnect()
    }
  }, [element])

  return moreBelow
}
