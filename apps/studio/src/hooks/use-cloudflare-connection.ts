import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  api,
  type CloudflareConnectionDeleteResponse,
  type CloudflareConnectionStatus,
  type CloudflareCredentials,
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
