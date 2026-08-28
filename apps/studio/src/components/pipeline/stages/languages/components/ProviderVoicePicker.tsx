import { Trans, useLingui } from "@lingui/react/macro"
import { GEMINI_TTS_VOICES, OPENAI_TTS_VOICES } from "@adt/types"
import { useAzureVoices } from "@/hooks/use-azure-voices"
import { ElevenLabsVoiceCombobox } from "./ElevenLabsVoiceCombobox"
import { VoicePicker, type VoiceOption } from "./VoicePicker"

interface ProviderVoicePickerProps {
  provider: string
  /** The book language this voice narrates. Only Azure uses it — its voice
   *  names embed a locale, so the catalogue is filtered to that language.
   *  OpenAI and Gemini voices are multilingual and are offered in full. */
  language?: string
  value: string
  onChange: (voice: string, label?: string) => void
  className?: string
}

const STATIC_VOICES: Record<string, readonly string[]> = {
  openai: OPENAI_TTS_VOICES,
  gemini: GEMINI_TTS_VOICES,
}

/**
 * The voice control for whichever provider a language is routed to.
 *
 * Each provider knows its voices differently — ElevenLabs and Azure are
 * fetched from the account, OpenAI and Gemini ship fixed multilingual sets —
 * so this resolves the right source and hands a uniform list to
 * {@link VoicePicker}. Every provider keeps free-text entry, so a voice the
 * list doesn't know is always still reachable.
 */
export function ProviderVoicePicker({
  provider,
  language,
  value,
  onChange,
  className,
}: ProviderVoicePickerProps) {
  const { t } = useLingui()
  // Hooks can't be conditional, so this runs for every provider; it no-ops
  // without Azure credentials and its query key is shared across call sites.
  const azure = useAzureVoices(provider === "azure" ? language : undefined)

  // ElevenLabs keeps its own control: its values are opaque ids that need
  // account lookup to read at all, which the others don't.
  if (provider === "elevenlabs") {
    return (
      <ElevenLabsVoiceCombobox value={value} onChange={onChange} className={className} />
    )
  }

  if (provider === "azure") {
    const options: VoiceOption[] = azure.voices.map((voice) => ({
      value: voice.shortName,
      label: voice.gender ? `${voice.displayName} (${voice.gender})` : voice.displayName,
      detail: voice.locale,
      search: `${voice.shortName} ${voice.localeName ?? ""}`,
    }))
    const known = azure.voices.find((voice) => voice.shortName === value)
    return (
      <VoicePicker
        value={value}
        onChange={onChange}
        options={options}
        className={className}
        triggerLabel={known ? `${known.displayName} · ${known.locale}` : value || t`Default voice`}
        defaultOptionLabel={t`Default voice`}
        freeTextPlaceholder={t`e.g. en-US-JennyNeural`}
        unavailableHint={
          azure.hasCredentials ? undefined : (
            <Trans>
              Add an Azure Speech key and region in Settings to pick voices by name.
            </Trans>
          )
        }
      />
    )
  }

  const staticVoices = STATIC_VOICES[provider]
  if (!staticVoices) {
    return (
      <VoicePicker
        value={value}
        onChange={onChange}
        options={[]}
        className={className}
        triggerLabel={value || t`Default voice`}
        defaultOptionLabel={t`Default voice`}
        freeTextPlaceholder={t`Voice name`}
      />
    )
  }

  return (
    <VoicePicker
      value={value}
      onChange={onChange}
      options={staticVoices.map((voice) => ({ value: voice, label: voice }))}
      className={className}
      triggerLabel={value || t`Default voice`}
      defaultOptionLabel={t`Default voice`}
      freeTextPlaceholder={provider === "gemini" ? t`e.g. Kore` : t`e.g. alloy`}
    />
  )
}
