import { useCallback } from "react"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useBookRun } from "@/hooks/use-book-run"

/**
 * Generate/regenerate Easy Read through the normal stage runner so the run
 * shows up in the bottom-left progress like every other stage. The easy-read
 * stage is gated on `easy_read.enabled`, so make sure it is on before queueing.
 *
 * `updateBookConfig` replaces the whole config.yaml, so spread the existing
 * config rather than sending a partial — otherwise other overrides (output
 * languages, editing language, …) would be wiped.
 */
export function useRunEasyRead(bookLabel: string) {
  const { apiKey, hasApiKey } = useApiKey()
  const { isRunning, queueRun } = useBookRun()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()

  const runEasyRead = useCallback(async () => {
    if (!hasApiKey || isRunning) return
    const currentConfig = { ...(bookConfigData?.config ?? {}) } as Record<string, unknown>
    const existingEasyRead =
      currentConfig.easy_read && typeof currentConfig.easy_read === "object"
        ? { ...(currentConfig.easy_read as Record<string, unknown>) }
        : {}
    if (existingEasyRead.enabled !== true) {
      currentConfig.easy_read = { ...existingEasyRead, enabled: true }
      await updateConfig.mutateAsync({ label: bookLabel, config: currentConfig })
    }
    queueRun({ fromStage: "easy-read", toStage: "easy-read", apiKey })
  }, [apiKey, hasApiKey, isRunning, bookConfigData?.config, bookLabel, updateConfig, queueRun])

  return { runEasyRead, hasApiKey, isRunning }
}
