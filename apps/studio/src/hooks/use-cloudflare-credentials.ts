import { useState, useCallback, useMemo } from "react"
import type { CloudflareCredentials } from "@/api/client"

const STORAGE_KEY_CLOUDFLARE_TOKEN = "adt-studio-cloudflare-token"
const STORAGE_KEY_CLOUDFLARE_ACCOUNT_ID = "adt-studio-cloudflare-account-id"

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

  const setCredentials = useCallback(
    (next: CloudflareCredentials) => {
      setToken(next.token)
      setAccountId(next.accountId)
    },
    [setAccountId, setToken],
  )

  const clearCredentials = useCallback(() => {
    setToken("")
    setAccountId("")
  }, [setAccountId, setToken])

  const credentials = useMemo<CloudflareCredentials>(
    () => ({ token, accountId }),
    [accountId, token],
  )

  return {
    token,
    setToken,
    accountId,
    setAccountId,
    credentials,
    setCredentials,
    clearCredentials,
    hasCredentials: token.length > 0 && accountId.length > 0,
  }
}
