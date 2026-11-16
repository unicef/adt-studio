import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  api,
  apiErrorCode,
  type CloudflareOAuthAccount,
  type CloudflareOAuthErrorCode,
} from "@/api/client"
import { cloudflareConnectionKey } from "./use-cloudflare-connection"

export type CloudflareOAuthPhase =
  | "idle"
  | "starting"
  | "waiting"
  | "choosing-account"
  | "connected"
  | "error"

export interface CloudflareOAuthController {
  phase: CloudflareOAuthPhase
  authUrl: string | null
  accounts: CloudflareOAuthAccount[]
  errorCode: CloudflareOAuthErrorCode | "unknown" | null
  errorMessage: string | null
  isPickingAccount: boolean
  start: () => void
  pickAccount: (accountId: string) => void
  reset: () => void
}

const POLL_INTERVAL_MS = 2000

function toErrorCode(value: string | null): CloudflareOAuthErrorCode | "unknown" {
  return (value ?? "unknown") as CloudflareOAuthErrorCode | "unknown"
}

/**
 * Drives the one-click Cloudflare login: asks the API to open a flow, hands the consent
 * URL to the caller (which opens it in the system browser), then polls the flow until the
 * localhost callback resolves it. Multi-account logins stop at `choosing-account`.
 */
export function useCloudflareOAuth(options?: {
  onConnected?: () => void
}): CloudflareOAuthController {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<CloudflareOAuthPhase>("idle")
  const [state, setState] = useState<string | null>(null)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<CloudflareOAuthAccount[]>([])
  const [errorCode, setErrorCode] = useState<CloudflareOAuthErrorCode | "unknown" | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const onConnectedRef = useRef(options?.onConnected)
  onConnectedRef.current = options?.onConnected

  const fail = useCallback(
    (code: CloudflareOAuthErrorCode | "unknown", message: string | null) => {
      setPhase("error")
      setErrorCode(code)
      setErrorMessage(message)
      setState(null)
    },
    [],
  )

  const startFlow = useMutation({
    mutationFn: () => api.startCloudflareOAuth(),
    onMutate: () => {
      setPhase("starting")
      setErrorCode(null)
      setErrorMessage(null)
      setAccounts([])
    },
    onSuccess: (result) => {
      setState(result.state)
      setAuthUrl(result.auth_url)
      setPhase("waiting")
    },
    onError: (error: Error) => {
      fail(toErrorCode(apiErrorCode(error)), error.message)
    },
  })

  const pickAccountMutation = useMutation({
    mutationFn: (accountId: string) => {
      if (!state) throw new Error("No Cloudflare login is waiting for an account.")
      return api.pickCloudflareOAuthAccount(state, accountId)
    },
    onSuccess: () => {
      setPhase("connected")
      void queryClient.invalidateQueries({ queryKey: cloudflareConnectionKey })
      onConnectedRef.current?.()
    },
    onError: (error: Error) => {
      fail(toErrorCode(apiErrorCode(error)), error.message)
    },
  })

  const flow = useQuery({
    queryKey: ["cloudflare", "oauth", "status", state] as const,
    queryFn: () => api.getCloudflareOAuthStatus(String(state)),
    enabled: state !== null && phase === "waiting",
    refetchInterval: POLL_INTERVAL_MS,
    retry: false,
    gcTime: 0,
  })

  useEffect(() => {
    if (phase !== "waiting" || !flow.data) return

    if (flow.data.status === "complete") {
      setAccounts(flow.data.accounts ?? [])
      if (flow.data.account_choice_required) {
        setPhase("choosing-account")
        return
      }
      setPhase("connected")
      void queryClient.invalidateQueries({ queryKey: cloudflareConnectionKey })
      onConnectedRef.current?.()
      return
    }

    if (flow.data.status === "error" || flow.data.status === "expired") {
      fail(
        flow.data.error ?? "unknown",
        flow.data.error_message ?? null,
      )
    }
  }, [fail, flow.data, phase, queryClient])

  const reset = useCallback(() => {
    setPhase("idle")
    setState(null)
    setAuthUrl(null)
    setAccounts([])
    setErrorCode(null)
    setErrorMessage(null)
    startFlow.reset()
    pickAccountMutation.reset()
  }, [pickAccountMutation, startFlow])

  return {
    phase,
    authUrl,
    accounts,
    errorCode,
    errorMessage,
    isPickingAccount: pickAccountMutation.isPending,
    start: () => startFlow.mutate(),
    pickAccount: (accountId: string) => pickAccountMutation.mutate(accountId),
    reset,
  }
}
