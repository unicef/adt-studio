import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import type { StageState } from "@/hooks/use-book-run"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { Accessibility, ChevronDown, Languages, LayoutGrid, Loader2, Plus, Sparkles, Wrench, type LucideIcon } from "lucide-react"
import { getStageDescriptionI18n, getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import type { StageGroup } from "@/components/pipeline/stage-config"
import { cn } from "@/lib/utils"
import { STORYBOARD_HEX, type DockGroup } from "@/components/app/screens/pipeline/shared/plugins"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"


type DockKey = StageGroup | "accessibility"

interface KeyedGroup {
  key: DockKey
  items: DockItem[]
}

const GROUP_ICON: Partial<Record<DockKey, LucideIcon>> = {
  convert: Wrench,
  accessibility: Accessibility,
  enhancements: Sparkles,
  localization: Languages,
}

const ACCESSIBILITY_SLUGS: readonly string[] = ["captions", "toc", "easy-read", "sign-language"]

const HERO_ORDER: DockKey[] = ["convert", "accessibility", "enhancements", "localization"]

const PANEL_WIDTH = 480

const EASE_SPRING = "ease-[cubic-bezier(0.32,0.72,0,1)]"

const SKIN = {
  shell: cn(
    "rounded-[24px] bg-white ring-1 ring-zinc-950/[0.07] shadow-[0_24px_50px_-22px_rgba(15,23,42,0.32),0_2px_6px_-2px_rgba(15,23,42,0.08)]",
    "dark:bg-zinc-950 dark:ring-white/[0.08] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]",
  ),
  tabIdle: "text-zinc-500 hover:bg-zinc-950/[0.05] hover:text-zinc-950 dark:text-white/55 dark:hover:bg-white/[0.08] dark:hover:text-white",
  tabOpen: "bg-zinc-950/[0.05] text-zinc-950 ring-[1.5px] ring-inset ring-zinc-950/30 dark:bg-white/[0.08] dark:text-white dark:ring-white/40",
  muted: "text-zinc-500 dark:text-white/50",
  strong: "text-zinc-950 dark:text-white",
  row: "hover:bg-zinc-950/[0.045] dark:hover:bg-white/[0.07]",
  rowHere: "bg-zinc-950/[0.05] dark:bg-white/[0.1]",
  divider: "bg-zinc-950/[0.08] dark:bg-white/[0.08]",
  minimize: "bg-white ring-1 ring-zinc-950/[0.07] text-zinc-500 shadow-[0_6px_16px_-8px_rgba(15,23,42,0.3)] hover:text-zinc-950 dark:bg-zinc-950 dark:ring-white/[0.08] dark:text-white/60 dark:hover:text-white",
  tip: "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950",
  surface: cn("[--dock-surface:#ffffff] [--dock-chip:10%] dark:[--dock-surface:#09090b] dark:[--dock-chip:18%]"),
}

function useGroupCopy() {
  const { t } = useLingui()
  return (group: DockKey): { name: string; hint: string } =>
    group === "convert"
      ? { name: t`Setup`, hint: t`Reads your PDF and splits the pages. Runs once.` }
      : group === "accessibility"
        ? { name: t`Accessibility`, hint: t`Recommended, so every reader can use the book.` }
        : group === "enhancements"
          ? { name: t`Enhancements`, hint: t`Optional extras for learning, in any order.` }
          : group === "localization"
            ? { name: t`Languages & voices`, hint: t`Translate the book and have it read aloud.` }
            : { name: t`More`, hint: "" }
}

const STATUS_TEXT = {
  running: "text-sky-700 dark:text-sky-300",
  error: "text-red-700 dark:text-red-300",
  review: "text-amber-700 dark:text-amber-300",
  done: "text-zinc-500 dark:text-zinc-400",
  quiet: "text-zinc-500 dark:text-zinc-400",
}

function Status({ item }: { item: DockItem }) {
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

function Badge({ items }: { items: DockItem[] }) {
  const failed = items.some((item) => item.state === "error")
  const running = items.some((item) => item.state === "running" || item.state === "queued")
  const review = items.some((item) => item.pending > 0)
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

export interface DockLeadingProps {
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
  const skin = SKIN
  const rootRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Partial<Record<DockKey, HTMLButtonElement | null>>>({})
  const [open, setOpen] = useState<DockKey | null>(null)
  const [lastOpen, setLastOpen] = useState<DockKey | null>(null)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [contentHeight, setContentHeight] = useState(0)
  const [barWidth, setBarWidth] = useState<number | null>(null)
  const [tip, setTip] = useState<{ label: string; x: number } | null>(null)
  const [lastTip, setLastTip] = useState<{ label: string; x: number } | null>(null)
  const [snap, setSnap] = useState(false)
  const homeRef = useRef<HTMLButtonElement>(null)
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null)
  const [pillReady, setPillReady] = useState(false)

  const keyOf = (item: DockItem): DockKey => (ACCESSIBILITY_SLUGS.includes(item.slug) ? "accessibility" : item.group)
  const dockGroups: KeyedGroup[] = HERO_ORDER.map((key) => ({ key, items: groups.flatMap((group) => group.items).filter((item) => keyOf(item) === key) })).filter(
    (group) => group.items.length > 0 || (!!onAdd && available.some((item) => keyOf(item) === group.key)),
  )

  const order = dockGroups.map((group) => group.key)
  const location = dockGroups.find((group) => group.items.some((item) => item.slug === activeSlug))?.key ?? null
  const openGroup = dockGroups.find((group) => group.key === (open ?? lastOpen)) ?? null

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = () => setContentHeight(content.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [open, lastOpen])

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const measure = () => setBarWidth(bar.offsetWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])

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

  const toggle = (key: DockKey) => {
    if (open === key) {
      setOpen(null)
      return
    }
    const from = order.indexOf(open ?? location ?? key)
    setDirection(order.indexOf(key) >= from ? 1 : -1)
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

  const showTip = (label: string, element: HTMLElement) => {
    const next = { label, x: centerOf(element) }
    setTip(next)
    setLastTip(next)
  }

  const heroTab = (group: KeyedGroup) => {
    const current = group.items.find((item) => item.slug === activeSlug)
    const isOpen = open === group.key
    const Icon = current?.icon ?? GROUP_ICON[group.key] ?? Sparkles
    const { name } = copy(group.key)
    return (
      <button
        key={group.key}
        ref={(element) => {
          tabRefs.current[group.key] = element
        }}
        type="button"
        role="tab"
        aria-selected={isOpen}
        aria-expanded={isOpen}
        aria-current={current ? "page" : undefined}
        aria-label={current ? t`${name}: ${getStageLabelI18n(current.slug)}` : name}
        onClick={() => toggle(group.key)}
        onPointerEnter={(event) => showTip(name, event.currentTarget)}
        onFocus={(event) => showTip(name, event.currentTarget)}
        onPointerLeave={() => setTip(null)}
        onBlur={() => setTip(null)}
        className={cn(
          "group/tab relative flex h-12 shrink-0 cursor-pointer items-center rounded-[16px] px-3.5 outline-none",
          "transition-[background-color,color,box-shadow,scale] duration-200 ease-out active:scale-[0.94] motion-reduce:transition-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--tint)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dock-surface)]",
          current ? "text-white" : isOpen ? skin.tabOpen : skin.tabIdle,
          current && isOpen && "ring-2 ring-[var(--tint)] ring-offset-2 ring-offset-[var(--dock-surface)]",
        )}
        style={{ ["--tint" as string]: current?.hex ?? "currentColor" }}
      >
        <span className="relative grid size-5 place-items-center transition-transform duration-200 ease-out group-hover/tab:-translate-y-px motion-reduce:transition-none">
          <Icon className="size-5" strokeWidth={current ? 2 : 1.75} />
          <Badge items={group.items} />
        </span>
      </button>
    )
  }

  const storyboardOn = storyboard.active && !storyboard.locked
  const pillHex = storyboardOn ? STORYBOARD_HEX : (dockGroups.find((group) => group.key === location)?.items.find((item) => item.slug === activeSlug)?.hex ?? null)

  useLayoutEffect(() => {
    const target = storyboardOn ? homeRef.current : location ? tabRefs.current[location] : null
    if (!target) {
      setPill(null)
      return
    }
    const measure = () => setPill({ x: target.offsetLeft, width: target.offsetWidth })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(target)
    return () => observer.disconnect()
  }, [storyboardOn, location])

  useEffect(() => {
    if (!pill || pillReady) return
    const frame = requestAnimationFrame(() => setPillReady(true))
    return () => cancelAnimationFrame(frame)
  }, [pill, pillReady])
  const homeButton = (
    <button
      ref={homeRef}
      type="button"
      onClick={() => {
        setOpen(null)
        if (!storyboard.active && !storyboard.locked) storyboard.onClick()
      }}
      aria-current={storyboard.active ? "page" : undefined}
      aria-disabled={storyboard.locked || undefined}
      title={storyboard.locked ? t`The storyboard opens once setup is done` : storyboard.active ? t`You're on the storyboard` : t`Back to the storyboard`}
      className={cn(
        "group/home relative flex shrink-0 cursor-pointer items-center gap-2 font-semibold tracking-[-0.005em] outline-none",
        "transition-[background-color,color,scale] duration-200 ease-out active:scale-[0.97] motion-reduce:transition-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--tint)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dock-surface)]",
        "h-12 gap-2.5 rounded-[16px] px-5 text-[14px]",
        storyboard.locked
          ? cn("cursor-not-allowed opacity-50", skin.strong)
          : storyboardOn
            ? "cursor-default text-white"
            : cn(skin.strong, "hover:bg-[color-mix(in_srgb,var(--tint)_10%,transparent)]"),
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
        <span className={cn("relative text-[12px] font-medium", skin.muted)}>
          <Trans>after setup</Trans>
        </span>
      ) : null}
    </button>
  )

  const stagger = (index: number) => ({ animationDelay: `${60 + index * 28}ms` })
  const rowEnter = "animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 motion-reduce:animate-none"
  const openItems = openGroup?.items ?? []
  const openAvailable = openGroup && onAdd ? available.filter((item) => keyOf(item) === openGroup.key) : []
  const panelContentWidth = barWidth !== null ? Math.max(barWidth, PANEL_WIDTH) : undefined

  const panelBlock = (
    <div
      className={cn(
        "grid overflow-hidden motion-reduce:transition-none",
        open
          ? cn("opacity-100 transition-[height,opacity]", "duration-[340ms]", EASE_SPRING)
          : cn("opacity-0", snap ? "transition-none" : "transition-[height,opacity] duration-150 ease-in"),
      )}
      style={{ height: open ? contentHeight : 0 }}
      inert={!open}
      aria-hidden={!open}
    >
      <div ref={contentRef} className={cn("self-start px-2 pt-2", panelContentWidth !== undefined && "mx-auto")} style={{ width: panelContentWidth }}>
        {openGroup && (
          <div
            key={openGroup.key}
            role="tabpanel"
            className={cn(
              "animate-in fade-in ease-out motion-reduce:animate-none",
              "duration-200",
              direction > 0 ? "slide-in-from-right-2" : "slide-in-from-left-2",
            )}
          >
            <div className="flex items-baseline justify-between gap-3 px-3 pt-2 pb-2.5">
              <p className={cn("text-[13px] font-semibold tracking-[-0.01em]", skin.strong)}>{copy(openGroup.key).name}</p>
              <p className={cn("truncate text-[12px]", skin.muted)}>{copy(openGroup.key).hint}</p>
            </div>
            <div className={"grid grid-cols-2 gap-1"}>
              {openItems.map((item, index) => {
                const here = item.slug === activeSlug
                return (
                  <button
                    key={item.slug}
                    type="button"
                    aria-current={here ? "page" : undefined}
                    onClick={() => go(item.slug)}
                    title={getStageDescriptionI18n(item.slug) ?? undefined}
                    style={stagger(index)}
                    className={cn(
                      "group/row flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 text-left transition-[background-color,box-shadow] duration-150 ease-out active:scale-[0.98]",
                      "py-2.5",
                      here ? skin.rowHere : skin.row,
                      rowEnter,
                    )}
                  >
                    <span
                      className="relative grid size-8 shrink-0 place-items-center rounded-[10px] transition-transform duration-200 ease-out group-hover/row:scale-105 motion-reduce:transition-none"
                      style={{ background: `color-mix(in srgb, ${item.hex} var(--dock-chip), transparent)` }}
                    >
                      <item.icon className="size-4" strokeWidth={1.9} style={{ color: item.hex }} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn("truncate text-[13px] font-medium", skin.strong)}>{getStageLabelI18n(item.slug)}</span>
                      {here ? (
                        <span className="text-[11.5px] font-medium" style={{ color: item.hex }}>
                          <Trans>You're here</Trans>
                        </span>
                      ) : (
                        <Status item={item} />
                      )}
                    </span>
                  </button>
                )
              })}
              {onAdd &&
                openAvailable.map((item, index) => (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => {
                      setOpen(null)
                      onAdd(item.slug)
                    }}
                    style={stagger(openItems.length + index)}
                    className={cn("group/row flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-150 ease-out active:scale-[0.98]", skin.row, rowEnter)}
                  >
                    <span
                      className="relative grid size-8 shrink-0 place-items-center rounded-[10px] border border-dashed transition-transform duration-200 ease-out group-hover/row:scale-105 motion-reduce:transition-none"
                      style={{ borderColor: `color-mix(in srgb, ${item.hex} 45%, transparent)` }}
                    >
                      <item.icon className="size-4" strokeWidth={1.9} style={{ color: item.hex }} />
                      <span className="absolute -right-1.5 -bottom-1.5 grid size-4 place-items-center rounded-full bg-[var(--dock-surface)] ring-1 ring-zinc-950/10 dark:ring-white/15">
                        <Plus className="size-2.5" strokeWidth={2.75} style={{ color: item.hex }} />
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn("truncate text-[13px] font-medium", skin.strong)}>{getStageLabelI18n(item.slug)}</span>
                      <span className={cn("text-[11.5px]", skin.muted)}>
                        <Trans>Not in the book yet</Trans>
                      </span>
                    </span>
                  </button>
                ))}
            </div>
            <div className="h-1.5" />
          </div>
        )}
      </div>
    </div>
  )

  const shellWidth = barWidth !== null ? (open ? Math.max(barWidth, PANEL_WIDTH) : barWidth) : undefined
  const shownTip = tip ?? lastTip

  return (
    <div ref={rootRef} className={cn("relative flex items-end", skin.surface)}>
      {shownTip && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-full z-10 mb-2.5 -translate-x-1/2 whitespace-nowrap rounded-[9px] px-2.5 py-1 text-[12px] font-medium shadow-[0_8px_20px_-8px_rgba(15,23,42,0.45)]",
            "transition-[left,opacity,translate] duration-200 motion-reduce:transition-none",
            EASE_SPRING,
            skin.tip,
            tip && !open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
          style={{ left: shownTip.x }}
        >
          {shownTip.label}
        </div>
      )}
      <div
        className={cn(
          "relative flex flex-col overflow-hidden",
          skin.shell,
          shellWidth !== undefined && !snap && cn("transition-[width] duration-[340ms] motion-reduce:transition-none", open ? EASE_SPRING : "ease-in"),
        )}
        style={{ width: shellWidth }}
      >
        {panelBlock}
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
            {homeButton}
            <span aria-hidden className={cn("mx-1.5 h-5 w-px shrink-0", skin.divider)} />
            {dockGroups.map(heroTab)}
          </div>
        </div>
      </div>
      {onMinimize && (
        <button
          type="button"
          onClick={onMinimize}
          title={t`Minimize the dock`}
          aria-label={t`Minimize the dock`}
          className={cn("absolute bottom-2.5 -right-10 grid size-8 cursor-pointer place-items-center rounded-full transition-colors duration-150", skin.minimize)}
        >
          <ChevronDown className="size-4" strokeWidth={1.9} />
        </button>
      )}
    </div>
  )
}
