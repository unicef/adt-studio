import { useAllProjectFeatures, type ExportFeatureToggles } from "@/hooks/use-export-features"
import { useExportLanguages } from "@/components/pipeline/stages/export/ExportDialog"
import type { ExportFlow } from "../useExportFlow"

export type FeatureKey = keyof Omit<ExportFeatureToggles, "languages">

export interface FeatureOption {
  key: FeatureKey
  slug: "glossary" | "speech" | "quizzes" | "sign-language"
  on: boolean
  large: boolean
}

export interface ReadinessItem {
  slug: "captions" | "toc" | "easy-read" | "sign-language"
  done: boolean
}

export interface ExportOptions {
  isProject: boolean
  features: FeatureOption[]
  languages: {
    all: string[]
    included: string[]
    excluded: string[]
    opensIn: string | null
    bookLanguage: string | null
    customized: boolean
  }
  readiness: ReadinessItem[]
  setFeature: (key: FeatureKey, on: boolean) => void
  includeLanguage: (lang: string, include: boolean) => void
  moveLanguage: (lang: string, to: number) => void
  resetLanguages: () => void
}

export function useExportOptions(flow: ExportFlow, label: string): ExportOptions {
  const project = useAllProjectFeatures(label)
  const all = useExportLanguages(label)
  const included = (flow.languageOrder ?? all).filter((lang) => all.includes(lang))
  const excluded = all.filter((lang) => !included.includes(lang))
  const bookLanguage = all[0] ?? null
  const opensIn = bookLanguage && included.includes(bookLanguage) ? bookLanguage : (included[0] ?? null)
  const customized = included.length !== all.length || included.some((lang, index) => lang !== all[index])

  const features: FeatureOption[] = (
    [
      { key: "glossary", slug: "glossary", large: false },
      { key: "readAloud", slug: "speech", large: true },
      { key: "quizzes", slug: "quizzes", large: false },
      { key: "signLanguage", slug: "sign-language", large: true },
    ] as const
  )
    .filter((feature) => project.toggleable[feature.key])
    .map((feature) => ({ ...feature, on: flow.toggles[feature.key] }))

  const setOrder = (next: string[]) => {
    const same = next.length === all.length && next.every((lang, index) => lang === all[index])
    flow.setLanguageOrder(same ? null : next)
  }

  return {
    isProject: flow.format === "project",
    features,
    languages: { all, included, excluded, opensIn, bookLanguage, customized },
    readiness: [
      { slug: "captions", done: project.present.captions },
      { slug: "toc", done: project.present.toc },
      { slug: "easy-read", done: project.present.easyRead },
      { slug: "sign-language", done: project.toggleable.signLanguage },
    ],
    setFeature: (key, on) => flow.setToggle(key, on),
    includeLanguage: (lang, include) => {
      if (include) setOrder([...included, lang])
      else if (included.length > 1) setOrder(included.filter((item) => item !== lang))
    },
    moveLanguage: (lang, to) => {
      const from = included.indexOf(lang)
      if (from < 0) return
      const target = Math.max(0, Math.min(included.length - 1, to))
      if (target === from) return
      const next = [...included]
      next.splice(from, 1)
      next.splice(target, 0, lang)
      setOrder(next)
    },
    resetLanguages: () => flow.setLanguageOrder(null),
  }
}
