import { useState, useEffect, useRef } from "react"
import { DEFAULT_LLM_MAX_RETRIES } from "@adt/types"
import { useApiKey } from "@/hooks/use-api-key"

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
  markDirty: (key: string) => void
) {
  const { defaultModel, hasOpenAIKey, hasAnthropicKey, hasGoogleKey, hasCustomProvider } = useApiKey()
  const [model, setModel] = useState(() => defaultModel ?? "")
  const [modelOverride, setModelOverride] = useState(false)
  const [retries, setRetries] = useState("")
  const modelTouchedRef = useRef(false)
  const previousConfigKeyRef = useRef(configKey)

  useEffect(() => {
    if (previousConfigKeyRef.current !== configKey) {
      previousConfigKeyRef.current = configKey
      modelTouchedRef.current = false
    }
    // Reset when switching books/presets/keys so values don't bleed across contexts.
    if (!modelTouchedRef.current) setModel(defaultModel ?? "")
    if (!modelTouchedRef.current) setModelOverride(false)
    setRetries("")

    if (!mergedConfig) return
    const cfg = mergedConfig[configKey]
    if (cfg && typeof cfg === "object") {
      const c = cfg as Record<string, unknown>
      if (!modelTouchedRef.current) setModelOverride(c.model_override === true)
      if (c.model) {
        const configuredModel = String(c.model)
        const provider = configuredModel.includes(":")
          ? configuredModel.slice(0, configuredModel.indexOf(":"))
          : "openai"
        const providerAvailable =
          (provider === "openai" && hasOpenAIKey) ||
          (provider === "anthropic" && hasAnthropicKey) ||
          (provider === "google" && hasGoogleKey) ||
          (provider === "custom" && hasCustomProvider)
        if (!modelTouchedRef.current) {
          setModel(providerAvailable && c.model_override === true
            ? configuredModel
            : (defaultModel ?? configuredModel))
        }
      } else if (defaultModel) {
        if (!modelTouchedRef.current) setModel(defaultModel)
      }
      if (c.max_retries != null) setRetries(String(c.max_retries))
    } else if (defaultModel) {
      if (!modelTouchedRef.current) setModel(defaultModel)
    }
  }, [mergedConfig, configKey, defaultModel, hasOpenAIKey, hasAnthropicKey, hasGoogleKey, hasCustomProvider])

  return {
    model,
    onModelChange: (v: string) => {
      modelTouchedRef.current = true
      setModel(v)
      setModelOverride(true)
      markDirty(configKey)
    },
    // Show the effective default in the UI when config does not set one.
    maxRetries: retries || DEFAULT_MAX_RETRIES,
    onMaxRetriesChange: (v: string) => { setRetries(v); markDirty(configKey) },
    /** Spread into the config section object in buildOverrides */
    configOverrides: {
      model: model.trim() || undefined,
      model_override: modelOverride || undefined,
      max_retries: retries.trim() ? Number(retries) : undefined,
    },
  }
}
