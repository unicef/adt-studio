import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { ChevronDown, LayoutGrid, Wrench } from "lucide-react"
import type { StageState } from "@/hooks/use-book-run"
import { cn, prefersReducedMotion } from "@/lib/utils"
import { useVariant } from "@/components/app/lab/variants"
import { STORYBOARD_HEX, type DockGroup } from "@/components/app/screens/pipeline/shared/plugins"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { isInBook } from "@/components/app/screens/pipeline/shared/contentFlow"
import { DockSheet } from "./DockSheet"
import { StepDetail } from "./StepDetail"
import { AddMenuRich, buildEntries } from "./AddMenuRich"
import { ADD_MENU_WIDTH } from "./features"
import { FlatTabs, GroupTabs, PathTabs, groupKeyFor, type DockApi } from "./layouts"
import { GROUP_ORDER, keyOf, type DockLayout, type DockNext, type KeyedGroup } from "./model"
import { EASE_SPRING, PANEL_WIDTH, SKIN, tabFocusClassName } from "./style"
import { InBookTile } from "./InBookTile"
import { SetupButtons } from "./SetupButtons"
import { ISLAND_TOGGLE_KEY, IslandExtras, bookIslandClassName, bookIslandIdleClassName, islandMotionMs, islandShellIdleClassName, useExtrasCollapsed } from "./IslandExtras"
import { TrayTabs } from "./TrayButton"
import { SetupLeads, StatusBadge, highlightStyle, useStoryboardStatusCopy, type StoryboardStatus } from "./StoryboardEntry"

export type { DockLayout, DockNext } from "./model"


interface TipState {
  label: string
  x: number
  item?: DockItem
  rect?: { x: number; y: number; w: number; h: number }
  dir?: 1 | -1 | 0
}


const pillClassName =
  "pointer-events-none absolute top-0 left-0 h-12 rounded-[16px] bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0))] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] motion-reduce:transition-none"

const pillEnterClassName = "transition-none animate-in fade-in zoom-in-[0.85] duration-200 ease-out motion-reduce:animate-none"

const MERGE_MOTION = { collapse: 420, pause: 60, collapseEase: "cubic-bezier(0.4,0,0.2,1)", grow: 340, growEase: "cubic-bezier(0.2,0,0,1)" }

export interface DockLeadingProps {
  layout?: DockLayout
  pinned?: boolean
  next?: DockNext | null
  notices?: Partial<Record<string, string>>
  attention?: string[]
  onSkipNext?: (key: string) => void
  book: string
  groups: DockGroup<DockItem>[]
  available: DockItem[]
  activeSlug: string | null | undefined
  storyboard: { active: boolean; locked: boolean; done: boolean; state: StageState; status: StoryboardStatus; setupProblem: boolean; onClick: () => void; pageCount?: number; coverUrl?: string }
  onOpen: (slug: string) => void
  onAdd?: (slug: string) => void
  onMinimize?: () => void
}

export function DockLeading({
  layout = "groups",
  pinned = false,
  next = null,
  notices = {},
  attention = [],
  onSkipNext,
  groups,
  available,
  activeSlug,
  storyboard,
  onOpen,
  onAdd,
  onMinimize,
}: DockLeadingProps) {
  const { t } = useLingui()
  const rootRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const homeRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const refs = useRef<Record<string, HTMLElement | null>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [lastOpen, setLastOpen] = useState<string | null>(null)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [contentHeight, setContentHeight] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window === "undefined" ? 900 : window.innerHeight))
  const [barWidth, setBarWidth] = useState<number | null>(null)
  const [tip, setTip] = useState<TipState | null>(null)
  const hideTimer = useRef<number | null>(null)
  const showTimer = useRef<number | null>(null)
  const [lastTip, setLastTip] = useState<TipState | null>(null)
  const [snap, setSnap] = useState(false)
  const [pill, setPill] = useState<{ x: number; y: number; width: number; height: number; radius: string } | null>(null)
  const [pillReady, setPillReady] = useState(false)

  const presentItems = groups.flatMap((group) => group.items)
  const dockGroups: KeyedGroup[] = GROUP_ORDER.map((key) => ({ key, items: presentItems.filter((item) => keyOf(item) === key) })).filter(
    (group) => group.items.length > 0 || (!!onAdd && available.some((item) => keyOf(item) === group.key)),
  )
  const allItems = [...presentItems.filter((item) => item.group !== "convert"), ...(onAdd ? available : [])]
  const inBook = (slug: string) => isInBook(presentItems.find((item) => item.slug === slug))

  const storyboardOn = storyboard.active && !storyboard.locked
  const statusCopy = useStoryboardStatusCopy()
  const foundations = presentItems.filter((item) => item.group === "convert")
  const leadsTarget = !storyboard.done
  const [leads, setLeads] = useState(leadsTarget)
  const [mergePhase, setMergePhase] = useState<"collapse" | "pause" | "grow" | null>(null)
  const dockFocus = useVariant("dockfocus")
  const labSplit = useVariant("setupsplit")
  const focus = layout === "flat" ? dockFocus : null
  const setupSplit = focus ? (focus === "tiles" ? "before" : focus === "base" ? "attached" : "path") : labSplit
  const split = setupSplit !== "single"
  const islands = focus === "islands"
  const [extrasCollapsedStored, setExtrasCollapsed] = useExtrasCollapsed()
  const extrasCollapsed = islands && extrasCollapsedStored
  const [islandsMoving, setIslandsMoving] = useState(false)
  const movingTimer = useRef<number | null>(null)
  const [growWidth, setGrowWidth] = useState(0)
  const [leadsWidth, setLeadsWidth] = useState(0)
  const growInnerRef = useRef<HTMLDivElement>(null)
  const [growing, setGrowing] = useState(false)
  const leadsRef = useRef(leads)
  leadsRef.current = leads
  const mergeMotion = MERGE_MOTION
  const mergedLocation = useRef<string | null>(null)
  const activeItem = presentItems.find((item) => item.slug === activeSlug) ?? allItems.find((item) => item.slug === activeSlug)
  const onSetup = activeItem?.group === "convert"
  const location: string | null = leads && storyboard.active
    ? "storyboard"
    : storyboardOn
      ? "home"
      : onSetup
        ? leads || split
          ? activeItem.slug
          : "convert"
      : !activeItem
        ? null
        : layout === "groups"
          ? groupKeyFor(activeSlug, dockGroups)
          : extrasCollapsed
            ? ISLAND_TOGGLE_KEY
            : activeItem.slug
  const pillHex = storyboardOn || (leads && storyboard.active) ? STORYBOARD_HEX : (activeItem?.hex ?? null)
  const locationRef = useRef(location)
  useEffect(() => {
    locationRef.current = location
  })

  const register = useCallback(
    (key: string) => (element: HTMLElement | null) => {
      refs.current[key] = element
    },
    [],
  )

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = () => setContentHeight(content.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [open, lastOpen, layout])

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const measure = () => setBarWidth(bar.offsetWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const target = location === "home" ? homeRef.current : location ? refs.current[location] : null
    if (!target) {
      setPill(null)
      return
    }
    const measure = () => {
      const origin = groupRef.current?.getBoundingClientRect()
      const box = target.getBoundingClientRect()
      setPill({
        x: origin ? box.left - origin.left : target.offsetLeft,
        y: origin ? box.top - origin.top : target.offsetTop,
        width: target.offsetWidth,
        height: target.offsetHeight,
        radius: getComputedStyle(target).borderRadius,
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(target)
    if (homeRef.current) observer.observe(homeRef.current)
    if (barRef.current) observer.observe(barRef.current)
    return () => observer.disconnect()
  }, [location, layout, leads, setupSplit, focus, extrasCollapsed])

  useEffect(() => {
    if (leadsRef.current === leadsTarget) return
    const doc = typeof document !== "undefined" ? document : null
    if (prefersReducedMotion()) {
      setLeads(leadsTarget)
      return
    }
    if (!leadsTarget && split) {
      setLeadsWidth(48)
      setLeads(false)
      setMergePhase("grow")
      const fallback = window.setTimeout(finishMerge, MERGE_MOTION.grow + 500)
      return () => {
        window.clearTimeout(fallback)
        setMergePhase(null)
      }
    }
    if (!leadsTarget) {
      const motion = MERGE_MOTION
      const pause = motion.pause
      setLeadsWidth(homeRef.current?.offsetWidth ?? 0)
      setMergePhase("collapse")
      const toPause = window.setTimeout(() => {
        setLeads(false)
        setMergePhase(pause ? "pause" : "grow")
      }, motion.collapse)
      const toGrow = pause ? window.setTimeout(() => setMergePhase("grow"), motion.collapse + pause) : undefined
      const fallback = window.setTimeout(finishMerge, motion.collapse + pause + motion.grow + 500)
      return () => {
        window.clearTimeout(toPause)
        window.clearTimeout(toGrow)
        window.clearTimeout(fallback)
        setMergePhase(null)
      }
    }
    if (!doc || typeof doc.startViewTransition !== "function") {
      setLeads(leadsTarget)
      return
    }
    const frame = requestAnimationFrame(() => {
      doc.startViewTransition(() => {
        flushSync(() => setLeads(leadsTarget))
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [leadsTarget, split])

  function finishMerge() {
    mergedLocation.current = locationRef.current
    setMergePhase(null)
  }

  useLayoutEffect(() => {
    if (mergePhase !== "grow") {
      setGrowing(false)
      return
    }
    setGrowWidth(growInnerRef.current?.offsetWidth ?? 0)
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setGrowing(true)))
    return () => cancelAnimationFrame(frame)
  }, [mergePhase])

  useEffect(() => {
    if (!pill || pillReady) return
    const frame = requestAnimationFrame(() => setPillReady(true))
    return () => cancelAnimationFrame(frame)
  }, [pill, pillReady])

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    if (!open || pinned) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      const trigger = refs.current[open]
      setOpen(null)
      trigger?.focus()
    }
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onPointer)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onPointer)
    }
  }, [open, pinned])

  const centerOf = (element: HTMLElement) => {
    const root = rootRef.current
    if (!root) return 0
    const box = element.getBoundingClientRect()
    return box.left + box.width / 2 - root.getBoundingClientRect().left
  }

  const toggle = (key: string) => {
    if (open === key && pinned) return
    if (open === key) {
      setOpen(null)
      return
    }
    const from = open ? refs.current[open] : null
    const to = refs.current[key]
    setDirection(from && to && to.offsetLeft < from.offsetLeft ? -1 : 1)
    setTip(null)
    setSnap(false)
    setOpen(key)
    setLastOpen(key)
  }

  const go = (slug: string) => {
    flushSync(() => {
      setSnap(true)
      setOpen(null)
    })
    onOpen(slug)
  }

  const add = (slug: string) => {
    flushSync(() => {
      setSnap(true)
      setOpen(null)
    })
    if (onAdd) onAdd(slug)
    else onOpen(slug)
  }

  const cancelHide = () => {
    if (hideTimer.current === null) return
    window.clearTimeout(hideTimer.current)
    hideTimer.current = null
  }

  const cancelShow = () => {
    if (showTimer.current === null) return
    window.clearTimeout(showTimer.current)
    showTimer.current = null
  }

  const hideTip = () => {
    cancelHide()
    cancelShow()
    if (pinned && tip?.item) return
    if (layout !== "groups" && tip?.item) {
      hideTimer.current = window.setTimeout(() => setTip(null), 220)
      return
    }
    setTip(null)
  }

  const showTip = (label: string, element: HTMLElement) => {
    cancelHide()
    const next = { label, x: centerOf(element) }
    setTip(next)
    setLastTip(next)
  }

  const api: DockApi = {
    groups: dockGroups,
    allItems,
    inBook,
    open,
    activeSlug,
    next,
    attention,
    previewing: layout !== "groups" && !open && tip?.item ? tip.item.slug : null,
    register,
    toggle,
    go,
    add,
    showTip,
    showCard: (item: DockItem, element: HTMLElement, via: "focus" | "pointer" = "pointer") => {
      cancelHide()
      cancelShow()
      const root = rootRef.current?.getBoundingClientRect()
      const box = element.getBoundingClientRect()
      const rect = root ? { x: box.left - root.left, y: box.top - root.top, w: box.width, h: box.height } : undefined
      const previous = tip?.item ? tip.rect : undefined
      const dir: 1 | -1 | 0 = previous && rect ? (rect.x > previous.x ? 1 : rect.x < previous.x ? -1 : 0) : 0
      const half = 176 + 12
      const left = root ? root.left : 0
      const x = Math.min(Math.max(centerOf(element), half - left), window.innerWidth - half - left)
      const card = { label: item.slug, x, item, rect, dir }
      const reveal = () => {
        setTip(card)
        setLastTip(card)
      }
      if (tip?.item) reveal()
      else showTimer.current = window.setTimeout(reveal, via === "focus" ? 0 : 300)
    },
    hideTip,
    inlineHighlight: mergePhase !== null,
  }

  const setupOpen = open === "convert"
  const setupItem: DockItem | undefined = foundations[0]
    ? {
        ...foundations[0],
        icon: Wrench,
        state: storyboard.setupProblem
          ? "error"
          : foundations.some((item) => item.state === "running" || item.state === "queued")
            ? "running"
            : foundations.every((item) => item.state === "done")
              ? "done"
              : "ready",
        pending: 0,
      }
    : undefined

  const setupTile = setupItem && (
    <button
      ref={register("convert")}
      type="button"
      aria-expanded={setupOpen}
      aria-current={onSetup ? "page" : undefined}
      aria-label={storyboard.setupProblem ? t`Setup: Extract and Sectioning, needs attention` : t`Setup: Extract and Sectioning`}
      onClick={() => toggle("convert")}
      onPointerEnter={(event) => showTip(t`Setup`, event.currentTarget)}
      onFocus={(event) => showTip(t`Setup`, event.currentTarget)}
      onPointerLeave={() => setTip(null)}
      onBlur={() => setTip(null)}
      data-preview={setupOpen || undefined}
      className={cn(
        "group/tab relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[16px] outline-none",
        "transition-[scale] duration-200 ease-out active:scale-[0.94] motion-reduce:transition-none",
        tabFocusClassName,
        onSetup ? "text-white" : "text-zinc-500 dark:text-white/55",
      )}
      style={{ ["--tint" as string]: setupItem.hex }}
    >
      {onSetup ? (
        <Wrench aria-hidden className="size-5" strokeWidth={2} style={{ color: "#ffffff" }} />
      ) : (
        <InBookTile item={setupItem} attention={false} />
      )}
    </button>
  )

  const setupButtonProps = {
    foundations,
    activeSlug,
    previewing: api.previewing,
    register,
    onGo: go,
    showCard: api.showCard,
    hideTip,
  }

  const homeButton = (
    <button
      type="button"
      onClick={() => {
        setOpen(null)
        if (!storyboard.active && !storyboard.locked) storyboard.onClick()
      }}
      aria-current={storyboard.active ? "page" : undefined}
      aria-disabled={storyboard.locked || undefined}
      title={
        storyboard.locked
          ? t`The storyboard opens once setup is done`
          : storyboard.status !== "ready"
            ? statusCopy(storyboard.status).title
            : storyboard.active
              ? t`You're on the storyboard`
              : t`Back to the storyboard`
      }
      className={cn(
        "group/home relative flex h-12 shrink-0 cursor-pointer items-center rounded-[16px] font-semibold tracking-[-0.005em] outline-none",
        focus === "base" ? "pr-4 pl-2 text-[14px]" : focus === "islands" || focus === "tray" ? "px-6 text-[15px]" : "pr-3 pl-5 text-[14px]",
        !storyboard.locked && storyboard.status !== "ready" ? "gap-3.5" : "gap-2.5",
        "transition-[background-color,color,scale] duration-200 ease-out active:scale-[0.97] motion-reduce:transition-none",
        tabFocusClassName,
        storyboard.locked
          ? cn("cursor-not-allowed", SKIN.strong)
          : storyboardOn
            ? "cursor-default text-white"
            : cn(SKIN.strong, "hover:bg-[color-mix(in_srgb,var(--tint)_10%,transparent)]"),
      )}
      style={{ ["--tint" as string]: STORYBOARD_HEX }}
    >
      <span className={cn("relative grid place-items-center", storyboard.locked && "opacity-50")}>
        {focus === "base" && storyboard.coverUrl ? (
          <img
            src={storyboard.coverUrl}
            alt=""
            className={cn("h-9 w-[27px] rounded-[5px] object-cover shadow-[0_1px_3px_rgba(15,23,42,0.25)] transition-shadow duration-200", storyboardOn ? "ring-[1.5px] ring-white/70" : "ring-1 ring-zinc-950/10 dark:ring-white/15")}
          />
        ) : (
          <LayoutGrid
            className="size-5 transition-colors duration-300 motion-reduce:transition-none"
            strokeWidth={storyboardOn ? 2 : 1.9}
            style={{ color: storyboardOn ? "#ffffff" : STORYBOARD_HEX }}
          />
        )}
        {!storyboard.locked && <StatusBadge status={storyboard.status} />}
      </span>
      <span
        className={cn(
          "relative transition-opacity duration-200 ease-out motion-reduce:transition-none",
          storyboard.locked && "opacity-50",
          (mergePhase === "pause" || (mergePhase === "grow" && !growing)) && "opacity-0",
          focus === "base" && "flex flex-col text-left leading-tight",
        )}
      >
        <Trans>Storyboard</Trans>
        {focus === "base" && !!storyboard.pageCount && (
          <span className={cn("text-[11.5px] font-medium", storyboardOn ? "text-white/75" : SKIN.muted)}>
            {t`${plural(storyboard.pageCount, { one: "# page", other: "# pages" })}`}
          </span>
        )}
      </span>
      {storyboard.locked ? (
        <span className={cn("relative text-[12px] font-medium opacity-50", SKIN.muted)}>
          <Trans>after setup</Trans>
        </span>
      ) : storyboard.status !== "ready" ? (
        <span className="sr-only">{statusCopy(storyboard.status).title}</span>
      ) : null}
    </button>
  )

  const growStart = split ? 48 : Math.max(leadsWidth - 54, 48)
  const growFrom = growStart - 48
  const growMotion = `${mergeMotion.grow}ms ${mergeMotion.growEase}`
  const growPhase = mergePhase === "pause" || mergePhase === "grow"
  const growStyle =
    growPhase
      ? {
          width: growing ? growWidth : growStart,
          clipPath: ["inset(0", growing ? "0" : `0 0 ${growFrom}px`, "round", "16px)"].join(" "),
          transition: `width ${growMotion}, clip-path ${growMotion}`,
          ...(storyboardOn ? highlightStyle(STORYBOARD_HEX) : {}),
        }
      : undefined
  const growInnerStyle =
    growPhase
      ? { transform: `translateX(${growing || split ? 0 : growFrom - 6}px)`, transition: `transform ${mergeMotion.grow}ms cubic-bezier(0.2,0,0,1)` }
      : undefined

  const openKey = open ?? lastOpen
  const shownTip = tip ?? lastTip
  const detailStyle = layout !== "groups" ? "sheet" : null
  const hovering = !!tip?.item && !open
  const sheetHover = detailStyle === "sheet" && hovering
  const sheetDetail = detailStyle === "sheet" && !open && !!shownTip?.item


  const panelOpen = !!open || sheetHover
  const panelWidth = sheetHover ? 660 : openKey === "features" ? ADD_MENU_WIDTH : PANEL_WIDTH
  const panelContentWidth = barWidth !== null ? Math.max(barWidth, panelWidth) : undefined
  const shellWidth = barWidth !== null ? (panelOpen ? Math.max(barWidth, panelWidth) : barWidth) : undefined
  const detail = (item: DockItem) => (
    <StepDetail
      item={item}
      here={item === storyboardItem ? storyboard.active : item.slug === activeSlug}
      inBook={item === storyboardItem ? storyboard.done : inBook(item.slug)}
      notice={notices[item.slug]}
    />
  )
  const storyboardItem: DockItem | undefined = foundations[0]
    ? {
        ...foundations[0],
        slug: "storyboard" as DockItem["slug"],
        icon: LayoutGrid,
        hex: STORYBOARD_HEX,
        state: storyboard.status === "building" ? "running" : storyboard.done ? "done" : "ready",
        pending: 0,
      }
    : undefined
  const sheetItems = [...(leads ? [...foundations, ...(storyboardItem ? [storyboardItem] : [])] : split ? foundations : []), ...allItems.filter((item) => item.group !== "convert")]

  const pinnedTip = !!tip?.item
  useEffect(() => {
    if (!pinned) return
    if (layout === "path") {
      if (open !== "features") {
        setOpen("features")
        setLastOpen("features")
      }
      return
    }
    if (layout !== "flat" || pinnedTip) return
    const item = sheetItems.find((candidate) => candidate.slug === activeSlug) ?? sheetItems.find((candidate) => candidate.slug === "captions") ?? sheetItems[0]
    if (!item) return
    const card = { label: item.slug, x: 0, item }
    setTip(card)
    setLastTip(card)
  }, [pinned, layout, open, pinnedTip])

  const bookPart = leads ? (
              <div ref={homeRef} className="flex shrink-0 items-center">
                <SetupLeads foundations={foundations} storyboard={storyboard} activeSlug={activeSlug} register={register} onGo={go} showCard={api.showCard} hideTip={hideTip} storyboardItem={storyboardItem} collapse={
                    mergePhase === "collapse"
                      ? {
                          duration: mergeMotion.collapse,
                          easing: mergeMotion.collapseEase,
                          target: setupItem ? (
                            <span className="grid place-items-center" style={{ ["--tint" as string]: setupItem.hex }}>
                              <InBookTile item={setupItem} attention={false} />
                            </span>
                          ) : undefined,
                        }
                      : null
                  }
                />
              </div>
  ) : (
    <>
      {setupSplit === "single" && setupTile}
      {setupSplit === "before" && <SetupButtons look="tile" {...setupButtonProps} />}
      {setupSplit === "path" && <SetupButtons look="path" {...setupButtonProps} />}
      <div
        ref={homeRef}
        className={cn(
          "flex shrink-0 items-center",
          growPhase && "overflow-hidden",
          focus === "base" && !storyboardOn && !growPhase && "rounded-[16px] bg-zinc-950/[0.035] dark:bg-white/[0.05]",
        )}
        style={growStyle}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === "width" && mergePhase === "grow") finishMerge()
        }}
      >
        <div ref={growInnerRef} className="flex w-max shrink-0 items-center" style={growInnerStyle}>
          {homeButton}
          {setupSplit === "attached" && <SetupButtons look="attached" onPill={storyboardOn} {...setupButtonProps} />}
        </div>
      </div>
    </>
  )

  const stepsPart =
    layout === "flat" ? focus === "tray" ? <TrayTabs api={api} /> : <FlatTabs api={api} /> : layout === "path" ? <PathTabs api={api} /> : <GroupTabs api={api} />

  const toggleExtras = () => {
    setTip(null)
    if (movingTimer.current !== null) window.clearTimeout(movingTimer.current)
    setIslandsMoving(true)
    setExtrasCollapsed(!extrasCollapsedStored)
    movingTimer.current = window.setTimeout(() => setIslandsMoving(false), islandMotionMs + 80)
  }

  return (
    <div ref={rootRef} className={cn("relative flex items-end", SKIN.surface)}>
      {shownTip && !shownTip.item && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-full z-10 mb-2.5 block -translate-x-1/2 whitespace-nowrap rounded-[9px] px-2.5 py-1 text-[12px] font-medium shadow-[0_8px_20px_-8px_rgba(15,23,42,0.45)] transition-[left,opacity,translate] duration-200 motion-reduce:transition-none",
            EASE_SPRING,
            SKIN.tip,
            tip && !open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
          style={{ left: shownTip.x }}
        >
          {shownTip.label}
        </span>
      )}
      <div
        className={cn(
          "relative flex flex-col",
          islands && !panelOpen ? cn(islandShellIdleClassName, "overflow-visible") : cn(SKIN.shell, "overflow-hidden"),
          islands
            ? cn(
                "duration-[340ms] motion-reduce:transition-none",
                shellWidth !== undefined && !snap && !mergePhase && !islandsMoving ? "transition-[width,background-color,box-shadow]" : "transition-[background-color,box-shadow]",
                panelOpen ? EASE_SPRING : "ease-in",
              )
            : shellWidth !== undefined && !snap && !mergePhase && cn("transition-[width] duration-[340ms] motion-reduce:transition-none", panelOpen ? EASE_SPRING : "ease-in"),
        )}
        style={{ width: mergePhase ? undefined : shellWidth }}
      >
        <div
          onPointerEnter={sheetDetail ? cancelHide : undefined}
          onPointerLeave={sheetDetail ? hideTip : undefined}
          onFocusCapture={sheetDetail ? cancelHide : undefined}
          onBlurCapture={
            sheetDetail
              ? (event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hideTip()
                }
              : undefined
          }
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !sheetDetail) return
            const slug = tip?.item?.slug
            setTip(null)
            if (slug) refs.current[slug]?.focus()
          }}
          className={cn(
            "grid motion-reduce:transition-none",
            panelOpen && contentHeight > viewportHeight - 280 ? "overflow-y-auto overscroll-contain" : "overflow-hidden",
            panelOpen
              ? cn("opacity-100 transition-[height,opacity]", sheetHover ? "duration-[260ms] ease-out" : cn("duration-[340ms]", EASE_SPRING))
              : cn("opacity-0", snap ? "transition-none" : "transition-[height,opacity] duration-150 ease-in"),
          )}
          style={{ height: panelOpen ? Math.min(contentHeight, viewportHeight - 280) : 0 }}
          inert={!panelOpen}
          aria-hidden={!panelOpen}
        >
          <div ref={contentRef} className={cn("self-start px-2 pt-2", panelContentWidth !== undefined && "mx-auto")} style={{ width: panelContentWidth }}>
            {sheetDetail && shownTip?.item ? (
              <div className="grid px-1 pt-1 pb-2.5">
                {sheetItems.map((item) => {
                  const visible = item.slug === shownTip.item?.slug
                  return (
                    <div
                      key={item.slug}
                      aria-hidden={!visible}
                      inert={!visible}
                      className={cn(
                        "col-start-1 row-start-1 transition-opacity duration-150 ease-out motion-reduce:transition-none",
                        visible ? "opacity-100" : "pointer-events-none opacity-0",
                      )}
                    >
                      {detail(item)}
                    </div>
                  )
                })}
              </div>
            ) : (
              openKey === "features" ? (
                <div className="px-1 pt-1 pb-1.5">
                  <AddMenuRich
                    entries={buildEntries(
                      dockGroups.filter((group) => group.key !== "convert").flatMap((group) => group.items),
                      onAdd ? available.filter((item) => item.group !== "convert") : [],
                      inBook,
                    )}
                    activeSlug={activeSlug}
                    notices={notices}
                    activate={(entry) => (entry.added || entry.item.slug === activeSlug || !onAdd ? go(entry.item.slug) : add(entry.item.slug))}
                  />
                </div>
              ) : openKey && (
                <DockSheet
                  openKey={openKey}
                  groups={dockGroups}
                  available={(key) => available.filter((item) => keyOf(item) === key)}
                  activeSlug={activeSlug}
                  next={next}
                  notices={notices}
                  direction={direction}
                  onGo={go}
                  onAdd={onAdd ? add : undefined}
                  onSkipNext={onSkipNext}
                />
              )
            )}
          </div>
        </div>
        <div ref={barRef} className={cn("p-1.5", shellWidth !== undefined && "mx-auto w-max")}>
          <div ref={groupRef} role="group" aria-label={t`Book steps`} className={cn("relative flex items-center", islands ? "gap-2.5" : "gap-1.5")}>
            {pill && pillHex && (
              <span
                key={`pill-${location}`}
                aria-hidden
                className={cn(pillClassName, mergePhase && "opacity-0", pillReady && !mergePhase && mergedLocation.current !== location && pillEnterClassName)}
                style={{ left: pill.x, top: pill.y, width: pill.width, height: pill.height, borderRadius: pill.radius === "0px" ? undefined : pill.radius, backgroundColor: pillHex }}
              />
            )}
            {islands ? (
              <>
                <div className={cn(bookIslandClassName, panelOpen ? "bg-transparent shadow-none" : bookIslandIdleClassName)}>{bookPart}</div>
                <IslandExtras api={api} collapsed={extrasCollapsed} merged={panelOpen} onToggle={toggleExtras} />
              </>
            ) : (
              <>
                {bookPart}
                <span aria-hidden className={cn("mx-1.5 h-5 w-px shrink-0", SKIN.divider)} />
                {stepsPart}
              </>
            )}
          </div>
        </div>
      </div>
      {onMinimize && (
        <button
          type="button"
          onClick={onMinimize}
          title={t`Minimize the dock`}
          aria-label={t`Minimize the dock`}
          className={cn("absolute bottom-2.5 -right-10 grid size-8 cursor-pointer place-items-center rounded-full transition-colors duration-150", SKIN.minimize)}
        >
          <ChevronDown className="size-4" strokeWidth={1.9} />
        </button>
      )}
    </div>
  )
}
