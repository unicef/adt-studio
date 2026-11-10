import { useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import type { CatalogCategory } from "@/components/pipeline/stages/languages/lib/catalog-entries"
import type { ClipErrorKind } from "./useSpeechAudio"
import type { ClipState } from "./speechRows"

export function useClipLabels() {
  const { t } = useLingui()
  return useMemo(
    () => ({
      category: (category: CatalogCategory): string => {
        switch (category) {
          case "captions":
            return t`Image description`
          case "answers":
            return t`Quiz answer`
          case "glossary":
            return t`Glossary`
          case "easy-read":
            return t`Easy Read`
          case "text":
            return t`Text`
          default:
            return t`All`
        }
      },
      state: (state: ClipState): string | null => {
        switch (state) {
          case "failed":
            return t`Couldn't create`
          case "missing":
            return t`No audio yet`
          case "waiting":
            return t`Waiting for the run`
          case "muted":
            return t`Not read aloud`
          default:
            return null
        }
      },
      failure: (raw: string): { title: string; body: string } => {
        if (/\b429\b|rate.?limit|too many requests/i.test(raw))
          return { title: t`The voice service was busy`, body: t`Create it again in a minute.` }
        if (/\b401\b|unauthori[sz]ed|invalid.{0,20}(api )?key|incorrect api key/i.test(raw))
          return { title: t`The voice key was rejected`, body: t`Check AI access, then create it again.` }
        return { title: t`This clip couldn't be created`, body: raw }
      },
      error: (kind: ClipErrorKind): string => {
        switch (kind) {
          case "generate":
            return t`Couldn't create this clip`
          case "upload":
            return t`Couldn't use your recording`
          case "transcribe":
            return t`Couldn't add word timing`
          default:
            return t`Couldn't save the word timing`
        }
      },
    }),
    [t],
  )
}
