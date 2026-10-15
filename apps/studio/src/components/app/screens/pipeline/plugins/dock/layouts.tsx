import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
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
  type DockOrder,
  type KeyedGroup,
  type NextCue,
} from "./model"
import { Badge, NextChip } from "./parts"
import { EASE_SPRING, SKIN, tabFocusClassName } from "./style"

export interface DockApi {
  groups: KeyedGroup[]
  allItems: DockItem[]
  inBook: (slug: string) => boolean
  open: string | null
  activeSlug: string | null | undefined
  next: DockNext | null
  cue: NextCue
  order: DockOrder
  attention: string[]
  register: (key: string) => (element: HTMLElement | null) => void
  toggle: (key: string) => void
  go: (slug: string) => void
  add: (slug: string) => void
  showTip: (label: string, element: HTMLElement) => void
  showCard: (item: DockItem, element: HTMLElement) => void
  hideTip: () => void
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

function arrange(order: DockOrder, content: ReactNode, later: ReactNode, hasLater: boolean) {
  return (
    <>
      {order === "cluster" ? <div className={cn("flex items-center gap-1.5 rounded-[17px]", SKIN.cluster)}>{content}</div> : content}
      {hasLater && (order === "none" ? <Divider /> : <OrderArrow />)}
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
        role="tab"
        aria-selected={isOpen}
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
        style={{ ["--tint" as string]: current?.hex ?? "currentColor" }}
      >
        <span className="relative grid size-5 place-items-center transition-transform duration-200 ease-out group-hover/tab:-translate-y-px motion-reduce:transition-none">
          <Icon className="size-5" strokeWidth={current ? 2 : 1.75} />
          <Badge items={group.items} attention={group.items.some((item) => api.attention.includes(item.slug))} />
        </span>
        {api.cue === "chip" && holdsNext && !current && <NextChip />}
      </button>
    )
  }

  const content = tabs.filter((group) => CONTENT_KEYS.includes(group.key))
  const later = tabs.filter((group) => !CONTENT_KEYS.includes(group.key))
  return arrange(api.order, content.map(tab), later.map(tab), later.length > 0)
}

export function FlatTabs({ api }: { api: DockApi }) {
  const { t } = useLingui()
  const items = STEP_ORDER.map((slug) => api.allItems.find((item) => item.slug === slug)).filter((item): item is DockItem => !!item)

  const tab = (item: DockItem) => {
    const current = item.slug === api.activeSlug
    const inBook = api.inBook(item.slug)
    const name = getStageLabelI18n(item.slug)
    return (
      <button
        key={item.slug}
        ref={api.register(item.slug)}
        type="button"
        aria-current={current ? "page" : undefined}
        aria-label={inBook ? name : t`${name}, not in the book yet`}
        onClick={() => (inBook || current ? api.go(item.slug) : api.add(item.slug))}
        onPointerEnter={(event) => api.showCard(item, event.currentTarget)}
        onFocus={(event) => api.showCard(item, event.currentTarget)}
        onPointerLeave={api.hideTip}
        onBlur={api.hideTip}
        className={cn(tabBaseClassName, "w-12 justify-center px-0", current ? "text-white" : SKIN.tabIdle)}
        style={{ ["--tint" as string]: item.hex }}
      >
        {inBook || current ? (
          <span className="relative grid size-5 place-items-center transition-transform duration-200 ease-out group-hover/tab:-translate-y-px motion-reduce:transition-none">
            <item.icon className="size-5 transition-colors duration-300" strokeWidth={current ? 2 : 1.8} style={{ color: current ? "#ffffff" : item.hex }} />
            <Badge items={[item]} attention={api.attention.includes(item.slug)} />
          </span>
        ) : (
          <span
            className="grid size-8 place-items-center rounded-[10px] border border-dashed opacity-75 transition-[opacity,translate] duration-200 ease-out group-hover/tab:-translate-y-px group-hover/tab:opacity-100 motion-reduce:transition-none"
            style={{ borderColor: `color-mix(in srgb, ${item.hex} 50%, transparent)` }}
          >
            <item.icon className="size-4" strokeWidth={1.9} style={{ color: item.hex }} />
          </span>
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
  return arrange(api.order, content, later.map(tab), later.length > 0)
}

export function PathTabs({ api }: { api: DockApi }) {
  const current = api.allItems.find((item) => item.slug === api.activeSlug)
  return (
    <>
      {current && (
        <span
          key={current.slug}
          ref={api.register("current")}
          className="relative flex h-12 shrink-0 items-center gap-2 rounded-[16px] px-3.5 text-[13.5px] font-semibold text-white animate-in fade-in duration-300 motion-reduce:animate-none"
        >
          <current.icon className="size-[18px]" strokeWidth={2} />
          <span className="whitespace-nowrap">{getStageLabelI18n(current.slug)}</span>
        </span>
      )}
      <AddButton api={api} />
    </>
  )
}

function AddButton({ api }: { api: DockApi }) {
  const isOpen = api.open === "features"
  return (
    <button
      ref={api.register("features")}
      type="button"
      aria-expanded={isOpen}
      onClick={() => api.toggle("features")}
      className={cn(tabBaseClassName, "gap-1.5 px-3.5 text-[13px] font-semibold", isOpen ? SKIN.tabOpen : SKIN.tabIdle)}
      style={{ ["--tint" as string]: "currentColor" }}
    >
      <Plus
        className={cn("size-[18px] transition-[rotate] duration-300 motion-reduce:transition-none", EASE_SPRING, isOpen && "rotate-45")}
        strokeWidth={2.1}
      />
      <span className="whitespace-nowrap">
        <Trans>Add</Trans>
      </span>
      {api.cue === "chip" && api.next && !isOpen && <NextChip />}
    </button>
  )
}

export function groupKeyFor(slug: string | null | undefined, groups: KeyedGroup[]): DockKey | null {
  return groups.find((group) => group.items.some((item) => item.slug === slug))?.key ?? null
}
