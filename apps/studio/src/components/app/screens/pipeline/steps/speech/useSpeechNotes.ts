import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { AudioLines, Hash, Type } from "lucide-react"
import type { StepNote } from "../shared/notes/NoteRow"
import { pageNumberIds, type SpeechCounts, type SpeechRow } from "./speechRows"

export interface SpeechNotesOptions {
  label: string
  rows: readonly SpeechRow[]
  counts: SpeechCounts
  settled: boolean
  locked: boolean
  lockReason: string
  hasTranscriber: boolean
  wantsTiming: boolean
  missingTiming: number
  run: { label: string; onClick: () => void; disabled: boolean; reason: string | null }
  onMute: (ids: readonly string[]) => void
  onShowMissing: () => void
}

export function useSpeechNotes({
  label,
  rows,
  counts,
  settled,
  locked,
  lockReason,
  hasTranscriber,
  wantsTiming,
  missingTiming,
  run,
  onMute,
  onShowMissing,
}: SpeechNotesOptions): StepNote[] {
  const { t } = useLingui()
  const navigate = useNavigate()
  const [pageNumbersKept, setPageNumbersKept] = useState(false)
  const pageNumbers = useMemo(() => pageNumberIds(rows), [rows])

  return useMemo(() => {
    const notes: StepNote[] = []
    if (settled && counts.missing > 0) {
      notes.push({
        id: "missing",
        icon: AudioLines,
        attention: true,
        title: t`${plural(counts.missing, { one: "# clip has no audio yet", other: "# clips have no audio yet" })}`,
        body: t`Create them one by one from the list, or run Read aloud again. Clips that already have audio are kept.`,
        actions: [
          { label: t`Show them`, onClick: onShowMissing, quiet: true },
          { label: run.label, onClick: run.onClick, disabled: run.disabled, disabledReason: run.reason ?? undefined, primary: true },
        ],
      })
    }
    if (!pageNumbersKept && pageNumbers.ids.length > 0) {
      notes.push({
        id: "page-numbers",
        icon: Hash,
        attention: true,
        title: t`Page numbers will be read aloud`,
        body: t`These look like page numbers: ${pageNumbers.preview}. Most readers skip them, so you can mute them all at once.`,
        actions: [
          {
            label: t`${plural(pageNumbers.ids.length, { one: "Don't read it aloud", other: "Don't read # aloud" })}`,
            onClick: () => onMute(pageNumbers.ids),
            disabled: locked,
            disabledReason: locked ? lockReason : undefined,
            primary: true,
          },
          { label: t`Keep them`, onClick: () => setPageNumbersKept(true), quiet: true },
        ],
      })
    }
    if (!hasTranscriber && wantsTiming && missingTiming > 0) {
      notes.push({
        id: "timing",
        icon: Type,
        title: t`Word timing needs an OpenAI key`,
        body: t`Word timing lets the reader highlight each word as it's spoken. Add an OpenAI key in AI access to create it.`,
        actions: [
          {
            label: t`Set up AI access`,
            onClick: () => void navigate({ to: "/pipeline/$label/settings/$section", params: { label, section: "api-keys" } }),
          },
        ],
      })
    }
    return notes
  }, [t, navigate, label, settled, counts.missing, pageNumbersKept, pageNumbers, hasTranscriber, wantsTiming, missingTiming, run, locked, lockReason, onMute, onShowMissing])
}
