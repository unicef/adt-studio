import { useState, useCallback, useMemo } from "react"
import type { CloudflareCredentials } from "@/api/client"

const STORAGE_KEY_CLOUDFLARE_TOKEN = "adt-studio-cloudflare-token"
const STORAGE_KEY_CLOUDFLARE_ACCOUNT_ID = "adt-studio-cloudflare-account-id"
const STORAGE_KEY_CLOUDFLARE_AUTH_METHOD = "adt-studio-cloudflare-auth-method"

function useLocalStorageState(key: string) {
  const [value, setValueState] = useState<string>(() => {
    try {
      return localStorage.getItem(key) ?? ""
    } catch {
      return ""
    }
  })

  const setValue = useCallback(
    (v: string) => {
      setValueState(v)
      try {
        if (v) localStorage.setItem(key, v)
        else localStorage.removeItem(key)
      } catch {
        return
      }
    },
    [key],
  )

  return [value, setValue] as const
}

/**
 * Cloudflare API token + account id, stored on this machine only (same
 * convention as `use-api-key`). They are sent to the Studio API per request as
 * `X-Cloudflare-Token` / `X-Cloudflare-Account-Id` and never anywhere else.
 */
export function useCloudflareCredentials() {
  const [token, setToken] = useLocalStorageState(STORAGE_KEY_CLOUDFLARE_TOKEN)
  const [accountId, setAccountId] = useLocalStorageState(STORAGE_KEY_CLOUDFLARE_ACCOUNT_ID)
  const [authMethod, setAuthMethodValue] = useLocalStorageState(
    STORAGE_KEY_CLOUDFLARE_AUTH_METHOD,
  )

  const setCredentials = useCallback(
    (next: CloudflareCredentials) => {
      setToken(next.token)
      setAccountId(next.accountId)
      setAuthMethodValue("token")
    },
    [setAccountId, setAuthMethodValue, setToken],
  )

  const markOAuthConnected = useCallback(() => {
    setAuthMethodValue("oauth")
  }, [setAuthMethodValue])

  const clearCredentials = useCallback(() => {
    setToken("")
    setAccountId("")
    setAuthMethodValue("")
  }, [setAccountId, setAuthMethodValue, setToken])

  const credentials = useMemo<CloudflareCredentials>(
    () => ({ token, accountId }),
    [accountId, token],
  )

  const hasCredentials = token.length > 0 && accountId.length > 0

  return {
    token,
    setToken,
    accountId,
    setAccountId,
    credentials,
    setCredentials,
    markOAuthConnected,
    clearCredentials,
    hasCredentials,
    /** Local hint only — the API owns the real answer. It exists so a Studio that is
     *  already connected over OAuth does not flash the wizard before the first
     *  connection response arrives. */
    hasConnectionHint: hasCredentials || authMethod === "oauth",
  }
}
