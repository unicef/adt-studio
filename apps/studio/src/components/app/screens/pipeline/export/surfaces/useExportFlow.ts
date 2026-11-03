import { useEffect, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { useExportWatcher, type ExportWatcherValue } from "@/hooks/use-export-watcher"
import { useAllProjectFeatures, type ExportFeatureToggles } from "@/hooks/use-export-features"
import { useCapturedPreviewSettings } from "@/hooks/use-preview-settings-listener"
import { usePartInfo } from "@/hooks/use-parts"
import {
  buildExportFormatConfig,
  type ExportFormat,
  type FormatConfig,
} from "@/components/pipeline/stages/export/export-formats"

interface LastExport {
  format: ExportFormat
  toggles: ExportFeatureToggles
  languageOrder: string[] | null
}

const DEFAULT_TOGGLES: ExportFeatureToggles = {
  glossary: true,
  readAloud: true,
  quizzes: true,
  signLanguage: true,
}

const lastExports = createPersistentStore<Record<string, LastExport>>(
  "adt.export.last",
  {},
  (value): value is Record<string, LastExport> => typeof value === "object" && value !== null && !Array.isArray(value),
)

export interface ExportFlow {
  isPart: boolean
  formats: Record<ExportFormat, FormatConfig>
  format: ExportFormat
  setFormat: (format: ExportFormat) => void
  toggles: ExportFeatureToggles
  setToggle: (feature: keyof ExportFeatureToggles, value: boolean) => void
  languageOrder: string[] | null
  setLanguageOrder: (order: string[] | null) => void
  start: (format?: ExportFormat) => void
  watcher: ExportWatcherValue
}

export function useExportFlow(label: string): ExportFlow {
  const { t } = useLingui()
  const watcher = useExportWatcher()
  const { data: partInfo } = usePartInfo(label)
  const isPart = !!partInfo
  const available = useAllProjectFeatures(label).toggleable
  const capturedSettings = useCapturedPreviewSettings(label)
  const [saved, setSaved] = lastExports.use()
  const last = saved[label] ?? null

  const [format, setFormat] = useState<ExportFormat>(last?.format ?? "adt")
  const [toggles, setToggles] = useState<ExportFeatureToggles>(last?.toggles ?? DEFAULT_TOGGLES)
  const [languageOrder, setLanguageOrder] = useState<string[] | null>(last?.languageOrder ?? null)

  useEffect(() => {
    if (isPart && !last) setFormat("project")
  }, [isPart, last])

  const start = (chosen: ExportFormat = format) => {
    const features =
      chosen === "project"
        ? undefined
        : {
            glossary: toggles.glossary && available.glossary,
            readAloud: toggles.readAloud && available.readAloud,
            quizzes: toggles.quizzes && available.quizzes,
            signLanguage: toggles.signLanguage && available.signLanguage,
            languages: languageOrder ?? undefined,
          }
    watcher.startExport(chosen, features, chosen === "project" ? undefined : capturedSettings)
    setFormat(chosen)
    setSaved((current) => ({ ...current, [label]: { format: chosen, toggles, languageOrder } }))
  }

  return {
    isPart,
    formats: buildExportFormatConfig(t, { isPart }),
    format,
    setFormat,
    toggles,
    setToggle: (feature, value) => setToggles((current) => ({ ...current, [feature]: value })),
    languageOrder,
    setLanguageOrder,
    start,
    watcher,
  }
}
