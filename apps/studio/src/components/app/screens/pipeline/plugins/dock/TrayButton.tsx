import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { STEP_ORDER } from "./model"
import { FlatTabs, type DockApi } from "./layouts"
import { EASE_SPRING, SKIN, tabFocusClassName } from "./style"

export function TrayTabs({ api }: { api: DockApi }) {
  const shownBeside = (slug: string, state: string) => slug === api.activeSlug || state === "running" || state === "queued" || state === "error"
  const beside = api.allItems.some((item) => shownBeside(item.slug, item.state))
  return (
    <>
      {beside && <FlatTabs api={api} only={(item) => shownBeside(item.slug, item.state)} />}
      <TrayButton api={api} />
    </>
  )
}

function TrayButton({ api }: { api: DockApi }) {
  const { t } = useLingui()
  const isOpen = api.open === "features"
  const items = STEP_ORDER.flatMap((slug) => api.allItems.filter((item) => item.slug === slug))
  const shown = items.filter((item) => api.inBook(item.slug))
  const attention = items.some((item) => api.attention.includes(item.slug) || item.pending > 0)
  return (
    <button
      ref={api.register("features")}
      type="button"
      aria-expanded={isOpen}
      aria-label={t`Extras, ${shown.length} in the book`}
      onClick={() => api.toggle("features")}
      className={cn(
        "group/tab relative flex h-12 shrink-0 cursor-pointer items-center gap-2.5 rounded-[16px] pr-3 pl-2.5 text-[13.5px] font-semibold outline-none",
        "transition-[background-color,color,box-shadow,scale] duration-200 ease-out active:scale-[0.96] motion-reduce:transition-none",
        tabFocusClassName,
        isOpen ? SKIN.tabOpen : cn(SKIN.strong, "bg-zinc-950/[0.04] hover:bg-zinc-950/[0.07] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"),
      )}
    >
      {shown.length > 0 && (
        <span className="flex -space-x-2">
          {shown.slice(0, 4).map((item, index) => (
            <span
              key={item.slug}
              className={cn(
                "grid size-6 place-items-center rounded-full ring-2 ring-[var(--dock-surface)] transition-transform duration-300 motion-reduce:transition-none",
                EASE_SPRING,
                "bg-[color-mix(in_srgb,var(--tint)_18%,var(--dock-surface))]",
              )}
              style={{ ["--tint" as string]: item.hex, transform: isOpen ? `translateY(-${2 + index}px)` : undefined, transitionDelay: `${index * 30}ms` }}
            >
              <item.icon aria-hidden className="size-3.5" strokeWidth={2} style={{ color: item.hex }} />
            </span>
          ))}
        </span>
      )}
      <Trans>Extras</Trans>
      <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", SKIN.muted, "bg-zinc-950/[0.06] dark:bg-white/[0.1]")}>{shown.length}</span>
      <ChevronUp aria-hidden className={cn("size-4 transition-[rotate] duration-300 motion-reduce:transition-none", EASE_SPRING, SKIN.muted, isOpen && "rotate-180")} />
      {attention && !isOpen && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-amber-400 ring-2 ring-[var(--dock-surface)]" />}
    </button>
  )
}
