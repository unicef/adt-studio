import { useMemo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { ElevenLabsVoice } from "@/api/client"
import {
  formatElevenLabsVoiceLabel,
  useElevenLabsVoices,
} from "@/hooks/use-elevenlabs-voices"
import { VoicePicker, type VoiceOption } from "./VoicePicker"

/** Searchable text for a voice: name, category, and any label values. */
function searchableText(voice: ElevenLabsVoice): string {
  return [
    voice.name,
    voice.voice_id,
    voice.category,
    ...Object.values(voice.labels ?? {}),
    ...(voice.verified_languages ?? []).flatMap((l) => [l.language, l.accent]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

interface ElevenLabsVoiceComboboxProps {
  /** The stored ElevenLabs voice ID (may be empty, or an ID not in this account). */
  value: string
  onChange: (voiceId: string, voiceName?: string) => void
  className?: string
}

/**
 * Voice picker that shows names instead of IDs.
 *
 * ElevenLabs voice IDs are opaque (`21m00Tcm4TlvDq8ikWAM`), and voices.yaml
 * stores exactly those IDs, so a plain text input gives the user nothing to
 * recognise. This resolves them against the account's voice list, then hands
 * the options to the shared {@link VoicePicker}.
 *
 * Degrades to a free-text input when no list is available (no ElevenLabs key
 * configured, or the lookup failed), so a pasted ID always remains possible.
 */
export function ElevenLabsVoiceCombobox({
  value,
  onChange,
  className,
}: ElevenLabsVoiceComboboxProps) {
  const { t } = useLingui()
  const { voices, describeVoice, voiceName, isLoading, hasKey } = useElevenLabsVoices()

  const options: VoiceOption[] = useMemo(
    () =>
      voices.map((voice) => ({
        value: voice.voice_id,
        label: formatElevenLabsVoiceLabel(voice),
        detail: voice.voice_id.slice(0, 8),
        search: searchableText(voice),
      })),
    [voices],
  )

  // describeVoice also covers the voices we ship, so a premade default the
  // account hasn't added still reads as a name rather than a raw ID.
  const triggerLabel = value ? describeVoice(value) : t`Default voice`
  // Getting the ID back unchanged means we have no name for it from either the
  // account list or the voices we ship — most likely a typo or a stale ID.
  const isUnknownVoice = Boolean(value) && triggerLabel === value

  return (
    <VoicePicker
      value={value}
      // The persisted label reaches end users in the exported reader's narrator
      // picker, so it gets the bare name — not describeVoice's decorated
      // "Tomás (premade, spanish)", nor the list row's label, both of which are
      // for this picker's own display only.
      onChange={(voiceId) => onChange(voiceId, voiceId ? voiceName(voiceId) : undefined)}
      options={options}
      className={className}
      triggerLabel={triggerLabel}
      defaultOptionLabel={t`Default voice`}
      freeTextPlaceholder={t`e.g. 21m00Tcm4TlvDq8ikWAM`}
      isLoading={isLoading}
      unavailableHint={
        hasKey ? undefined : (
          <Trans>Add an ElevenLabs API key in Settings to pick voices by name.</Trans>
        )
      }
      // Only warn when we genuinely have no name for it — a premade voice we
      // can name works fine even when it isn't in the account's own list, so
      // flagging that would just alarm.
      unknownValueHint={
        isUnknownVoice ? (
          <Trans>This voice ID is not in your ElevenLabs account.</Trans>
        ) : undefined
      }
    />
  )
}
