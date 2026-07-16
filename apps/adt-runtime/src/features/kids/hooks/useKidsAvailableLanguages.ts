/**
 * Languages the kids reader can meaningfully switch to.
 *
 * Like the regular reader's `useAvailableLanguages`, but a language counts as
 * available when EITHER the book content is translated (`content/i18n/<lang>/
 * texts.json`) OR the kids interface is translated (`kids-*` keys in
 * `interface_translations/<lang>`). A kids book often ships the translated
 * buddy UI + voices for a language before (or instead of) the full book-text
 * translation, and switching should still localize the kids experience — so
 * the buddy language picker must offer it.
 */
import { useAtomValue } from "jotai"
import { useEffect, useMemo, useState } from "react"
import { appConfigAtom } from "@/shared/state/config.atoms"

interface KidsAvailableLanguagesResult {
  languages: string[]
  names: Record<string, string>
}

export function useKidsAvailableLanguages(): KidsAvailableLanguagesResult {
  const config = useAtomValue(appConfigAtom)
  const declared = useMemo(
    () => config.languages.available ?? [],
    [config.languages.available],
  )

  const [languages, setLanguages] = useState<string[]>([])
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    Promise.all(
      declared.map(async (lang) => {
        const [name, hasBook, hasKids] = await Promise.all([
          fetchLanguageName(lang),
          hasBookContent(lang),
          hasKidsInterface(lang),
        ])
        return { lang, name, available: hasBook || hasKids }
      }),
    ).then((results) => {
      if (cancelled) return
      const next: string[] = []
      const nextNames: Record<string, string> = {}
      for (const r of results) {
        nextNames[r.lang] = r.name
        if (r.available) next.push(r.lang)
      }
      setLanguages(next)
      setNames(nextNames)
    })

    return () => {
      cancelled = true
    }
  }, [declared])

  return { languages, names }
}

async function fetchLanguageName(lang: string): Promise<string> {
  try {
    const res = await fetch(
      `./assets/interface_translations/${lang}/interface_translations.json`,
    )
    if (!res.ok) return lang
    const data = (await res.json()) as Record<string, string>
    return data["language-name"] ?? lang
  } catch {
    return lang
  }
}

async function hasBookContent(lang: string): Promise<boolean> {
  try {
    const res = await fetch(`./content/i18n/${lang}/texts.json`)
    if (!res.ok) return false
    const data = (await res.json()) as Record<string, string>
    return Object.keys(data).length > 0
  } catch {
    return false
  }
}

async function hasKidsInterface(lang: string): Promise<boolean> {
  try {
    const res = await fetch(
      `./assets/interface_translations/${lang}/interface_translations.json`,
    )
    if (!res.ok) return false
    const data = (await res.json()) as Record<string, string>
    return Object.keys(data).some((key) => key.startsWith("kids-"))
  } catch {
    return false
  }
}
