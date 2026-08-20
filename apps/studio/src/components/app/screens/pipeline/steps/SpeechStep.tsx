import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle } from "lucide-react"
import { getAudioUrl } from "@/api/client"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { useSpeech, useTextCatalog } from "./shared/queries"
import { StepEmpty, StepLoading, StepShell } from "./shared/StepShell"
import { StepBody, StepCard, StepEmptyHint, StepRail } from "./shared/ui"
import type { StepProps } from "./shared/types"

function languageName(code: string, locale: string): string {
  if (!code) return ""
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

export function SpeechStep(props: StepProps) {
  const { label, plugin } = props
  const { t, i18n } = useLingui()
  const query = useSpeech(label)
  const catalog = useTextCatalog(label)

  const languages = useMemo(() => Object.keys(query.data?.languages ?? {}).sort(), [query.data])
  const [active, setActive] = useState<string | null>(null)
  const language = active ?? languages[0] ?? ""
  const data = language ? query.data?.languages[language] : undefined

  const textById = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of catalog.data?.entries ?? []) map.set(entry.id, entry.text)
    const translated = language ? catalog.data?.translations[language]?.entries : undefined
    for (const entry of translated ?? []) map.set(entry.id, entry.text)
    return map
  }, [catalog.data, language])

  if (query.isLoading) return <StepLoading {...props} />
  if (languages.length === 0) return <StepEmpty {...props} />

  const entries = data?.entries ?? []
  const failed = data?.failed ?? []

  return (
    <StepShell
      {...props}
      chips={[t`${entries.length} clips`, t`${languages.length} languages`]}
      canApply={entries.length > 0}
      rail={
        <StepRail
          heading={<Trans>Narration languages</Trans>}
          hex={plugin.hex}
          entries={languages.map((code) => ({
            key: code,
            title: languageName(code, i18n.locale),
            count: query.data?.languages[code]?.entries.length ?? 0,
          }))}
          activeKey={language}
          onSelect={setActive}
          footer={
            query.data?.live ? (
              <Trans>A speech run is in progress — this list is updating.</Trans>
            ) : (
              <Trans>Word timestamps let the reader follow along as it plays.</Trans>
            )
          }
        />
      }
    >
      <StepBody
        title={<Trans>Narration</Trans>}
        meta={languageName(language, i18n.locale)}
      >
        {failed.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <Trans>{failed.length} clips failed to generate in the last run.</Trans>
            </span>
          </div>
        )}

        {entries.length === 0 ? (
          <StepEmptyHint>
            <Trans>No audio for this language yet.</Trans>
          </StepEmptyHint>
        ) : (
          entries.map((entry) => (
            <StepCard key={entry.textId} accent={plugin.hex}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{entry.textId}</span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px]"
                  style={{ background: tint(plugin.hex, 0.12), color: plugin.hex }}
                >
                  {entry.voice}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{entry.model}</span>
              </div>

              <p className="text-[12.5px] leading-relaxed">{textById.get(entry.textId) ?? ""}</p>

              <audio
                controls
                preload="none"
                className="h-8 w-full"
                src={getAudioUrl(label, language, entry.fileName, String(data?.version ?? ""))}
              >
                <Trans>Your browser cannot play this audio.</Trans>
              </audio>
            </StepCard>
          ))
        )}
      </StepBody>
    </StepShell>
  )
}
