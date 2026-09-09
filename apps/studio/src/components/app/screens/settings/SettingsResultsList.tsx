import { useEffect, useRef } from "react"
import { CornerDownLeft } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import type { SettingsSearchResult } from "./useSettingsSearch"

export const SETTINGS_RESULTS_ID = "settings-search-results"
export const settingsResultId = (resultId: string) => `${SETTINGS_RESULTS_ID}-${resultId}`

interface SettingsResultsListProps {
  results: SettingsSearchResult[]
  activeIndex: number
  onActiveChange: (index: number) => void
  onRun: (result: SettingsSearchResult) => void
  query: string
  layout?: "rail" | "pane" | "popover"
}

export function SettingsResultsList({
  results,
  activeIndex,
  onActiveChange,
  onRun,
  query,
  layout = "rail",
}: SettingsResultsListProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  if (results.length === 0) {
    return (
      <div
        className={cn(
          "text-center text-[12.5px] leading-normal text-muted-foreground",
          layout === "pane" ? "px-5 py-16" : "px-3 py-10",
        )}
      >
        <Trans>No settings match “{query}”</Trans>
      </div>
    )
  }

  return (
    <div
      id={SETTINGS_RESULTS_ID}
      role="listbox"
      className={cn(
        "flex flex-col motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150",
        layout === "pane" ? "gap-1" : "gap-0.5",
      )}
    >
      {results.map((result, index) => {
        const Icon = result.icon
        const active = index === activeIndex
        return (
          <button
            key={result.id}
            id={settingsResultId(result.id)}
            ref={active ? activeRef : undefined}
            type="button"
            role="option"
            aria-selected={active}
            tabIndex={-1}
            onClick={() => onRun(result)}
            onMouseMove={() => onActiveChange(index)}
            className={cn(
              "group flex w-full items-center gap-2.5 rounded-lg text-left transition-colors",
              layout === "pane" ? "px-3 py-2.5" : "px-2.5 py-2",
              active ? "bg-muted" : "hover:bg-black/5 dark:hover:bg-white/5",
            )}
          >
            <span
              className={cn(
                "grid shrink-0 place-items-center rounded-md bg-brand-50 text-brand-600",
                layout === "pane" ? "size-8" : "size-7",
              )}
            >
              {Icon ? <Icon className={layout === "pane" ? "size-[18px]" : "size-4"} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate font-medium text-foreground",
                  layout === "pane" ? "text-sm" : "text-[13px]",
                )}
              >
                {result.title}
              </span>
              {result.sub ? (
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {result.sub}
                </span>
              ) : null}
            </span>
            <CornerDownLeft
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
