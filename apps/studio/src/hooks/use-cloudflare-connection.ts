import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  api,
  type CloudflareConnectionDeleteResponse,
  type CloudflareConnectionStatus,
  type CloudflareCredentials,
  type CloudflareVerifyResponse,
} from "@/api/client"

export const cloudflareConnectionKey = ["cloudflare", "connection"] as const

export function useCloudflareConnection(
  credentials: Partial<CloudflareCredentials>,
  options?: { enabled?: boolean },
) {
  return useQuery<CloudflareConnectionStatus>({
    queryKey: cloudflareConnectionKey,
    queryFn: () => api.getCloudflareConnection(credentials),
    enabled: options?.enabled ?? true,
    retry: false,
    staleTime: 30_000,
  })
}

export function useVerifyCloudflareToken() {
  return useMutation<CloudflareVerifyResponse, Error, Partial<CloudflareCredentials>>({
    mutationFn: (credentials) => api.verifyCloudflare(credentials),
  })
}

export interface DisconnectCloudflareInput {
  credentials: Partial<CloudflareCredentials>
  deleteResources?: boolean
}

export function useDisconnectCloudflare() {
  const queryClient = useQueryClient()
  return useMutation<CloudflareConnectionDeleteResponse, Error, DisconnectCloudflareInput>({
    mutationFn: ({ credentials, deleteResources }) =>
      api.disconnectCloudflare(credentials, { deleteResources }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: cloudflareConnectionKey })
    },
  })
}
