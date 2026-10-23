/**
 * Loads `./content/i18n/<lang>/glossary.json` and writes it into
 * `glossaryDataAtom`. Called from the boot lifecycle and on every language
 * change so the panel + highlighter always reflect the current locale.
 */
import { getDefaultStore } from "jotai"
import {
  glossaryDataAtom,
  type GlossaryData,
} from "@/features/glossary/state/glossary.atoms"

export async function loadGlossary(
  lang: string,
  bundleVersion?: string,
  isCurrent: () => boolean = () => true,
): Promise<GlossaryData> {
  const versionParam = bundleVersion ? `?v=${bundleVersion}` : ""
  const url = `./content/i18n/${lang}/glossary.json${versionParam}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[glossary] ${url} returned ${res.status}`)
      if (isCurrent()) getDefaultStore().set(glossaryDataAtom, {})
      return {}
    }
    const data = (await res.json()) as GlossaryData
    if (isCurrent()) getDefaultStore().set(glossaryDataAtom, data ?? {})
    return data ?? {}
  } catch (err) {
    console.warn(`[glossary] failed to load ${url}`, err)
    if (isCurrent()) getDefaultStore().set(glossaryDataAtom, {})
    return {}
  }
}
