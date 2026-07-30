import { useState, useCallback, useEffect, useMemo } from "react"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { useLingui } from "@lingui/react"
import { useApiKey } from "./use-api-key"

// --- Types ---

export type ProviderType = "openai" | "anthropic" | "google" | "custom"

export interface ProviderInfo {
  type: ProviderType
  label: string
  model: string
  configured: boolean
}

export interface ActiveProviderState {
  /** The currently active provider (null if none configured) */
  activeProvider: ProviderInfo | null
  /** All known providers with their configuration status */
  allProviders: ProviderInfo[]
  /** Only providers with valid credentials */
  configuredProviders: ProviderInfo[]
  /** Set the active provider (persists to localStorage) */
  setActiveProvider: (type: ProviderType) => void
  /** Whether multiple providers are configured (controls dropdown vs static display) */
  hasMultipleProviders: boolean
}

// --- Constants ---

export const PROVIDER_PRIORITY: ProviderType[] = ["openai", "anthropic", "google", "custom"]

export const PROVIDER_LABELS: Record<ProviderType, MessageDescriptor> = {
  openai: msg`OpenAI`,
  anthropic: msg`Anthropic`,
  google: msg`Google`,
  custom: msg`Custom`,
}

// --- Pure Resolution Function ---

const STORAGE_KEY = "adt-studio-active-provider"
const API_SETTING_CHANGED_EVENT = "adt:api-setting-changed"

function readPersistedProvider(): ProviderType | "" {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && PROVIDER_PRIORITY.includes(stored as ProviderType)) {
      return stored as ProviderType
    }
    return ""
  } catch {
    return ""
  }
}

/**
 * Pure function that resolves the active provider given persisted choice,
 * the set of currently configured providers, and the priority order.
 *
 * Algorithm:
 * 1. If persisted is non-empty AND in configuredSet → return persisted
 * 2. If persisted is non-empty AND NOT in configuredSet → return first in priority that is configured
 * 3. For each provider in priority order: if configured → return it
 * 4. Return null (no providers configured)
 */
export function resolveActiveProvider(
  persisted: ProviderType | "" | null,
  configuredSet: Set<ProviderType>,
  priority: ProviderType[]
): ProviderType | null {
  // If persisted value is valid and still configured, use it
  if (persisted && configuredSet.has(persisted)) {
    return persisted
  }

  // Fall back to first configured provider in priority order
  for (const provider of priority) {
    if (configuredSet.has(provider)) {
      return provider
    }
  }

  // No providers configured
  return null
}

// --- Hook ---

export function useActiveProvider(): ActiveProviderState {
  const { i18n } = useLingui()
  const {
    hasOpenAIKey,
    hasAnthropicKey,
    hasGoogleKey,
    hasCustomProvider,
    providerDefaultModels,
  } = useApiKey()

  // Read persisted value from localStorage
  const [persisted, setPersistedState] = useState<ProviderType | "">(readPersistedProvider)

  // Persist to localStorage
  const setPersisted = useCallback((value: ProviderType | "") => {
    setPersistedState(value)
    try {
      if (value) {
        localStorage.setItem(STORAGE_KEY, value)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
      window.dispatchEvent(new CustomEvent(API_SETTING_CHANGED_EVENT, {
        detail: { key: STORAGE_KEY, value },
      }))
    } catch {
      // localStorage unavailable — graceful degradation
    }
  }, [])

  // Listen for credential changes via the adt:api-setting-changed event
  // This forces a re-read of localStorage persisted value when credentials change
  useEffect(() => {
    const onSettingChanged = () => {
      setPersistedState(readPersistedProvider())
    }
    window.addEventListener(API_SETTING_CHANGED_EVENT, onSettingChanged)
    window.addEventListener("storage", onSettingChanged)
    return () => {
      window.removeEventListener(API_SETTING_CHANGED_EVENT, onSettingChanged)
      window.removeEventListener("storage", onSettingChanged)
    }
  }, [])

  // Build the configured set from useApiKey state
  const configuredSet = useMemo(() => {
    const set = new Set<ProviderType>()
    if (hasOpenAIKey) set.add("openai")
    if (hasAnthropicKey) set.add("anthropic")
    if (hasGoogleKey) set.add("google")
    if (hasCustomProvider) set.add("custom")
    return set
  }, [hasOpenAIKey, hasAnthropicKey, hasGoogleKey, hasCustomProvider])

  // Resolve the active provider
  const resolvedType = useMemo(
    () => resolveActiveProvider(persisted, configuredSet, PROVIDER_PRIORITY),
    [persisted, configuredSet]
  )

  // Build allProviders list
  const allProviders: ProviderInfo[] = useMemo(
    () =>
      PROVIDER_PRIORITY.map((type) => ({
        type,
        label: i18n._(PROVIDER_LABELS[type]),
        model: providerDefaultModels[type],
        configured: configuredSet.has(type),
      })),
    [configuredSet, i18n, providerDefaultModels]
  )

  // Build configuredProviders list
  const configuredProviders = useMemo(
    () => allProviders.filter((p) => p.configured),
    [allProviders]
  )

  // Active provider info object
  const activeProvider: ProviderInfo | null = useMemo(() => {
    if (!resolvedType) return null
    return allProviders.find((p) => p.type === resolvedType) ?? null
  }, [resolvedType, allProviders])

  // Property 4: Selection guard — reject unconfigured providers
  const setActiveProvider = useCallback(
    (type: ProviderType) => {
      if (!configuredSet.has(type)) {
        // Reject: provider is not configured
        return
      }
      setPersisted(type)
    },
    [configuredSet, setPersisted]
  )

  const hasMultipleProviders = configuredProviders.length > 1

  return {
    activeProvider,
    allProviders,
    configuredProviders,
    setActiveProvider,
    hasMultipleProviders,
  }
}
