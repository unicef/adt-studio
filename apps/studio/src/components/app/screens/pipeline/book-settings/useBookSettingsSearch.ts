import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useLingui } from "@lingui/react/macro"
import type { LucideIcon } from "lucide-react"
import { rankBySearch, searchTokens } from "@/components/app/search"
import { useFocusSearchShortcut } from "@/components/app/screens/settings/useFocusSearchShortcut"
import {
  BOOK_SETTINGS_SEARCH_ENTRIES,
  buildBookSettingsSearchItems,
} from "./searchIndex"

export interface BookSettingsSearchResult {
  id: string
  title: string
  sub?: string
  icon?: LucideIcon
  onSelect: () => void
}

export function useBookSettingsSearch(
  onOpenSection: (section: string, anchor?: string) => void,
) {
  const { i18n } = useLingui()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)

  useFocusSearchShortcut(inputRef)

  const results = useMemo<BookSettingsSearchResult[]>(() => {
    const tokens = searchTokens(query)
    if (tokens.length === 0) return []
    const items = buildBookSettingsSearchItems(i18n, BOOK_SETTINGS_SEARCH_ENTRIES)
    return rankBySearch(items, tokens, (item) => ({
      title: item.title,
      extra: `${item.sub ?? ""} ${item.keywords ?? ""}`,
    })).map((item) => ({
      id: item.id,
      title: item.title,
      sub: item.sub,
      icon: item.icon,
      onSelect: () => {
        onOpenSection(item.section, item.anchor)
        setQuery("")
        inputRef.current?.blur()
      },
    }))
  }, [query, i18n, i18n.locale, onOpenSection])

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
        setActiveIndex((index) => Math.min(results.length - 1, index + 1))
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((index) => Math.max(0, index - 1))
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
