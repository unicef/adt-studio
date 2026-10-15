import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown, ChevronUp, LayoutGrid } from "lucide-react"
import type { StageState } from "@/hooks/use-book-run"
import { cn } from "@/lib/utils"
import { STORYBOARD_HEX, type DockGroup } from "@/components/app/screens/pipeline/shared/plugins"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { isInBook } from "@/components/app/screens/pipeline/shared/contentFlow"
import { DockSheet } from "./DockSheet"
import { StepDetail } from "./StepDetail"
import { FlatTabs, GroupTabs, PathTabs, groupKeyFor, type DockApi } from "./layouts"
import { GROUP_ORDER, keyOf, useGroupCopy, type DockLayout, type DockNext, type DockOrder, type KeyedGroup, type NextCue } from "./model"
import { EASE_SPRING, PANEL_WIDTH, SKIN, tabFocusClassName } from "./style"

export type { DockLayout, DockNext, DockOrder, NextCue } from "./model"

export type HoverStyle = "popover" | "sheet" | "morph"

interface TipState {
  label: string
  x: number
  item?: DockItem
}

export interface DockLeadingProps {
  layout?: DockLayout
  hoverStyle?: HoverStyle
  next?: DockNext | null
  cue?: NextCue
  order?: DockOrder
  notices?: Partial<Record<string, string>>
  attention?: string[]
  onSkipNext?: (key: string) => void
  book: string
  groups: DockGroup<DockItem>[]
  available: DockItem[]
  activeSlug: string | null | undefined
  storyboard: { active: boolean; locked: boolean; state: StageState; onClick: () => void }
  onOpen: (slug: string) => void
  onAdd?: (slug: string) => void
  onMinimize?: () => void
}

export function DockLeading({
  layout = "groups",
  hoverStyle = "popover",
  next = null,
  cue = "chip",
  order = "none",
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
  const copy = useGroupCopy()
  const rootRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const homeRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const morphRef = useRef<HTMLDivElement>(null)
  const [morphHeight, setMorphHeight] = useState(0)
  const refs = useRef<Record<string, HTMLElement | null>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [lastOpen, setLastOpen] = useState<string | null>(null)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [contentHeight, setContentHeight] = useState(0)
  const [barWidth, setBarWidth] = useState<number | null>(null)
  const [tip, setTip] = useState<TipState | null>(null)
  const hideTimer = useRef<number | null>(null)
  const [lastTip, setLastTip] = useState<TipState | null>(null)
  const [snap, setSnap] = useState(false)
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null)
  const [pillReady, setPillReady] = useState(false)

  const presentItems = groups.flatMap((group) => group.items)
  const dockGroups: KeyedGroup[] = GROUP_ORDER.map((key) => ({ key, items: presentItems.filter((item) => keyOf(item) === key) })).filter(
    (group) => group.items.length > 0 || (!!onAdd && available.some((item) => keyOf(item) === group.key)),
  )
  const allItems = [...presentItems.filter((item) => item.group !== "convert"), ...(onAdd ? available : [])]
  const inBook = (slug: string) => isInBook(presentItems.find((item) => item.slug === slug))

  const storyboardOn = storyboard.active && !storyboard.locked
  const activeItem = presentItems.find((item) => item.slug === activeSlug) ?? allItems.find((item) => item.slug === activeSlug)
  const onSetup = activeItem?.group === "convert"
  const location: string | null = storyboardOn
    ? "home"
    : onSetup
      ? "convert"
      : !activeItem
        ? null
        : layout === "groups"
          ? groupKeyFor(activeSlug, dockGroups)
          : layout === "flat"
            ? activeItem.slug
            : "current"
  const pillHex = storyboardOn ? STORYBOARD_HEX : (activeItem?.hex ?? null)

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
  }, [open, lastOpen, hoverStyle, layout])

  useLayoutEffect(() => {
    const content = morphRef.current
    if (!content) return
    const measure = () => setMorphHeight(content.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [hoverStyle, layout])

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
    const measure = () => setPill({ x: target.offsetLeft, width: target.offsetWidth })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(target)
    if (homeRef.current) observer.observe(homeRef.current)
    if (barRef.current) observer.observe(barRef.current)
    return () => observer.disconnect()
  }, [location, layout])

  useEffect(() => {
    if (!pill || pillReady) return
    const frame = requestAnimationFrame(() => setPillReady(true))
    return () => cancelAnimationFrame(frame)
  }, [pill, pillReady])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null)
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
  }, [open])

  const centerOf = (element: HTMLElement) => {
    const root = rootRef.current
    if (!root) return 0
    const box = element.getBoundingClientRect()
    return box.left + box.width / 2 - root.getBoundingClientRect().left
  }

  const toggle = (key: string) => {
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

  const hideTip = () => {
    cancelHide()
    if (layout === "flat" && tip?.item) {
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
    cue,
    order,
    attention,
    register,
    toggle,
    go,
    add,
    showTip,
    showCard: (item: DockItem, element: HTMLElement) => {
      cancelHide()
      const card = { label: item.slug, x: centerOf(element), item }
      setTip(card)
      setLastTip(card)
    },
    hideTip,
  }

  const setupOpen = open === "convert"
  const setupTab = (
    <button
      ref={register("convert")}
      type="button"
      aria-expanded={setupOpen}
      aria-current={onSetup ? "page" : undefined}
      aria-label={t`Setup: Extract and Sectioning`}
      onClick={() => toggle("convert")}
      onPointerEnter={(event) => showTip(t`Setup`, event.currentTarget)}
      onFocus={(event) => showTip(t`Setup`, event.currentTarget)}
      onPointerLeave={() => setTip(null)}
      onBlur={() => setTip(null)}
      className={cn(
        "group/chev relative grid h-12 w-9 shrink-0 cursor-pointer place-items-center rounded-[14px] outline-none",
        "transition-[color,scale] duration-200 ease-out active:scale-[0.94] motion-reduce:transition-none",
        tabFocusClassName,
        onSetup || storyboardOn
          ? "text-white/75 hover:text-white"
          : setupOpen
            ? "text-zinc-950 dark:text-white"
            : "text-zinc-500 hover:text-zinc-950 dark:text-white/55 dark:hover:text-white",
      )}
      style={{ ["--tint" as string]: STORYBOARD_HEX }}
    >
      <ChevronUp
        className={cn(
          "size-4 transition-[rotate,translate,scale] duration-300 motion-reduce:transition-none",
          EASE_SPRING,
          "group-hover/chev:scale-115",
          setupOpen ? "rotate-180 group-hover/chev:translate-y-0.5" : "group-hover/chev:-translate-y-0.5",
        )}
        strokeWidth={2.25}
      />
    </button>
  )

  const homeButton = (
    <button
      type="button"
      onClick={() => {
        setOpen(null)
        if (!storyboard.active && !storyboard.locked) storyboard.onClick()
      }}
      aria-current={storyboard.active ? "page" : undefined}
      aria-disabled={storyboard.locked || undefined}
      title={storyboard.locked ? t`The storyboard opens once setup is done` : storyboard.active ? t`You're on the storyboard` : t`Back to the storyboard`}
      className={cn(
        "group/home relative flex h-12 shrink-0 cursor-pointer items-center gap-2.5 rounded-[16px] pr-3 pl-5 text-[14px] font-semibold tracking-[-0.005em] outline-none",
        "transition-[background-color,color,scale] duration-200 ease-out active:scale-[0.97] motion-reduce:transition-none",
        tabFocusClassName,
        storyboard.locked
          ? cn("cursor-not-allowed opacity-50", SKIN.strong)
          : storyboardOn
            ? "cursor-default text-white"
            : cn(SKIN.strong, "hover:bg-[color-mix(in_srgb,var(--tint)_10%,transparent)]"),
      )}
      style={{ ["--tint" as string]: STORYBOARD_HEX }}
    >
      <LayoutGrid
        className="relative size-5 transition-colors duration-300 motion-reduce:transition-none"
        strokeWidth={storyboardOn ? 2 : 1.9}
        style={{ color: storyboardOn ? "#ffffff" : STORYBOARD_HEX }}
      />
      <span className="relative">
        <Trans>Storyboard</Trans>
      </span>
      {storyboard.locked ? (
        <span className={cn("relative text-[12px] font-medium", SKIN.muted)}>
          <Trans>after setup</Trans>
        </span>
      ) : null}
    </button>
  )

  const openKey = open ?? lastOpen
  const shownTip = tip ?? lastTip
  const detailStyle = layout === "flat" ? hoverStyle : null
  const hovering = !!tip?.item && !open
  const sheetHover = detailStyle === "sheet" && hovering
  const sheetDetail = detailStyle === "sheet" && !open && !!shownTip?.item
  const panelOpen = !!open || sheetHover
  const panelWidth = sheetHover ? 660 : openKey === "features" ? 620 : PANEL_WIDTH
  const panelContentWidth = barWidth !== null ? Math.max(barWidth, panelWidth) : undefined
  const shellWidth = barWidth !== null ? (panelOpen ? Math.max(barWidth, panelWidth) : barWidth) : undefined
  const runAction = (item: DockItem) => {
    cancelHide()
    setTip(null)
    if (inBook(item.slug)) go(item.slug)
    else add(item.slug)
  }
  const detail = (item: DockItem, wide = false) => (
    <StepDetail
      item={item}
      wide={wide}
      group={copy(keyOf(item)).name}
      here={item.slug === activeSlug}
      inBook={inBook(item.slug)}
      notice={notices[item.slug]}
      onAction={() => runAction(item)}
    />
  )

  return (
    <div ref={rootRef} className={cn("relative flex items-end", SKIN.surface)}>
      {shownTip && !(shownTip.item && detailStyle !== "popover") && (
        <div
          aria-hidden={!(shownTip.item && hovering)}
          onPointerEnter={shownTip.item ? cancelHide : undefined}
          onPointerLeave={shownTip.item ? hideTip : undefined}
          className={cn(
            "absolute bottom-full z-10 origin-bottom -translate-x-1/2 transition-[left,opacity,translate,scale] duration-[260ms] motion-reduce:transition-none",
            EASE_SPRING,
            shownTip.item ? (hovering ? "pointer-events-auto pb-3" : "pointer-events-none pb-3") : "pointer-events-none mb-2.5",
            tip && !open ? "translate-y-0 scale-100 opacity-100" : cn("opacity-0", shownTip.item ? "translate-y-2 scale-[0.96]" : "translate-y-1"),
          )}
          style={{ left: shownTip.x }}
        >
          {shownTip.item ? (
            <div className="w-[352px] rounded-[22px] bg-white p-3 ring-1 ring-zinc-950/[0.07] shadow-[0_24px_50px_-20px_rgba(15,23,42,0.4)] dark:bg-zinc-950 dark:ring-white/[0.1]">
              <div key={shownTip.item.slug} className="animate-in fade-in duration-200 motion-reduce:animate-none">
                {detail(shownTip.item)}
              </div>
            </div>
          ) : (
            <span className={cn("block whitespace-nowrap rounded-[9px] px-2.5 py-1 text-[12px] font-medium shadow-[0_8px_20px_-8px_rgba(15,23,42,0.45)]", SKIN.tip)}>
              {shownTip.label}
            </span>
          )}
        </div>
      )}
      {detailStyle === "morph" && shownTip?.item && (
        <div
          aria-hidden={!hovering}
          onPointerEnter={cancelHide}
          onPointerLeave={hideTip}
          className={cn(
            "absolute bottom-[calc(100%-1px)] z-20 -translate-x-1/2 overflow-hidden border border-b-0 border-zinc-950/[0.08] bg-white dark:border-white/[0.09] dark:bg-zinc-950",
            "shadow-[0_-18px_40px_-26px_rgba(15,23,42,0.45)] transition-[left,width,height,border-radius,opacity] duration-[380ms] motion-reduce:transition-none",
            EASE_SPRING,
            hovering ? "pointer-events-auto rounded-t-[24px] opacity-100" : "pointer-events-none rounded-t-[16px] opacity-0",
          )}
          style={{ left: shownTip.x, width: hovering ? 376 : 52, height: hovering ? morphHeight : 0 }}
        >
          <div
            ref={morphRef}
            className={cn("w-[376px] p-3 pb-2.5 transition-opacity motion-reduce:transition-none", hovering ? "opacity-100 delay-100 duration-200" : "opacity-0 duration-100")}
          >
            <div key={shownTip.item.slug} className="animate-in fade-in duration-200 motion-reduce:animate-none">
              {detail(shownTip.item)}
            </div>
          </div>
        </div>
      )}
      <div
        className={cn(
          "relative flex flex-col overflow-hidden",
          SKIN.shell,
          shellWidth !== undefined && !snap && cn("transition-[width] duration-[340ms] motion-reduce:transition-none", panelOpen ? EASE_SPRING : "ease-in"),
        )}
        style={{ width: shellWidth }}
      >
        <div
          onPointerEnter={sheetDetail ? cancelHide : undefined}
          onPointerLeave={sheetDetail ? hideTip : undefined}
          className={cn(
            "grid overflow-hidden motion-reduce:transition-none",
            panelOpen
              ? cn("opacity-100 transition-[height,opacity] duration-[340ms]", EASE_SPRING)
              : cn("opacity-0", snap ? "transition-none" : "transition-[height,opacity] duration-150 ease-in"),
          )}
          style={{ height: panelOpen ? contentHeight : 0 }}
          inert={!panelOpen}
          aria-hidden={!panelOpen}
        >
          <div ref={contentRef} className={cn("self-start px-2 pt-2", panelContentWidth !== undefined && "mx-auto")} style={{ width: panelContentWidth }}>
            {sheetDetail && shownTip?.item ? (
              <div key={shownTip.item.slug} className="px-1 pt-1 pb-2.5 animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
                {detail(shownTip.item, true)}
              </div>
            ) : (
              openKey && (
                <DockSheet
                  openKey={openKey}
                  groups={dockGroups}
                  available={(key) => available.filter((item) => keyOf(item) === key)}
                  activeSlug={activeSlug}
                  next={next}
                  notices={notices}
                  direction={direction}
                  explain={openKey === "features"}
                  onGo={go}
                  onAdd={onAdd ? add : undefined}
                  onSkipNext={onSkipNext}
                />
              )
            )}
          </div>
        </div>
        <div ref={barRef} className={cn("p-1.5", shellWidth !== undefined && "mx-auto w-max")}>
          <div role="tablist" aria-label={t`Book steps`} className="relative flex items-center gap-1.5">
            {pill && pillHex && (
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-0 left-0 h-12 rounded-[16px] bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0))] motion-reduce:transition-none",
                  pillReady && cn("transition-[translate,width,background-color,box-shadow] duration-[420ms]", EASE_SPRING),
                )}
                style={{
                  translate: `${pill.x}px 0`,
                  width: pill.width,
                  backgroundColor: pillHex,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.3), 0 10px 26px -10px ${pillHex}, 0 0 0 4px color-mix(in srgb, ${pillHex} 14%, transparent)`,
                }}
              />
            )}
            <div ref={homeRef} className="flex shrink-0 items-center">
              {homeButton}
              <span aria-hidden className={cn("relative h-5 w-px shrink-0 transition-colors duration-300", storyboardOn ? "bg-white/30" : SKIN.divider)} />
              {setupTab}
            </div>
            <span aria-hidden className={cn("mx-1.5 h-5 w-px shrink-0", SKIN.divider)} />
            {layout === "flat" ? (
              <FlatTabs api={api} />
            ) : layout === "path" ? (
              <PathTabs api={api} />
            ) : (
              <GroupTabs api={api} />
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
