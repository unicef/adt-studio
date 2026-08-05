import { useState, useEffect, useMemo } from "react"
import { AlertCircle, Pencil, Settings2 } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { i18n as linguiI18n } from "@lingui/core"
import type { MessageDescriptor } from "@lingui/core"
import { LandingPageShell } from "@/components/pipeline/components/LandingPageShell"
import { PrereqGuard } from "@/components/pipeline/components/PrereqGuard"
import {
  SettingsCard,
  SettingsField,
} from "@/components/pipeline/components/SettingsCard"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useActiveConfig } from "@/hooks/use-debug"
import { useStageStatus } from "@/hooks/use-stage-status"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookConfig } from "@/hooks/use-book-config"
import { usePersistConfig } from "@/hooks/use-persist-config"
import { SpeechPreview } from "./components/SpeechPreview"

type ProviderKey = "openai" | "azure" | "gemini" | "elevenlabs"

const PROVIDER_LABELS: Record<ProviderKey, MessageDescriptor> = {
  openai: msg`OpenAI`,
  azure: msg`Azure`,
  gemini: msg`Gemini`,
  elevenlabs: msg`ElevenLabs`,
}

const PROVIDER_HINTS: Record<ProviderKey, MessageDescriptor> = {
  openai: msg`Natural, expressive voices. Best general-purpose default.`,
  azure: msg`Wide multilingual coverage with neural voices for many locales.`,
  gemini: msg`Google's voices with strong intonation for narrative content.`,
  elevenlabs: msg`High-fidelity, expressive voices with fine-grained cloning support.`,
}

// Voices & Accents card hidden for now while we evaluate the configure-voices
// flow. Markup stays in place so re-enabling is a single flag flip.
const SHOW_VOICES_ACCENTS_CARD = false

export function SpeechLandingPage({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const persist = usePersistConfig(bookLabel)
  const { apiKey, hasApiKey, hasAzureKey, hasGeminiKey, hasElevenLabsKey } = useApiKey()
  const { queueRun } = useBookRun()
  const status = useStageStatus("speech")
  const translateStatus = useStageStatus("translate")
  const translateReady = translateStatus.isCompleted

  const [wordHighlighting, setWordHighlighting] = useState(false)
  const [provider, setProvider] = useState<ProviderKey>("openai")

  useEffect(() => {
    if (!activeConfigData) return
    const m = activeConfigData.merged as Record<string, unknown>
    const speech = (m.speech ?? {}) as Record<string, unknown>
    if (typeof speech.word_highlighting === "boolean") {
      setWordHighlighting(speech.word_highlighting)
    }
    if (
      speech.default_provider === "openai" ||
      speech.default_provider === "azure" ||
      speech.default_provider === "gemini" ||
      speech.default_provider === "elevenlabs"
    ) {
      setProvider(speech.default_provider)
    }
  }, [activeConfigData])

  const persistSpeech = (patch: Record<string, unknown>) => {
    const existing = (bookConfigData?.config?.speech ?? {}) as Record<
      string,
      unknown
    >
    persist({ speech: { ...existing, ...patch } })
  }

  const handleHighlightingToggle = (next: boolean) => {
    setWordHighlighting(next)
    persistSpeech({ word_highlighting: next })
  }

  const handleProviderChange = (value: ProviderKey) => {
    setProvider(value)
    persistSpeech({ default_provider: value })
  }

  const handleRun = () => {
    if (!hasApiKey || !translateReady || status.isRunning) return
    queueRun({ fromStage: "speech", toStage: "speech", apiKey, viewAfter: true })
  }

  const providerKeyAvailable: Record<ProviderKey, boolean> = {
    openai: hasApiKey,
    azure: hasAzureKey,
    gemini: hasGeminiKey,
    elevenlabs: hasElevenLabsKey,
  }

  const providerOptions = useMemo(
    () => {
      const disabledHint = t`Add this provider's API key in Book settings.`
      return [
        {
          value: "openai" as const,
          label: linguiI18n._(PROVIDER_LABELS.openai),
          disabled: !hasApiKey,
          disabledHint,
        },
        {
          value: "azure" as const,
          label: linguiI18n._(PROVIDER_LABELS.azure),
          disabled: !hasAzureKey,
          disabledHint,
        },
        {
          value: "gemini" as const,
          label: linguiI18n._(PROVIDER_LABELS.gemini),
          disabled: !hasGeminiKey,
          disabledHint,
        },
        {
          value: "elevenlabs" as const,
          label: linguiI18n._(PROVIDER_LABELS.elevenlabs),
          disabled: !hasElevenLabsKey,
          disabledHint,
        },
      ]
    },
    [t, hasApiKey, hasAzureKey, hasGeminiKey, hasElevenLabsKey],
  )

  const selectedProviderKeyMissing = !providerKeyAvailable[provider]

  const disabledProviderLabels = useMemo(
    () =>
      providerOptions
        .filter((o) => o.disabled)
        .map((o) => o.label),
    [providerOptions],
  )

  const disabledProvidersText = useMemo(() => {
    if (disabledProviderLabels.length === 0) return ""
    const formatter = new Intl.ListFormat(linguiI18n.locale ?? "en", {
      style: "long",
      type: "conjunction",
    })
    return formatter.format(disabledProviderLabels)
  }, [disabledProviderLabels])

  const highlightingOptions = useMemo(
    () => [
      { value: "sentence" as const, label: t`Per-Sentence` },
      { value: "word" as const, label: t`Per-Word` },
    ],
    [t],
  )

  const disabledReason = !hasApiKey ? (
    <Trans>Add an API key in Book settings to run speech.</Trans>
  ) : selectedProviderKeyMissing ? (
    <Trans>Add the selected provider's API key in Book settings to run speech.</Trans>
  ) : !translateReady ? (
    <Trans>Run Language first — speech narrates the translated text.</Trans>
  ) : undefined

  return (
    <LandingPageShell
      bookLabel={bookLabel}
      stageSlug="speech"
      settingsTab="general"
      colorClass="bg-rose-600 hover:bg-rose-700"
      accentColor="#e11d48"
      accentColorSoft="#ffe4e6"
      isRunning={status.isRunning}
      isCompleted={status.isCompleted}
      hasError={status.hasError}
      canRun={true}
      extraDisabled={!hasApiKey || selectedProviderKeyMissing || !translateReady}
      disabledReason={disabledReason}
      runLabel={<Trans>Run Speech</Trans>}
      rerunLabel={<Trans>Re-run</Trans>}
      previewLabel={t`Speech Preview`}
      onRun={handleRun}
      preview={<SpeechPreview wordHighlighting={wordHighlighting} />}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
          <Trans>Speech</Trans>
        </h1>
        <p className="text-[14px] text-[#737373] leading-relaxed">
          <Trans>
            Generate audio narration for every page of the book. Pick a
            provider and choose whether to highlight each word as it's read
            aloud.
          </Trans>
        </p>
      </div>

      <PrereqGuard
        upstreamSlug="translate"
        stageSlug="speech"
        description={
          <Trans>
            Speech narrates the translated text Language produces. Finish
            Language before running this stage.
          </Trans>
        }
      />

      <SettingsCard>
        <SettingsField
          label={<Trans>Provider</Trans>}
          hint={
            selectedProviderKeyMissing ? (
              <Trans>
                No API key for {linguiI18n._(PROVIDER_LABELS[provider])} yet.
                Add one in Book settings to enable this provider.
              </Trans>
            ) : (
              linguiI18n._(PROVIDER_HINTS[provider])
            )
          }
        >
          <div className="flex flex-col gap-2">
            <SegmentedControl
              options={providerOptions}
              value={provider}
              onValueChange={handleProviderChange}
            />
            {disabledProviderLabels.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                <AlertCircle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"
                  strokeWidth={2}
                  aria-hidden
                />
                <span>
                  {disabledProviderLabels.length === 1 ? (
                    <Trans>
                      {disabledProvidersText} is disabled — add its API key in
                      Book settings to enable it.
                    </Trans>
                  ) : (
                    <Trans>
                      {disabledProvidersText} are disabled — add their API keys
                      in Book settings to enable them.
                    </Trans>
                  )}
                </span>
              </div>
            )}
          </div>
        </SettingsField>
      </SettingsCard>

      <SettingsCard>
        <SettingsField
          label={<Trans>Reader Highlighting</Trans>}
          hint={
            wordHighlighting ? (
              <Trans>
                Highlights each word as it's narrated. Adds a transcription
                step so audio aligns with text on the page.
              </Trans>
            ) : (
              <Trans>
                Highlights the active sentence while audio plays. Skips the
                per-word transcription step.
              </Trans>
            )
          }
        >
          <SegmentedControl
            options={highlightingOptions}
            value={wordHighlighting ? "word" : "sentence"}
            onValueChange={(value) =>
              handleHighlightingToggle(value === "word")
            }
          />
        </SettingsField>
      </SettingsCard>

      {SHOW_VOICES_ACCENTS_CARD && (
        <SettingsCard>
          <SettingsField
            label={<Trans>Voices &amp; Accents</Trans>}
            hint={
              <Trans>
                Pick which voice each language uses for narration, including
                regional accents.
              </Trans>
            }
          >
            <Link
              to="/books/$label/$step/settings"
              params={{ label: bookLabel, step: "speech" }}
              search={{ tab: "general" }}
              className="group flex w-full items-center gap-3 rounded-md border border-[#e5e5e5] bg-white px-3 py-2.5 text-left transition-colors hover:border-[#d4d4d4] hover:bg-[#fafafa] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring/40"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-700">
                <Settings2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </span>
              <span className="flex-1 text-[13px] font-medium text-[#0a0a0a]">
                <Trans>Configure voices and accents</Trans>
              </span>
              <Pencil
                className="h-3.5 w-3.5 text-[#a3a3a3] transition-colors group-hover:text-[#525252]"
                strokeWidth={2}
                aria-hidden
              />
            </Link>
          </SettingsField>
        </SettingsCard>
      )}
    </LandingPageShell>
  )
}
