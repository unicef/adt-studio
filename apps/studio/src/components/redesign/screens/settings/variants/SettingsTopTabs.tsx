import { Fragment, useEffect, useRef } from "react"
import { Link, useLocation } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { ArrowLeft } from "lucide-react"
import { NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"
import { usePlatform } from "@/hooks/use-platform"
import { useWindowControls } from "@/hooks/use-window-controls"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SETTINGS_GROUPS, SETTINGS_PATHS, activeSettingsTab } from "../nav"
import { REDESIGN_PATHS } from "../../../nav"
import { useSettingsSearch } from "../useSettingsSearch"
import { SettingsSearchBar } from "./SettingsSearchBar"
import { SettingsResultsList } from "./SettingsResultsList"

export function SettingsTopTabs() {
  const { pathname } = useLocation()
  const { i18n, t } = useLingui()
  const activeKey = activeSettingsTab(pathname).key
  const platform = usePlatform()
  const { available } = useWindowControls()
  const macChrome = platform === "macos" && available
  const searchWrapRef = useRef<HTMLDivElement>(null)
  const {
    inputRef,
    query,
    setQuery,
    results,
    hasQuery,
    activeIndex,
    setActiveIndex,
    handleInputKeyDown,
  } = useSettingsSearch({ clearOnSelect: true })

  useEffect(() => {
    if (!hasQuery) return
    const onPointerDown = (event: PointerEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target as Node)) {
        setQuery("")
      }
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [hasQuery, setQuery])

  return (
    <div
      style={NO_DRAG_REGION}
      className={cn(
        "relative z-[4] flex shrink-0 items-center gap-3 border-b bg-background px-4 pb-3 pt-14",
        macChrome && "pl-[88px]",
      )}
    >
      <Link
        to={REDESIGN_PATHS.home}
        aria-label={t`Back to home`}
        title={t`Back to home`}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
      >
        <ArrowLeft className="size-[17px]" />
      </Link>
      <span className="mr-1 h-5 w-px shrink-0 bg-border" aria-hidden />

      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {SETTINGS_GROUPS.map((group, groupIndex) => (
          <Fragment key={group.key}>
            {groupIndex > 0 ? <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden /> : null}
            {group.tabs.map((tab) => {
              const Icon = tab.icon
              const active = activeKey === tab.key
              return (
                <Link
                  key={tab.key}
                  to={SETTINGS_PATHS[tab.key]}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-card text-brand-700 shadow-[0_1px_2px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.05)]"
                      : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{i18n._(tab.label)}</span>
                </Link>
              )
            })}
          </Fragment>
        ))}
      </nav>

      <div ref={searchWrapRef} className="relative shrink-0">
        <SettingsSearchBar
          inputRef={inputRef}
          value={query}
          onChange={setQuery}
          onKeyDown={handleInputKeyDown}
          className="w-56"
        />
        {hasQuery ? (
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-80 rounded-xl border bg-card p-1.5 shadow-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150">
            <ScrollArea className="max-h-[min(60vh,420px)]">
              <SettingsResultsList
                results={results}
                activeIndex={activeIndex}
                onActiveChange={setActiveIndex}
                onRun={(result) => result.onSelect()}
                query={query}
                layout="popover"
              />
            </ScrollArea>
          </div>
        ) : null}
      </div>
    </div>
  )
}
