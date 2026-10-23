import { useLayoutEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { STEP_ORDER } from "./model"
import { FlatTabs, type DockApi } from "./layouts"
import { EASE_SPRING, SKIN, tabFocusClassName } from "./style"

export const ISLAND_TOGGLE_KEY = "extras-toggle"

export const islandMotionMs = 420

const collapsedStore = createPersistentStore<boolean>("adt.dock.extras-collapsed", false, (value): value is boolean => typeof value === "boolean")

export const useExtrasCollapsed = collapsedStore.use

export const islandShellIdleClassName = "rounded-[24px] bg-transparent ring-1 ring-transparent shadow-none"

export const bookIslandClassName = cn(
  "flex shrink-0 items-center gap-1.5 rounded-[20px] p-1.5",
  "transition-[background-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
)

export const bookIslandIdleClassName = cn(
  "bg-white shadow-[0_0_0_1px_rgba(9,9,11,0.07),0_18px_36px_-18px_rgba(15,23,42,0.32),0_2px_6px_-2px_rgba(15,23,42,0.08)]",
  "dark:bg-zinc-950 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_18px_40px_-16px_rgba(0,0,0,0.7)]",
)

const quietIdleClassName = cn(
  "bg-white/90 shadow-[0_0_0_1px_rgba(9,9,11,0.05),0_10px_24px_-16px_rgba(15,23,42,0.25)]",
  "dark:bg-zinc-950/85 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)]",
)

export function IslandExtras({ api, collapsed, merged, onToggle }: { api: DockApi; collapsed: boolean; merged: boolean; onToggle: () => void }) {
  const { t } = useLingui()
  const innerRef = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState<number | null>(null)
  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner) return
    const measure = () => setFull(inner.offsetWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  const items = STEP_ORDER.flatMap((slug) => api.allItems.filter((item) => item.slug === slug))
  const shown = items.filter((item) => api.inBook(item.slug))
  const current = items.find((item) => item.slug === api.activeSlug)
  const label = collapsed ? t`Show extras` : t`Hide extras`

  return (
    <div className={cn(bookIslandClassName, "gap-1 p-1", merged ? "bg-transparent shadow-none" : quietIdleClassName)}>
      <div
        inert={collapsed}
        aria-hidden={collapsed}
        className={cn("-my-2 overflow-hidden py-2 transition-[width] motion-reduce:transition-none", EASE_SPRING)}
        style={{ width: collapsed ? 0 : (full ?? undefined), transitionDuration: `${islandMotionMs}ms` }}
      >
        <div
          ref={innerRef}
          className={cn(
            "flex w-max items-center gap-1 px-0.5",
            "[&>*]:transition-[opacity,scale] [&>*]:duration-300 [&>*]:ease-out motion-reduce:[&>*]:transition-none",
            collapsed && "[&>*]:scale-90 [&>*]:opacity-0",
          )}
        >
          <FlatTabs api={api} compact />
        </div>
      </div>
      <button
        ref={api.register(ISLAND_TOGGLE_KEY)}
        type="button"
        aria-expanded={!collapsed}
        aria-label={collapsed && current ? t`${label}: ${getStageLabelI18n(current.slug)}` : label}
        onClick={onToggle}
        onPointerEnter={(event) => api.showTip(label, event.currentTarget)}
        onFocus={(event) => api.showTip(label, event.currentTarget)}
        onPointerLeave={api.hideTip}
        onBlur={api.hideTip}
        className={cn(
          "group/tab relative flex h-10 shrink-0 cursor-pointer items-center justify-center gap-0 rounded-[13px] outline-none",
          "transition-[background-color,color,scale] duration-200 ease-out active:scale-[0.94] motion-reduce:transition-none",
          tabFocusClassName,
          "min-w-8 px-2",
          collapsed && current ? "text-white" : cn(SKIN.muted, "hover:bg-zinc-950/[0.05] hover:text-zinc-950 dark:hover:bg-white/[0.08] dark:hover:text-white"),
        )}
      >
        <span
          className={cn("grid transition-[grid-template-columns,opacity] motion-reduce:transition-none", EASE_SPRING, collapsed ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0")}
          style={{ transitionDuration: `${islandMotionMs}ms` }}
        >
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden pr-1">
            {current ? (
              <current.icon aria-hidden className="relative size-[18px] shrink-0" strokeWidth={2} />
            ) : (
              <span className="flex shrink-0 -space-x-1.5 py-0.5 pl-0.5">
                {shown.slice(0, 3).map((item) => (
                  <span
                    key={item.slug}
                    className="grid size-6 place-items-center rounded-full bg-[color-mix(in_srgb,var(--tint)_18%,var(--dock-surface))] ring-2 ring-[var(--dock-surface)]"
                    style={{ ["--tint" as string]: item.hex }}
                  >
                    <item.icon aria-hidden className="size-3.5" strokeWidth={2} style={{ color: item.hex }} />
                  </span>
                ))}
              </span>
            )}
            {!current && shown.length > 3 && <span className="shrink-0 text-[12px] font-semibold tabular-nums">{`+${shown.length - 3}`}</span>}
          </span>
        </span>
        <ChevronLeft
          aria-hidden
          className={cn("relative size-4 shrink-0 transition-[rotate] motion-reduce:transition-none", EASE_SPRING, collapsed && "rotate-180", collapsed && current && "text-white/80")}
          strokeWidth={2.25}
          style={{ transitionDuration: `${islandMotionMs}ms` }}
        />
      </button>
    </div>
  )
}
