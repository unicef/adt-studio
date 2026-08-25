import { useCallback, useMemo, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, Search } from "lucide-react"
import type { WordTimestamp } from "@/api/client"
import { Input } from "@/components/ui/input"
import { useActiveConfig } from "@/hooks/use-debug"
import { languageUsesSpeechProvider } from "@/lib/speech-routing"
import { normalizeLocale } from "@/lib/languages"
import { useSpeech, useTextCatalog } from "./shared/queries"
import { StepEmpty, StepLoading, StepShell, useStepLoading } from "./shared/StepShell"
import { StepVersionPicker } from "./shared/StepVersionPicker"
import { StepEmptyHint, StepRail, StepScrollBody, STEP_FILL_VIEWPORT_CLASSNAME } from "./shared/ui"
import { speechVersionDiff } from "./shared/versionDiffs"
import { SpeechClipList } from "./speech/SpeechClipList"
import { useSpeechAudio } from "./speech/useSpeechAudio"
import { useTtsExclusions } from "./speech/useTtsExclusions"
import type { StepProps } from "./shared/types"

const ROW_ESTIMATE = 132

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
  const config = useActiveConfig(label)

  const languages = useMemo(() => Object.keys(query.data?.languages ?? {}).sort(), [query.data])
  const [active, setActive] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const language = active ?? languages[0] ?? ""
  const data = language ? query.data?.languages[language] : undefined

  const audio = useSpeechAudio(label, language)
  const exclusions = useTtsExclusions(label)

  const textById = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of catalog.data?.entries ?? []) map.set(entry.id, entry.text)
    for (const entry of (language ? catalog.data?.translations[language]?.entries : undefined) ?? [])
      map.set(entry.id, entry.text)
    return map
  }, [catalog.data, language])

  const speechById = useMemo(() => {
    const normalized = normalizeLocale(language || "")
    const entries =
      catalog.data?.speechTexts[normalized]?.entries ??
      catalog.data?.speechTexts[normalized.replace("-", "_")]?.entries ??
      []
    return new Map(entries.map((entry) => [entry.id, entry]))
  }, [catalog.data, language])

  const entries = useMemo(() => data?.entries ?? [], [data])
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter(
      (entry) =>
        entry.textId.toLowerCase().includes(needle) ||
        (textById.get(entry.textId) ?? "").toLowerCase().includes(needle),
    )
  }, [entries, search, textById])

  // Held as state, not a ref: the list below needs the element itself, and this
  // resolves once at mount instead of on every scroll frame.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)

  const speechConfig = (config.data?.merged as Record<string, unknown> | undefined)?.speech
  // Identical for every row, so it is memoized into one object the cards can
  // hold by reference instead of three booleans threaded through each.
  const capabilities = useMemo(
    () => ({
      canGenerate: !!language && languageUsesSpeechProvider(language, "gemini", speechConfig),
      hasGeminiKey: audio.hasGeminiKey,
      hasOpenaiKey: audio.hasOpenaiKey,
    }),
    [language, speechConfig, audio.hasGeminiKey, audio.hasOpenaiKey],
  )

  const generateOne = audio.generate.mutate
  const uploadOne = audio.upload.mutate
  const transcribeOne = audio.transcribe.mutate
  const saveTimestampsOne = audio.saveTimestamps.mutate

  const handleUpload = useCallback(
    (textId: string, file: File) => uploadOne({ textId, file }),
    [uploadOne],
  )
  const handleSaveTimestamps = useCallback(
    (textId: string, words: WordTimestamp[], duration: number) =>
      saveTimestampsOne({ textId, words, duration }),
    [saveTimestampsOne],
  )

  const busy = useMemo(
    () => ({
      generating: audio.generate.isPending ? audio.generate.variables : undefined,
      uploading: audio.upload.isPending ? audio.upload.variables?.textId : undefined,
      transcribing: audio.transcribe.isPending ? audio.transcribe.variables : undefined,
      savingTimestamps: audio.saveTimestamps.isPending
        ? audio.saveTimestamps.variables?.textId
        : undefined,
    }),
    [
      audio.generate.isPending, audio.generate.variables,
      audio.upload.isPending, audio.upload.variables,
      audio.transcribe.isPending, audio.transcribe.variables,
      audio.saveTimestamps.isPending, audio.saveTimestamps.variables,
    ],
  )

  const versionDiff = useMemo(() => speechVersionDiff(t), [t])

  const loading = useStepLoading(props, {
    isLoading: query.isLoading,
    hasOutput: languages.length > 0,
  })
  if (loading) return <StepLoading {...props} />
  if (languages.length === 0) return <StepEmpty {...props} />

  const failed = data?.failed ?? []
  const speechCatalogVersion = language
    ? catalog.data?.speechTexts[normalizeLocale(language)]?.version ?? null
    : null

  return (
    <StepShell
      {...props}
      chips={[t`${entries.length} clips`, t`${languages.length} languages`]}
      headerExtra={
        <StepVersionPicker
          label={label}
          step="core-tts-catalog"
          itemId={normalizeLocale(language)}
          currentVersion={speechCatalogVersion}
          diff={versionDiff}
        />
      }
      canApply={entries.length > 0}
      bodyViewportClassName={STEP_FILL_VIEWPORT_CLASSNAME}
      rail={
        <StepRail
          heading={<Trans>Narration languages</Trans>}
          hex={plugin.hex}
          entries={languages.map((code) => ({
            key: code,
            title: languageName(code, i18n.locale),
            subtitle: code,
            count: query.data?.languages[code]?.entries.length ?? 0,
          }))}
          activeKey={language}
          onSelect={(key) => {
            setActive(key)
            setSearch("")
          }}
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
      <StepScrollBody
        viewportRef={setScrollElement}
        title={<Trans>Narration</Trans>}
        meta={languageName(language, i18n.locale)}
        actions={
          <Input
            wrapperClassName="w-[240px]"
            className="h-8"
            prependIcon={<Search className="size-3.5" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t`Search id or spoken text…`}
          />
        }
        toolbar={
          failed.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <Trans>{failed.length} clips failed to generate in the last run.</Trans>
              </span>
            </div>
          ) : null
        }
      >
        {shown.length === 0 ? (
          <StepEmptyHint>
            {search ? (
              <Trans>No clips match this search.</Trans>
            ) : (
              <Trans>No audio for this language yet.</Trans>
            )}
          </StepEmptyHint>
        ) : (
          <SpeechClipList
            scrollElement={scrollElement}
            rows={shown}
            label={label}
            language={language}
            hex={plugin.hex}
            textById={textById}
            speechById={speechById}
            timestampsById={audio.timestampsById}
            errorById={audio.errorById}
            exclusionFor={exclusions.exclusionFor}
            mutedIdSet={exclusions.excludedIdSet}
            capabilities={capabilities}
            busy={busy}
            onToggleMute={exclusions.toggle}
            onGenerate={generateOne}
            onUpload={handleUpload}
            onTranscribe={transcribeOne}
            onSaveTimestamps={handleSaveTimestamps}
          />
        )}
      </StepScrollBody>
    </StepShell>
  )
}
