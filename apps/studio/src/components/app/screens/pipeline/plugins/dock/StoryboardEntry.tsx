import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { Check, ChevronRight, LayoutGrid, Loader2, RefreshCw } from "lucide-react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import { STORYBOARD_HEX } from "@/components/app/screens/pipeline/shared/plugins"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { SKIN, tabFocusClassName } from "./style"

export type StoryboardStatus = "ready" | "building" | "failed" | "outdated"

export function highlightStyle(hex: string): CSSProperties {
  return {
    backgroundColor: hex,
    backgroundImage: "linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0))",
  }
}


export interface CollapseMotion {
  duration: number
  easing: string
  target?: ReactNode
}

const glyphClassName = "absolute -right-2 -bottom-1.5 grid size-[15px] place-items-center rounded-full ring-[1.5px] ring-[var(--dock-surface)]"

export function StatusBadge({ status }: { status: StoryboardStatus | "problem" }) {
  if (status === "ready") return null
  if (status === "building")
    return (
      <span aria-hidden className={cn(glyphClassName, "bg-sky-600 text-white")}>
        <Loader2 className="size-2.5 animate-spin motion-reduce:animate-none" strokeWidth={3} />
      </span>
    )
  if (status === "outdated")
    return (
      <span aria-hidden className={cn(glyphClassName, "bg-amber-400 text-zinc-950")}>
        <RefreshCw className="size-2.5" strokeWidth={3} />
      </span>
    )
  return (
    <span aria-hidden className={cn(glyphClassName, "bg-red-600 text-[10px] leading-none font-bold text-white")}>
      !
    </span>
  )
}

export function useStoryboardStatusCopy() {
  const { t } = useLingui()
  return (status: StoryboardStatus) =>
    status === "building"
      ? { label: t`Building`, title: t`The storyboard is being built` }
      : status === "failed"
        ? { label: t`Failed`, title: t`Building the storyboard failed` }
        : status === "outdated"
          ? { label: t`Out of date`, title: t`Setup changed: rebuild the storyboard to see it` }
          : { label: "", title: "" }
}

export interface SetupStoryboard {
  active: boolean
  status: StoryboardStatus
  onClick: () => void
}

export function SetupLeads({
  foundations,
  storyboard,
  activeSlug,
  register,
  onGo,
  showCard,
  hideTip,
  storyboardItem,
  collapse,
}: {
  foundations: DockItem[]
  storyboard: SetupStoryboard
  activeSlug: string | null | undefined
  register: (key: string) => (element: HTMLElement | null) => void
  onGo: (slug: string) => void
  showCard: (item: DockItem, element: HTMLElement, via?: "focus" | "pointer") => void
  hideTip: () => void
  storyboardItem: DockItem | undefined
  collapse: CollapseMotion | null
}) {
  const { t } = useLingui()
  const wrapRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [itemLefts, setItemLefts] = useState<number[]>([])
  const [startWidth, setStartWidth] = useState<number | null>(null)
  const [closing, setClosing] = useState(false)
  useLayoutEffect(() => {
    if (!collapse) {
      setStartWidth(null)
      setClosing(false)
      return
    }
    setStartWidth(wrapRef.current?.offsetWidth ?? 0)
    setItemLefts(itemRefs.current.map((node) => node?.offsetLeft ?? 0))
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setClosing(true)))
    return () => cancelAnimationFrame(frame)
  }, [collapse])
  const slideMs = collapse ? Math.round(collapse.duration * 0.62) : 0
  const fadeMs = collapse ? collapse.duration - slideMs : 0
  const cardHandlers = (item: DockItem | undefined) =>
    item
      ? {
          onPointerEnter: (event: React.PointerEvent<HTMLElement>) => showCard(item, event.currentTarget),
          onFocus: (event: React.FocusEvent<HTMLElement>) => showCard(item, event.currentTarget, "focus"),
          onPointerLeave: hideTip,
          onBlur: hideTip,
        }
      : {}
  const stateOf = (item: DockItem) =>
    item.state === "done"
      ? t`done`
      : item.state === "running" || item.state === "queued"
        ? t`running`
        : item.state === "error"
          ? t`needs attention`
          : t`not run yet`
  const stepClassName = cn(
    "relative grid size-12 shrink-0 place-items-center rounded-[16px] outline-none",
    "transition-[background-color,color,scale] duration-200 ease-out motion-reduce:transition-none",
    tabFocusClassName,
  )
  return (
    <div role="group" aria-label={t`Getting your book ready`} className="flex items-center gap-1">
      <div
        ref={wrapRef}
        className="relative flex items-center gap-1"
        style={collapse && startWidth !== null ? { width: startWidth } : undefined}
      >
        {collapse?.target && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 z-10 grid size-12 place-items-center"
            style={{
              opacity: closing ? 1 : 0,
              transform: closing ? "scale(1)" : "scale(0.6)",
              transition: `opacity ${fadeMs}ms ease-out ${slideMs - 20}ms, transform ${fadeMs + 120}ms cubic-bezier(0.34,1.56,0.64,1) ${slideMs - 20}ms`,
            }}
          >
            {collapse.target}
          </span>
        )}
        {foundations.map((item, index) => {
          const here = item.slug === activeSlug
          const running = item.state === "running" || item.state === "queued"
          const name = getStageLabelI18n(item.slug)
          return (
            <div
              key={item.slug}
              ref={(node) => {
                itemRefs.current[index] = node
              }}
              className="flex shrink-0 items-center gap-1"
              style={
                collapse
                  ? {
                      transform: closing && startWidth !== null ? `translateX(${(itemLefts[0] ?? 0) - (itemLefts[index] ?? 0)}px) scale(0.88)` : undefined,
                      transformOrigin: "24px 50%",
                      opacity: closing ? 0 : 1,
                      zIndex: index + 1,
                      transition: `transform ${slideMs}ms cubic-bezier(0.5,0,0.2,1), opacity ${fadeMs}ms ease-in ${slideMs}ms`,
                    }
                  : undefined
              }
            >
              <button
                ref={register(item.slug)}
                type="button"
                aria-current={here ? "page" : undefined}
                aria-label={t`${name}, ${stateOf(item)}`}
                onClick={() => onGo(item.slug)}
                {...cardHandlers(item)}
                className={cn(
                  stepClassName,
                  "cursor-pointer active:scale-[0.97]",
                  here ? "text-white" : cn(SKIN.strong, "hover:bg-[color-mix(in_srgb,var(--tint)_10%,transparent)]"),
                )}
                style={{ ["--tint" as string]: item.hex, ...(here && collapse ? { ...highlightStyle(item.hex), transition: "none" } : {}) }}
              >
                <span className="relative grid size-5 place-items-center">
                  <item.icon aria-hidden className="size-5 transition-colors duration-300" strokeWidth={2} style={{ color: here ? "#ffffff" : item.hex }} />
                  {item.state === "done" && !here && (
                    <span aria-hidden className={cn(glyphClassName, "bg-emerald-600 text-white")}>
                      <Check className="size-2.5" strokeWidth={3.4} />
                    </span>
                  )}
                  {running && !here && <StatusBadge status="building" />}
                  {item.state === "error" && !here && <StatusBadge status="problem" />}
                </span>
              </button>
              <ChevronRight
                aria-hidden
                className={cn("size-3.5 shrink-0 opacity-70 transition-opacity duration-100 ease-out", SKIN.muted, collapse && closing && "opacity-0")}
                strokeWidth={2.25}
              />
            </div>
          )
        })}
      </div>
      <button
        ref={register("storyboard")}
        type="button"
        aria-current={storyboard.active ? "page" : undefined}
        aria-label={storyboard.status === "building" ? t`Storyboard, building` : t`Storyboard, not built yet`}
        {...cardHandlers(storyboardItem)}
        onClick={() => {
          if (!storyboard.active) storyboard.onClick()
        }}
        className={cn(
          stepClassName,
          storyboard.active
            ? "cursor-default text-white"
            : cn("cursor-pointer active:scale-[0.97]", SKIN.strong, "hover:bg-[color-mix(in_srgb,var(--tint)_10%,transparent)]"),
        )}
        style={{ ["--tint" as string]: STORYBOARD_HEX, ...(storyboard.active && collapse ? { ...highlightStyle(STORYBOARD_HEX), transition: "none" } : {}) }}
      >
        <span className="relative grid size-5 place-items-center">
          <LayoutGrid aria-hidden className="size-5 transition-colors duration-300" strokeWidth={2} style={{ color: storyboard.active ? "#ffffff" : STORYBOARD_HEX }} />
          {!storyboard.active && storyboard.status !== "ready" && <StatusBadge status={storyboard.status} />}
        </span>
      </button>
    </div>
  )
}
