import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { ChevronRight, Plus, Sparkles } from "lucide-react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import {
  ACCESSIBILITY_SLUGS,
  CONTENT_KEYS,
  GROUP_ICON,
  STEP_ORDER,
  keyOf,
  useGroupCopy,
  type DockKey,
  type DockNext,
  type KeyedGroup,
} from "./model"
import { InBookTile } from "./InBookTile"
import { NotRunTile } from "./NotRunTile"
import { highlightStyle } from "./StoryboardEntry"
import { Badge, NextChip } from "./parts"
import { useStepFacts } from "./stepFacts"
import { EASE_SPRING, SKIN, tabFocusClassName } from "./style"

export interface DockApi {
  groups: KeyedGroup[]
  allItems: DockItem[]
  inBook: (slug: string) => boolean
  open: string | null
  activeSlug: string | null | undefined
  next: DockNext | null
  attention: string[]
  previewing: string | null
  register: (key: string) => (element: HTMLElement | null) => void
  toggle: (key: string) => void
  go: (slug: string) => void
  add: (slug: string) => void
  showTip: (label: string, element: HTMLElement) => void
  showCard: (item: DockItem, element: HTMLElement, via?: "focus" | "pointer") => void
  hideTip: () => void
  inlineHighlight: boolean
}

const tabBaseClassName = cn(
  "group/tab relative flex h-12 shrink-0 cursor-pointer items-center rounded-[16px] outline-none",
  "transition-[background-color,color,box-shadow,scale] duration-200 ease-out active:scale-[0.94] motion-reduce:transition-none",
  tabFocusClassName,
)

function tipHandlers(api: DockApi, label: string) {
  return {
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => api.showTip(label, event.currentTarget),
    onFocus: (event: React.FocusEvent<HTMLElement>) => api.showTip(label, event.currentTarget),
    onPointerLeave: api.hideTip,
    onBlur: api.hideTip,
  }
}

function OrderArrow() {
  return <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 opacity-70", SKIN.muted)} strokeWidth={2.25} />
}

function Divider() {
  return <span aria-hidden className={cn("mx-0.5 h-5 w-px shrink-0", SKIN.divider)} />
}

function arrange(content: ReactNode, later: ReactNode, hasLater: boolean) {
  return (
    <>
      {content}
      {hasLater && <OrderArrow />}
      {later}
    </>
  )
}

export function GroupTabs({ api }: { api: DockApi }) {
  const { t } = useLingui()
  const copy = useGroupCopy()
  const tabs = api.groups.filter((group) => group.key !== "convert")

  const tab = (group: KeyedGroup) => {
    const current = group.items.find((item) => item.slug === api.activeSlug)
    const isOpen = api.open === group.key
    const Icon = current?.icon ?? GROUP_ICON[group.key] ?? Sparkles
    const { name } = copy(group.key)
    const holdsNext = !!api.next && [...group.items, ...api.allItems.filter((item) => keyOf(item) === group.key)].some((item) => item.slug === api.next?.slug)
    return (
      <button
        key={group.key}
        ref={api.register(group.key)}
        type="button"
        aria-expanded={isOpen}
        aria-current={current ? "page" : undefined}
        aria-label={current ? t`${name}: ${getStageLabelI18n(current.slug)}` : name}
        onClick={() => api.toggle(group.key)}
        {...tipHandlers(api, name)}
        className={cn(
          tabBaseClassName,
          "px-3.5",
          current ? "text-white" : isOpen ? SKIN.tabOpen : SKIN.tabIdle,
          current && isOpen && "ring-2 ring-[var(--tint)] ring-offset-2 ring-offset-[var(--dock-surface)]",
        )}
        style={{ ["--tint" as string]: current?.hex ?? "currentColor", ...(current && api.inlineHighlight ? highlightStyle(current.hex) : {}) }}
      >
        <span className="relative grid size-5 place-items-center transition-transform duration-200 ease-out group-hover/tab:-translate-y-px motion-reduce:transition-none">
          <Icon className="size-5" strokeWidth={current ? 2 : 1.75} />
          <Badge items={group.items} attention={group.items.some((item) => api.attention.includes(item.slug))} />
        </span>
        {holdsNext && !current && <NextChip />}
      </button>
    )
  }

  const content = tabs.filter((group) => CONTENT_KEYS.includes(group.key))
  const later = tabs.filter((group) => !CONTENT_KEYS.includes(group.key))
  return arrange(content.map(tab), later.map(tab), later.length > 0)
}

export function FlatTabs({ api, only, compact = false }: { api: DockApi; only?: (item: DockItem) => boolean; compact?: boolean }) {
  const { t } = useLingui()
  const facts = useStepFacts()
  const statusOf = (item: DockItem) =>
    item.state === "running" || item.state === "queued"
      ? t`running`
      : item.state === "error"
        ? t`failed`
        : item.pending > 0
          ? t`${plural(item.pending, { one: "# to review", other: "# to review" })}`
          : api.attention.includes(item.slug)
            ? t`needs updating`
            : t`in the book`
  const items = STEP_ORDER.map((slug) => api.allItems.find((item) => item.slug === slug)).filter(
    (item): item is DockItem => !!item && (!only || only(item)),
  )

  const tab = (item: DockItem) => {
    const current = item.slug === api.activeSlug
    const inBook = api.inBook(item.slug)
    const name = facts(item.slug).label
    return (
      <button
        key={item.slug}
        ref={api.register(item.slug)}
        type="button"
        aria-current={current ? "page" : undefined}
        aria-label={inBook ? t`${name}, ${statusOf(item)}` : current ? name : t`Set up ${name} (not in the book yet)`}
        onClick={() => (inBook || current ? api.go(item.slug) : api.add(item.slug))}
        onPointerEnter={(event) => api.showCard(item, event.currentTarget)}
        onFocus={(event) => api.showCard(item, event.currentTarget, "focus")}
        onPointerLeave={api.hideTip}
        onBlur={api.hideTip}
        className={cn(
          tabBaseClassName,
          "w-12 justify-center px-0",
          compact && "h-10 w-10 rounded-[13px]",
          current ? "text-white" : "text-zinc-500 dark:text-white/55",
        )}
        style={{ ["--tint" as string]: item.hex, ...(current && api.inlineHighlight ? highlightStyle(item.hex) : {}) }}
        data-preview={api.previewing === item.slug || undefined}
      >
        {current ? (
          <span className="relative grid size-5 place-items-center transition-transform duration-200 ease-out group-hover/tab:-translate-y-px motion-reduce:transition-none">
            <item.icon className="size-5 transition-colors duration-300" strokeWidth={2} style={{ color: "#ffffff" }} />
            <Badge items={[item]} attention={api.attention.includes(item.slug)} />
          </span>
        ) : inBook ? (
          <InBookTile item={item} attention={api.attention.includes(item.slug)} />
        ) : (
          <NotRunTile item={item} />
        )}
      </button>
    )
  }

  const accessibility = items.filter((item) => ACCESSIBILITY_SLUGS.includes(item.slug))
  const extras = items.filter((item) => keyOf(item) === "enhancements")
  const later = items.filter((item) => keyOf(item) === "localization")
  const content = (
    <>
      {accessibility.map(tab)}
      {accessibility.length > 0 && extras.length > 0 && <Divider />}
      {extras.map(tab)}
    </>
  )
  return arrange(content, later.map(tab), later.length > 0)
}

export function PathTabs({ api }: { api: DockApi }) {
  const shown = (item: DockItem) => api.inBook(item.slug) || item.slug === api.activeSlug
  const any = api.allItems.some(shown)
  return (
    <>
      {any && <FlatTabs api={api} only={shown} />}
      {any && <Divider />}
      <AddButton api={api} />
    </>
  )
}

function AddButton({ api }: { api: DockApi }) {
  const { t } = useLingui()
  const isOpen = api.open === "features"
  const missingEssential = api.allItems.some((item) => item.slug === "captions") && !api.inBook("captions")
  return (
    <button
      ref={api.register("features")}
      type="button"
      aria-expanded={isOpen}
      title={missingEssential ? t`Image descriptions are missing: every book needs them` : undefined}
      onClick={() => api.toggle("features")}
      className={cn(tabBaseClassName, "gap-1.5 px-3.5 text-[13px] font-semibold", isOpen ? SKIN.tabOpen : SKIN.tabIdle)}
      style={{ ["--tint" as string]: "currentColor" }}
    >
      <span className="relative grid size-[18px] place-items-center">
        <Plus
          className={cn("size-[18px] transition-[rotate] duration-300 motion-reduce:transition-none", EASE_SPRING, isOpen && "rotate-45")}
          strokeWidth={2.1}
        />
        <Badge items={[]} attention={missingEssential && !isOpen} />
      </span>
      <span className="whitespace-nowrap">
        <Trans>Add</Trans>
      </span>
    </button>
  )
}

export function groupKeyFor(slug: string | null | undefined, groups: KeyedGroup[]): DockKey | null {
  return groups.find((group) => group.items.some((item) => item.slug === slug))?.key ?? null
}
