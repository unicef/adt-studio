import { useState, useEffect, useRef } from "react"
import { DEFAULT_LLM_MAX_RETRIES } from "@adt/types"

const DEFAULT_MAX_RETRIES = String(DEFAULT_LLM_MAX_RETRIES)

/**
 * Manages model + retries state for a single pipeline step config key.
 *
 * Reads defaults from the merged (preset + book) config and provides:
 * - Props to spread onto PromptViewer
 * - Config overrides to spread into buildOverrides
 *
 * Adding a new StepConfig field (e.g. timeout) only requires updating
 * this hook and PromptViewer — all settings files get it automatically.
 */
export function useStepConfig(
  mergedConfig: Record<string, unknown> | undefined,
  configKey: string,
  markDirty: (key: string) => void,
  /** Book-keyed settings sessions retain edited fields until Save or Discard. */
  hasDraft = false,
) {
  const [model, setModel] = useState("")
  const [retries, setRetries] = useState("")
  const edited = useRef({ key: configKey, model: false, retries: false })

  useEffect(() => {
    if (!hasDraft || edited.current.key !== configKey) {
      edited.current = { key: configKey, model: false, retries: false }
    }
    const cfg = mergedConfig?.[configKey]
    const c = cfg && typeof cfg === "object" ? cfg as Record<string, unknown> : {}
    // A background/initial read is not an acknowledgement of local typing.
    // Untouched fields still adopt the latest configuration independently.
    if (!edited.current.model) setModel(c.model ? String(c.model) : "")
    if (!edited.current.retries) setRetries(c.max_retries != null ? String(c.max_retries) : "")
  }, [mergedConfig, configKey, hasDraft])

  return {
    model,
    onModelChange: (v: string) => { edited.current.model = true; setModel(v); markDirty(configKey) },
    // Show the effective default in the UI when config does not set one.
    maxRetries: retries || DEFAULT_MAX_RETRIES,
    onMaxRetriesChange: (v: string) => { edited.current.retries = true; setRetries(v); markDirty(configKey) },
    /** Spread into the config section object in buildOverrides */
    configOverrides: {
      model: model.trim() || undefined,
      max_retries: retries.trim() ? Number(retries) : undefined,
    },
  }
}
