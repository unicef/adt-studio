import { useEffect, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import type { ProviderCliLoginStatus } from "@adt/types"
import {
  cancelProviderCliLogin,
  getProviderCliLogin,
  logoutProviderCli,
  startProviderCliLogin,
} from "@/api/client"
import { toast } from "@/components/ui/sonner"
import { providerHealthKey } from "@/hooks/use-provider-health"

const POLL_INTERVAL_MS = 2000

export interface CliLogin {
  status: ProviderCliLoginStatus | null
  start: () => void
  cancel: () => void
  logout: () => void
  isStarting: boolean
  isLoggingOut: boolean
}

/**
 * Drives a provider's CLI sign-in from Studio: start returns the one-time
 * prompt, the status is polled while the CLI waits for the approval, and the
 * provider's health is re-checked as soon as the sign-in settles.
 */
export function useCliLogin(providerId: string, enabled: boolean): CliLogin {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const queryKey = ["provider-cli-login", providerId]
  const refreshHealth = () => queryClient.invalidateQueries({ queryKey: providerHealthKey(providerId) })

  const statusQuery = useQuery({
    queryKey,
    queryFn: () => getProviderCliLogin(providerId),
    enabled: enabled && Boolean(providerId),
    refetchInterval: (query) => (query.state.data?.state === "pending" ? POLL_INTERVAL_MS : false),
    refetchOnWindowFocus: false,
    retry: false,
  })

  // Announce only a sign-in observed to complete here (pending → done), then
  // re-probe the connection. A "done" seen on first fetch is history, not news.
  const previousStateRef = useRef<string | null>(null)
  const state = statusQuery.data?.state ?? null
  useEffect(() => {
    const previous = previousStateRef.current
    previousStateRef.current = state
    if (state !== "done" || previous !== "pending") return
    toast.success(t`Signed in.`)
    void queryClient.invalidateQueries({ queryKey: providerHealthKey(providerId) })
  }, [state, providerId, queryClient, t])

  const start = useMutation({
    mutationFn: () => startProviderCliLogin(providerId),
    onSuccess: (data) => {
      if (data.state === "done") {
        // Avoid a duplicate announcement if this cache update triggers the
        // transition effect below. Some CLIs complete before start returns.
        previousStateRef.current = "done"
        toast.success(t`Signed in.`)
        void refreshHealth()
      }
      queryClient.setQueryData(queryKey, data)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t`Unable to start the sign-in.`)
    },
  })

  const cancel = useMutation({
    mutationFn: () => cancelProviderCliLogin(providerId),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data)
    },
  })

  const logout = useMutation({
    mutationFn: () => logoutProviderCli(providerId),
    onSuccess: () => {
      queryClient.setQueryData<ProviderCliLoginStatus>(queryKey, { providerId, state: "idle" })
      toast.success(t`Signed out.`)
      void refreshHealth()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t`Unable to sign out.`)
    },
  })

  return {
    status: statusQuery.data ?? null,
    start: () => start.mutate(),
    cancel: () => cancel.mutate(),
    logout: () => logout.mutate(),
    isStarting: start.isPending,
    isLoggingOut: logout.isPending,
  }
}
