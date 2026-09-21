import { useLingui } from "@lingui/react/macro"
import { useDirtyTabsForStage } from "@/hooks/use-settings-dirty-tabs"
import { cn } from "@/lib/utils"
import { BOOK_SETTINGS_GROUPS } from "./nav"

export interface BookSettingsNavListProps {
  section: string
  onSelect: (section: string) => void
}

export function BookSettingsNavList({ section, onSelect }: BookSettingsNavListProps) {
  const { t, i18n } = useLingui()
  const dirtyBook = useDirtyTabsForStage("book")
  const dirtyStoryboard = useDirtyTabsForStage("storyboard")

  return (
    <div className="flex flex-col gap-5">
      {BOOK_SETTINGS_GROUPS.map((group) => (
        <div key={group.key} className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
            {i18n._(group.label)}
          </div>
          {group.sections.map((entry) => {
            const Icon = entry.icon
            const active = entry.key === section
            const label = i18n._(entry.label)
            const dirty =
              entry.scope === "storyboard"
                ? dirtyStoryboard.has(entry.key)
                : dirtyBook.has(entry.key)
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => onSelect(entry.key)}
                aria-current={active ? "true" : undefined}
                aria-label={dirty ? t`${label} (unsaved changes)` : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-card font-semibold text-brand-700 shadow-sm ring-1 ring-border"
                    : "text-foreground hover:bg-black/5 dark:hover:bg-white/5",
                )}
              >
                <Icon className="size-[17px] shrink-0" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {dirty ? (
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      active ? "bg-brand-600" : "bg-amber-500",
                    )}
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
