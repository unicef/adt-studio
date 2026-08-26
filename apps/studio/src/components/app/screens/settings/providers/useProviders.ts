import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import type { CredentialFieldManifest, ProviderDescriptor, ProviderHealthResponse } from "./contract"
import { PROVIDER_DESCRIPTORS, SIM_ENV, type SimEnv } from "./data"

export type AuthKind = "api-key" | "cli" | "local"

export function authKind(descriptor: ProviderDescriptor): AuthKind {
  const fields = descriptor.manifest.credentialFields
  const allOptional = fields.every((f) => !f.required)
  const hasSecret = fields.some((f) => f.kind === "secret")
  if (allOptional && hasSecret) return "cli"
  if (allOptional && !hasSecret) return "local"
  return "api-key"
}


export function requiredFieldsFilled(descriptor: ProviderDescriptor, creds: Record<string, string>): boolean {
  return descriptor.manifest.credentialFields
    .filter((f) => f.required)
    .every((f, i) => (creds[f.key]?.trim().length ?? 0) > 0 || descriptor.fieldStatus[i]?.configuredOnServer)
}


type Creds = Record<string, Record<string, string>>

const listeners = new Set<() => void>()
let snapshot: Creds | null = null

function fieldByKey(providerId: string, fieldKey: string): CredentialFieldManifest | undefined {
  return PROVIDER_DESCRIPTORS.find((d) => d.manifest.id === providerId)?.manifest.credentialFields.find((f) => f.key === fieldKey)
}

function readStorage(): Creds {
  const out: Creds = {}
  for (const descriptor of PROVIDER_DESCRIPTORS) {
    const values: Record<string, string> = {}
    for (const field of descriptor.manifest.credentialFields) {
      let stored: string | null = null
      try {
        stored = window.localStorage.getItem(field.storageKey)
      } catch {
        stored = null
      }
      if (stored) values[field.key] = stored
    }
    out[descriptor.manifest.id] = values
  }
  return out
}

function getSnapshot(): Creds {
  if (snapshot === null) snapshot = readStorage()
  return snapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function writeCredential(providerId: string, fieldKey: string, value: string): void {
  const field = fieldByKey(providerId, fieldKey)
  if (!field) return
  const next = value.trim()
  try {
    if (next) window.localStorage.setItem(field.storageKey, next)
    else window.localStorage.removeItem(field.storageKey)
  } catch {
  }
  const current = getSnapshot()
  const providerValues = { ...(current[providerId] ?? {}) }
  if (next) providerValues[fieldKey] = next
  else delete providerValues[fieldKey]
  snapshot = { ...current, [providerId]: providerValues }
  for (const listener of listeners) listener()
}

export interface Providers {
  descriptors: ProviderDescriptor[]
  credentials: Creds
  credentialValue: (providerId: string, fieldKey: string) => string
  setCredential: (providerId: string, fieldKey: string, value: string) => void
}

export function useProviders(): Providers {
  const credentials = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const credentialValue = useCallback(
    (providerId: string, fieldKey: string) => credentials[providerId]?.[fieldKey] ?? "",
    [credentials],
  )
  return { descriptors: PROVIDER_DESCRIPTORS, credentials, credentialValue, setCredential: writeCredential }
}


function computeHealth(providerId: string, creds: Record<string, string>, sim: SimEnv): ProviderHealthResponse {
  const descriptor = PROVIDER_DESCRIPTORS.find((d) => d.manifest.id === providerId)!
  const kind = authKind(descriptor)
  const base = { providerId, modelCount: sim.modelCount }

  if (kind === "cli") {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- server-side health diagnostic (non-localized by contract)
    if ((creds.apiKey?.trim().length ?? 0) > 0) return { ...base, ok: true, code: "ok", detail: "API key" }
    if (!sim.cliInstalled) return { providerId, ok: false, code: "cli-not-found" }
    if (!sim.cliLoggedIn) return { providerId, ok: false, code: "not-logged-in" }
    return { ...base, ok: true, code: "local-login", detail: sim.loginLabel }
  }
  if (kind === "local") {
    return sim.reachable
      ? { ...base, ok: true, code: "ok" }
      : { providerId, ok: false, code: "unreachable" }
  }
  if (!requiredFieldsFilled(descriptor, creds)) return { providerId, ok: false, code: "missing-credential" }
  if (sim.rejectsKey) return { providerId, ok: false, code: "invalid-credential" }
  return { ...base, ok: true, code: "ok" }
}

export interface HealthState {
  data: ProviderHealthResponse | null
  isFetching: boolean
  refetch: () => void
}

/**
 * Lazy mock probe: fires when `enabled` first turns true and on `refetch()`, never on
 * keystrokes — matching the real `useProviderHealth` (id-keyed, manual, 30s cache).
 */
export function useProviderHealthMock(
  providerId: string,
  draftCreds: Record<string, string>,
  enabled: boolean,
  refreshToken = 0,
): HealthState {
  const [data, setData] = useState<ProviderHealthResponse | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const draftRef = useRef(draftCreds)
  draftRef.current = draftCreds
  const ranRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback(() => {
    setIsFetching(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setData(computeHealth(providerId, draftRef.current, SIM_ENV[providerId] ?? {}))
      setIsFetching(false)
    }, 520)
  }, [providerId])

  useEffect(() => {
    if (enabled && !ranRef.current) {
      ranRef.current = true
      run()
    }
  }, [enabled, run])

  useEffect(() => {
    if (enabled && ranRef.current) run()
  }, [enabled, refreshToken, run])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { data, isFetching, refetch: run }
}
