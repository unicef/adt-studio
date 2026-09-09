import { msg } from "@lingui/core/macro"
import type { I18n, MessageDescriptor } from "@lingui/core"
import {
  Moon,
  Sun,
  MonitorCog,
  Languages,
  LayoutGrid,
  Rows3,
  ArrowDownWideNarrow,
  Layers,
  type LucideIcon,
} from "lucide-react"
import { readThemeMode, resolvesToDark, setThemeMode } from "@/lib/theme"
import {
  LIBRARY_GROUPS,
  LIBRARY_SORTS,
  LIBRARY_VIEWS,
  getLibraryPrefs,
  setLibraryPrefs,
  type LibraryGroup,
  type LibrarySort,
  type LibraryViewMode,
} from "@/hooks/use-library-prefs"
import { LOCALES, activateLocale, getStoredLocale, type AppLocale } from "@/i18n/locales"

export interface QuickAction {
  id: string
  title: string
  sub?: string
  keywords?: string
  icon?: LucideIcon
  active?: boolean
  run: () => void
}

export interface QuickActionDeps {
  goToLibrary: () => void
}

/* eslint-disable lingui/no-unlocalized-strings -- language names and English search aliases stay untranslated */
const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  "pt-BR": "Português (Brasil)",
  es: "Español",
  fr: "Français",
  sq: "Shqip",
}

const SORT_LABELS: Record<LibrarySort, MessageDescriptor> = {
  recent: msg`Recently edited`,
  title: msg`Title`,
  progress: msg`Progress`,
  pages: msg`Pages`,
  created: msg`Date added`,
}

const GROUP_LABELS: Record<LibraryGroup, MessageDescriptor> = {
  none: msg`No grouping`,
  attention: msg`Group by needs attention`,
}

const VIEW_LABELS: Record<LibraryViewMode, MessageDescriptor> = {
  grid: msg`Grid view`,
  list: msg`List view`,
}

const VIEW_ICONS: Record<LibraryViewMode, LucideIcon> = { grid: LayoutGrid, list: Rows3 }

const KEYWORDS = {
  theme: { msg: msg`theme appearance dark light mode`, en: "theme appearance dark light mode" },
  system: { msg: msg`theme appearance system automatic`, en: "theme appearance system automatic" },
  language: { msg: msg`language locale translation`, en: "language locale translation" },
  view: { msg: msg`library view layout grid list`, en: "library view layout grid list" },
  sort: { msg: msg`library sort order`, en: "library sort order" },
  group: { msg: msg`library group needs attention`, en: "library group needs attention" },
}
/* eslint-enable lingui/no-unlocalized-strings */

function terms(i18n: I18n, entry: { msg: MessageDescriptor; en: string }): string {
  const translated = i18n._(entry.msg)
  return translated === entry.en ? entry.en : `${translated} ${entry.en}`
}

export function buildQuickActions(i18n: I18n, deps: QuickActionDeps): QuickAction[] {
  const themeMode = readThemeMode()
  const isDark = resolvesToDark(themeMode)
  const prefs = getLibraryPrefs()
  const locale = getStoredLocale()

  const items: QuickAction[] = [
    {
      id: "qa-theme-toggle",
      title: isDark ? i18n._(msg`Switch to light theme`) : i18n._(msg`Switch to dark theme`),
      keywords: terms(i18n, KEYWORDS.theme),
      icon: isDark ? Sun : Moon,
      run: () => setThemeMode(isDark ? "light" : "dark"),
    },
    {
      id: "qa-theme-system",
      title: i18n._(msg`Match system theme`),
      keywords: terms(i18n, KEYWORDS.system),
      icon: MonitorCog,
      active: themeMode === "system",
      run: () => setThemeMode("system"),
    },
  ]

  for (const code of LOCALES) {
    items.push({
      id: `qa-locale-${code}`,
      title: LOCALE_LABELS[code],
      sub: i18n._(msg`Change language`),
      keywords: `${terms(i18n, KEYWORDS.language)} ${code} ${LOCALE_LABELS[code]}`,
      icon: Languages,
      active: locale === code,
      run: () => activateLocale(code),
    })
  }

  for (const view of LIBRARY_VIEWS) {
    items.push({
      id: `qa-view-${view}`,
      title: i18n._(VIEW_LABELS[view]),
      sub: i18n._(msg`Library`),
      keywords: `${terms(i18n, KEYWORDS.view)} ${view}`,
      icon: VIEW_ICONS[view],
      active: prefs.view === view,
      run: () => {
        setLibraryPrefs({ view })
        deps.goToLibrary()
      },
    })
  }

  for (const sort of LIBRARY_SORTS) {
    items.push({
      id: `qa-sort-${sort}`,
      title: i18n._(msg`Sort library by ${i18n._(SORT_LABELS[sort])}`),
      sub: i18n._(msg`Library`),
      keywords: `${terms(i18n, KEYWORDS.sort)} ${sort}`,
      icon: ArrowDownWideNarrow,
      active: prefs.sort === sort,
      run: () => {
        setLibraryPrefs({ sort })
        deps.goToLibrary()
      },
    })
  }

  for (const group of LIBRARY_GROUPS) {
    items.push({
      id: `qa-group-${group}`,
      title: i18n._(GROUP_LABELS[group]),
      sub: i18n._(msg`Library`),
      keywords: terms(i18n, KEYWORDS.group),
      icon: Layers,
      active: prefs.group === group,
      run: () => {
        setLibraryPrefs({ group })
        deps.goToLibrary()
      },
    })
  }

  return items
}
