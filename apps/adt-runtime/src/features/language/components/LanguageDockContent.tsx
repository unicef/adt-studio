import { useAtom, useAtomValue } from "jotai"
import { useMemo, useState } from "react"
import { currentLanguageAtom } from "@/features/language/state/language.atoms"
import { useAvailableLanguages } from "@/features/language/hooks/useAvailableLanguages"
import { useTranslation } from "@/features/language/hooks/useTranslation"
import { cn } from "@/shared/lib/utils"
import { ScrollArea } from "@/shared/ui/scroll-area"
import { DockContent } from "@/features/dock/components/DockLayout"
import { ToggleRow } from "@/features/settings/components/ToggleRow"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { easyReadModeAtom } from "@/shared/state/ui.atoms"
import { trackToggleEvent } from "@/shared/lib/analytics"

interface LanguageContentProps {
  onSelect?: () => void
}

export function LanguageContent({ onSelect }: LanguageContentProps) {
  const [currentLanguage, setCurrentLanguage] = useAtom(currentLanguageAtom)
  const { languages, names } = useAvailableLanguages()
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const features = useAtomValue(appConfigAtom).features
  const [easyRead, setEasyRead] = useAtom(easyReadModeAtom)

  const filtered = useMemo(() => {
    if (!query.trim()) return languages
    const q = query.trim().toLowerCase()
    return languages.filter((lang) => {
      const name = names[lang] ?? lang
      return name.toLowerCase().includes(q) || lang.toLowerCase().includes(q)
    })
  }, [languages, names, query])

  if (languages.length === 0) return null

  return (
    <DockContent className="h-auto">
      <DockContent.Search
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ScrollArea className="flex-1 min-h-0">
        <ul>
          {filtered.map((lang) => {
            const active = lang === currentLanguage
            return (
              <li key={lang}>
                <button
                  type="button"
                  title={names[lang] ?? lang}
                  onClick={() => {
                    setCurrentLanguage(lang)
                    onSelect?.()
                  }}
                  className={cn(
                    "w-full text-left px-2.5 py-2 rounded-lg text-base",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus:outline-none focus:bg-accent focus:text-accent-foreground",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    active && "bg-accent text-accent-foreground font-medium",
                  )}
                  aria-current={active ? "true" : undefined}
                >
                  {names[lang] ?? lang}
                </button>
              </li>
            )
          })}
          {filtered.length === 0 ? (
            <li className="px-2.5 py-2 text-base text-muted-foreground">
              {t("language-search-empty") || "No matches"}
            </li>
          ) : null}
        </ul>
      </ScrollArea>
      {features.easyRead ? (
        <div className="px-2.5">
          <ToggleRow
            label={t("easy-read-label") || "Easy Read"}
            checked={easyRead}
            onChange={(next) => {
              trackToggleEvent("EasyRead", next)
              setEasyRead(next)
            }}
            borderTop
          />
        </div>
      ) : null}
    </DockContent>
  )
}
