import { useState, useEffect, createContext, useContext } from "react"
import type { I18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react"
import { useMutation } from "@tanstack/react-query"
import { api } from "@/api/client"
import { isElectron } from "@/lib/utils"
import { useBookTasks } from "./use-book-tasks"
import type { ExportFeatureToggles } from "./use-export-features"
import type { CapturedSettings } from "./use-preview-settings-listener"
import type { ExportFormat } from "@/components/pipeline/stages/export/export-formats"

interface PendingExport {
  taskId: string
  format: ExportFormat
  features?: ExportFeatureToggles
}

interface ExportError {
  format: ExportFormat
  message: string
}

export interface ExportWatcherValue {
  startExport: (
    format: ExportFormat,
    features?: ExportFeatureToggles,
    defaultSettings?: CapturedSettings,
  ) => void
  isPreparing: boolean
  preparingFormat: ExportFormat | null
  error: ExportError | null
}

const ExportWatcherCtx = createContext<ExportWatcherValue | null>(null)
export const ExportWatcherProvider = ExportWatcherCtx.Provider

export function useExportWatcher(): ExportWatcherValue {
  const ctx = useContext(ExportWatcherCtx)
  if (!ctx) throw new Error("useExportWatcher must be used within ExportWatcherProvider")
  return ctx
}

export function useExportWatcherSetup(label: string): ExportWatcherValue {
  const { i18n } = useLingui()
  const [pendingExport, setPendingExport] = useState<PendingExport | null>(null)
  const [downloadingFormat, setDownloadingFormat] = useState<ExportFormat | null>(null)
  const [error, setError] = useState<ExportError | null>(null)
  const { getTask } = useBookTasks(label)

  const runDownload = (format: ExportFormat) => {
    setDownloadingFormat(format)
    triggerExportDownload(label, format, i18n, () => setDownloadingFormat(null))
      .catch((err) => {
        setError({ format, message: err instanceof Error ? err.message : String(err) })
      })
      .finally(() => setDownloadingFormat((current) => (current === format ? null : current)))
  }

  // Watch for task completion via the tasks cache (updated by SSE)
  useEffect(() => {
    if (!pendingExport) return
    const task = getTask(pendingExport.taskId)
    if (!task) return
    if (task.status === "completed") {
      const format = pendingExport.format
      setPendingExport(null)
      runDownload(format)
    } else if (task.status === "failed") {
      setError({
        format: pendingExport.format,
        message: task.error ?? i18n._(msg`Export preparation failed`),
      })
      setPendingExport(null)
    }
  }, [pendingExport, getTask, i18n, label])

  const prepareMutation = useMutation({
    mutationFn: ({
      format,
      features,
      defaultSettings,
    }: {
      format: ExportFormat
      features?: ExportFeatureToggles
      defaultSettings?: CapturedSettings
    }) => api.prepareExport(label, format, features, defaultSettings),
    onMutate: () => setError(null),
    onSuccess: (result, { format, features }) => {
      if (result.taskId) {
        setPendingExport({ taskId: result.taskId, format, features })
      } else {
        runDownload(format)
      }
    },
    onError: (err, { format }) => {
      setError({ format, message: err instanceof Error ? err.message : String(err) })
    },
  })

  const preparingFormat: ExportFormat | null =
    pendingExport?.format
    ?? downloadingFormat
    ?? (prepareMutation.isPending ? prepareMutation.variables?.format ?? null : null)

  return {
    startExport: (
      format: ExportFormat,
      features?: ExportFeatureToggles,
      defaultSettings?: CapturedSettings,
    ) => prepareMutation.mutate({ format, features, defaultSettings }),
    isPreparing:
      prepareMutation.isPending || pendingExport !== null || downloadingFormat !== null,
    preparingFormat,
    error,
  }
}

async function triggerExportDownload(
  label: string,
  format: ExportFormat,
  i18n: I18n,
  onBeforeSaveDialog?: () => void,
): Promise<void> {
  let blob: Blob | null

  if (format === "project") {
    blob = await api.exportProject(label)
  } else if (format === "webpub") {
    blob = await api.exportWebpub(label)
  } else if (format === "epub") {
    blob = await api.exportEpub(label)
  } else if (format === "scorm") {
    blob = await api.exportScorm(label)
  } else if (format === "pnld") {
    blob = await api.exportPnld(label)
  } else {
    blob = await api.exportAdt(label)
  }

  if (!blob) {
    // Browser mode — direct download already triggered
    onBeforeSaveDialog?.()
    return
  }

  /* eslint-disable lingui/no-unlocalized-strings */
  const formatMeta: Record<ExportFormat, { ext: string; suffix: string; filterName: string }> = {
    project: { ext: "zip", suffix: "-project", filterName: i18n._(msg`Project Archive`) },
    webpub: { ext: "webpub", suffix: "", filterName: i18n._(msg`WebPub`) },
    scorm: { ext: "zip", suffix: "-scorm", filterName: i18n._(msg`SCORM Package`) },
    adt: { ext: "zip", suffix: "-adt", filterName: i18n._(msg`ADT Package`) },
    epub: { ext: "epub", suffix: "", filterName: i18n._(msg`EPUB`) },
    pnld: { ext: "zip", suffix: "-pnld", filterName: i18n._(msg`PNLD Package`) },
  }
  /* eslint-enable lingui/no-unlocalized-strings */
  const meta = formatMeta[format]
  const defaultPath = `${label}${meta.suffix}.${meta.ext}`
  const filters = [{ name: meta.filterName, extensions: [meta.ext] }]

  if (isElectron() && window.api?.saveFile) {
    const buf = await blob.arrayBuffer()
    onBeforeSaveDialog?.()
    await window.api.saveFile({ defaultPath, filters }, new Uint8Array(buf))
    return
  }
}
