import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import type { LucideIcon } from "lucide-react"
import { rankBySearch, searchTokens } from "../../search"
import { SETTINGS_PATHS } from "./nav"
import { SETTINGS_SEARCH_ENTRIES, buildSettingsSearchItems } from "./searchIndex"
import { useFocusSearchShortcut } from "./useFocusSearchShortcut"

export interface SettingsSearchResult {
  id: string
  title: string
  sub?: string
  icon?: LucideIcon
  onSelect: () => void
}

export interface UseSettingsSearchOptions {
  shortcutEnabled?: boolean
  clearOnSelect?: boolean
}

export function useSettingsSearch({
  shortcutEnabled = true,
  clearOnSelect = false,
}: UseSettingsSearchOptions = {}) {
  const navigate = useNavigate()
  const { i18n } = useLingui()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)

  useFocusSearchShortcut(inputRef, { enabled: shortcutEnabled })

  const results = useMemo<SettingsSearchResult[]>(() => {
    const tokens = searchTokens(query)
    if (tokens.length === 0) return []
    const items = buildSettingsSearchItems(i18n, SETTINGS_SEARCH_ENTRIES)
    return rankBySearch(items, tokens, (it) => ({
      title: it.title,
      extra: `${it.sub ?? ""} ${it.keywords ?? ""}`,
    })).map((it) => ({
      id: it.id,
      title: it.title,
      sub: it.sub,
      icon: it.icon,
      onSelect: () => {
        navigate({ to: SETTINGS_PATHS[it.section], hash: it.anchor })
        if (clearOnSelect) {
          setQuery("")
          inputRef.current?.blur()
        }
      },
    }))
  }, [query, i18n, navigate, clearOnSelect])

  const hasQuery = query.trim().length > 0

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
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
        setActiveIndex((i) => Math.min(results.length - 1, i + 1))
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((i) => Math.max(0, i - 1))
      } else if (event.key === "Enter") {
        event.preventDefault()
        results[activeIndex]?.onSelect()
      }
    },
    [query, hasQuery, results, activeIndex],
  )

  return {
    inputRef,
    query,
    setQuery,
    results,
    hasQuery,
    activeIndex,
    setActiveIndex,
    handleInputKeyDown,
  }
}
