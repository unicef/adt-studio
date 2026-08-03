import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { KidsOpenAiVoice } from "@adt/types/kids"
import { api, type KidsModeConfig } from "@/api/client"

export function useKidsMode(bookLabel: string) {
  return useQuery({
    queryKey: ["books", bookLabel, "kids-mode"],
    queryFn: () => api.getKidsMode(bookLabel),
    enabled: !!bookLabel,
  })
}

export function useUpdateKidsMode(bookLabel: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: KidsModeConfig) =>
      api.updateKidsMode(bookLabel, config),
    onSuccess: (config) => {
      queryClient.setQueryData(["books", bookLabel, "kids-mode"], config)
    },
  })
}

export function useKidsVoiceStatus(bookLabel: string) {
  return useQuery({
    queryKey: ["books", bookLabel, "kids-voice"],
    queryFn: () => api.getKidsVoiceStatus(bookLabel),
    enabled: !!bookLabel,
  })
}

export function useKidsInterfaceStatus(bookLabel: string) {
  return useQuery({
    queryKey: ["books", bookLabel, "kids-interface-status"],
    queryFn: () => api.getKidsInterfaceStatus(bookLabel),
    enabled: !!bookLabel,
  })
}

export function useGenerateKidsVoice(bookLabel: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (options: {
      languages?: string[]
      characters?: string[]
      dryRun?: boolean
      apiKey?: string
    }) =>
      api.generateKidsVoice(
        bookLabel,
        {
          languages: options.languages,
          characters: options.characters,
          dryRun: options.dryRun,
        },
        options.apiKey,
      ),
    onSuccess: (result) => {
      if (!result.dryRun) {
        void queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "kids-voice"],
        })
      }
    },
  })
}

export function useTranslateKidsInterface(bookLabel: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (options: { languages?: string[]; apiKey?: string }) =>
      api.translateKidsInterface(
        bookLabel,
        { languages: options.languages },
        options.apiKey,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["books", bookLabel, "kids-interface-status"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["books", bookLabel, "kids-voice"],
      })
    },
  })
}

export function useKidsVoices(bookLabel: string) {
  return useQuery({
    queryKey: ["books", bookLabel, "kids-voices"],
    queryFn: () => api.getKidsVoices(bookLabel),
    enabled: !!bookLabel,
  })
}

export function useUpdateKidsBuddyVoice(bookLabel: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (options: {
      buddyId: string
      voice: KidsOpenAiVoice
      instructions: string
    }) =>
      api.updateKidsBuddyVoice(bookLabel, options.buddyId, {
        voice: options.voice,
        instructions: options.instructions,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["books", bookLabel, "kids-voices"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["books", bookLabel, "kids-voice"],
      })
    },
  })
}

export function useResetKidsBuddyVoice(bookLabel: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (buddyId: string) =>
      api.resetKidsBuddyVoice(bookLabel, buddyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["books", bookLabel, "kids-voices"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["books", bookLabel, "kids-voice"],
      })
    },
  })
}
