import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useDirtyTabsForStage } from "@/hooks/use-settings-dirty-tabs"
import { cn } from "@/lib/utils"
import { useFocusSearchShortcut } from "@/components/app/screens/settings/useFocusSearchShortcut"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { SettingsRailSearch } from "./SettingsRailSearch"
import { rankStepSettings, type RailSearchResult } from "./searchIndex"
import type { StepSettingsSlug, StepSettingsTab } from "./slugs"

const SEARCH_MIN_TABS = 2
const RAIL_RESULTS_ID = "step-settings-tabs"
const railTabId = (key: string) => `${RAIL_RESULTS_ID}-${key}`

export interface SettingsTabsRailProps {
  slug: StepSettingsSlug
  hex: string
  tabs: StepSettingsTab[]
  activeTab: string
  onSelect: (tab: string, anchor?: string) => void
}

export function SettingsTabsRail({ slug, hex, tabs, activeTab, onSelect }: SettingsTabsRailProps) {
  const { t, i18n } = useLingui()
  const dirtyTabs = useDirtyTabsForStage(slug)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)

  const searchable = tabs.length >= SEARCH_MIN_TABS
  useFocusSearchShortcut(inputRef, { enabled: searchable })

  const results = rankStepSettings(query, slug, tabs, i18n)
  const hasQuery = query.trim().length > 0
  const highlighted = Math.min(highlight, Math.max(0, results.length - 1))

  useEffect(() => {
    setHighlight(0)
  }, [query])

  const runResult = (result: RailSearchResult | undefined) => {
    if (!result) return
    onSelect(result.tab, result.anchor)
    setQuery("")
    inputRef.current?.blur()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      if (query.length > 0) setQuery("")
      else inputRef.current?.blur()
      return
    }
    if (!hasQuery || results.length === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlight(Math.min(results.length - 1, highlighted + 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlight(Math.max(0, highlighted - 1))
    } else if (event.key === "Enter") {
      event.preventDefault()
      runResult(results[highlighted])
    }
  }

  return (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Trans>Settings</Trans>
      </span>

      {searchable ? (
        <SettingsRailSearch
          inputRef={inputRef}
          value={query}
          hex={hex}
          onChange={setQuery}
          onKeyDown={handleKeyDown}
          resultsId={hasQuery ? RAIL_RESULTS_ID : undefined}
          activeResultId={results[highlighted] ? railTabId(results[highlighted].id) : undefined}
        />
      ) : null}

      <ScrollArea className="-mx-1 min-h-0 flex-1">
        {hasQuery ? (
          results.length === 0 ? (
            <p className="px-2 py-6 text-center text-[10.5px] leading-normal text-muted-foreground">
              <Trans>No settings match “{query}”</Trans>
            </p>
          ) : (
            <div id={RAIL_RESULTS_ID} role="listbox" className="flex flex-col gap-0.5 px-1">
              {results.map((result, index) => {
                const aimed = index === highlighted
                return (
                  <button
                    key={result.id}
                    id={railTabId(result.id)}
                    type="button"
                    role="option"
                    aria-selected={aimed}
                    onClick={() => runResult(result)}
                    onMouseMove={() => setHighlight(index)}
                    className={cn(
                      "flex flex-col gap-px rounded-md px-1.5 py-1.5 text-left transition-colors",
                      aimed ? "bg-muted" : "hover:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "truncate text-[11px]",
                        result.kind === "tab"
                          ? "font-semibold text-foreground"
                          : "text-foreground",
                      )}
                    >
                      {result.title}
                    </span>
                    {result.sub ? (
                      <span className="truncate text-[9.5px] text-muted-foreground">
                        {result.sub}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-0.5 px-1">
            {tabs.map((tab) => {
              const active = tab.key === activeTab
              const dirty = dirtyTabs.has(tab.key)
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onSelect(tab.key)}
                  aria-current={active ? "true" : undefined}
                  aria-label={dirty ? t`${tab.label} (unsaved changes)` : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[11px] transition-colors",
                    active ? "font-semibold" : "text-muted-foreground hover:bg-muted",
                  )}
                  style={active ? { background: tint(hex, 0.12), color: hex } : undefined}
                >
                  <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                  {dirty && (
                    <span
                      aria-hidden
                      className={cn("size-1.5 shrink-0 rounded-full", !active && "bg-amber-500")}
                      style={active ? { background: hex } : undefined}
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>

      <div className="border-t pt-2.5 text-[10px] leading-relaxed text-muted-foreground">
        <Trans>Changes apply to this book only. Re-run the step to use them.</Trans>
      </div>
    </>
  )
}
