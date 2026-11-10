import { memo, useCallback, useRef, useState, type ChangeEvent } from "react"
import { useLingui } from "@lingui/react/macro"
import { CircleAlert, Pencil, TriangleAlert, Type, Upload, WandSparkles } from "lucide-react"
import { getAudioUrl, type CoreTtsCatalogEntry, type WordTimestamp, type WordTimestampEntry } from "@/api/client"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { CoreTtsBadges, CoreTtsSpeechEditor } from "@/components/pipeline/stages/languages/components/CoreTtsSpeechEditor"
import { SpeechHighlightedText } from "@/components/pipeline/stages/languages/components/SpeechHighlightedText"
import { TtsMuteToggle } from "@/components/pipeline/stages/languages/components/TtsMuteToggle"
import { WaveformPlayer } from "@/components/pipeline/stages/languages/components/WaveformPlayer"
import { WordTimestampViewer } from "@/components/pipeline/stages/languages/components/WordTimestampViewer"
import type { EntryTtsExclusion } from "@/components/pipeline/stages/languages/lib/catalog-entries"
import { ProblemNotice } from "../shared/problems/ProblemNotice"
import { StatusDot, type StatusTone } from "../shared/StatusDot"
import { StepActionButton } from "../shared/StepActionButton"
import { MUTED_CONTAINER, MUTED_MEDIA, MUTED_PRIMARY, QUIET_CHIP } from "../shared/ui"
import { ClipIconButton } from "./ClipIconButton"
import type { ClipError } from "./useSpeechAudio"
import type { ClipState, SpeechRow } from "./speechRows"
import { useClipLabels } from "./useClipLabels"

// eslint-disable-next-line lingui/no-unlocalized-strings -- file input accept list
const AUDIO_ACCEPT = ".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"

const TONE: Record<ClipState, StatusTone> = {
  ready: "done",
  failed: "failed",
  missing: "idle",
  waiting: "running",
  muted: "idle",
}

export interface ClipAbility {
  canGenerate: boolean
  generateReason: string | null
  hasTranscriber: boolean
  locked: boolean
  lockReason: string
}

export interface SpeechClipRowProps {
  row: SpeechRow
  label: string
  language: string
  baseLanguage: string
  baseLanguageName: string
  hex: string
  pageNumber: number | null
  speechEntry?: CoreTtsCatalogEntry
  timestamps?: WordTimestampEntry
  exclusion: EntryTtsExclusion
  muteLockedReason?: string
  compare: boolean
  isPlaying: boolean
  playbackTime: number
  error?: ClipError
  ability: ClipAbility
  isGenerating: boolean
  isUploading: boolean
  isTranscribing: boolean
  isSavingTimestamps: boolean
  onToggleMute: (textId: string) => void
  onGenerate: (textId: string) => void
  onUpload: (textId: string, file: File) => void
  onTranscribe: (textId: string) => void
  onSaveTimestamps: (textId: string, words: WordTimestamp[], duration: number) => void
  onPlaybackTime: (textId: string, time: number) => void
  onPlayingChange: (textId: string, playing: boolean) => void
}

export const SpeechClipRow = memo(function SpeechClipRow({
  row,
  label,
  language,
  baseLanguage,
  baseLanguageName,
  hex,
  pageNumber,
  speechEntry,
  timestamps,
  exclusion,
  muteLockedReason,
  compare,
  isPlaying,
  playbackTime,
  error,
  ability,
  isGenerating,
  isUploading,
  isTranscribing,
  isSavingTimestamps,
  onToggleMute,
  onGenerate,
  onUpload,
  onTranscribe,
  onSaveTimestamps,
  onPlaybackTime,
  onPlayingChange,
}: SpeechClipRowProps) {
  const { t } = useLingui()
  const labels = useClipLabels()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [editingSpeech, setEditingSpeech] = useState(false)
  const { id, audio, state } = row
  const muted = state === "muted"
  const needsAudio = state === "missing" || state === "failed"

  const handleTime = useCallback((time: number) => onPlaybackTime(id, time), [onPlaybackTime, id])
  const handlePlaying = useCallback((playing: boolean) => onPlayingChange(id, playing), [onPlayingChange, id])
  const handleSaveTimestamps = useCallback(
    (words: WordTimestamp[], duration: number) => onSaveTimestamps(id, words, duration),
    [onSaveTimestamps, id],
  )
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.currentTarget.value = ""
    if (file) onUpload(id, file)
  }

  const place = [pageNumber != null ? t`Page ${pageNumber}` : null, labels.category(row.category)].filter(Boolean).join(" · ")
  const where = audio ? `${id} · ${audio.fileName}` : id
  const stateChip = labels.state(state)
  const failure = row.failure ? labels.failure(row.failure) : null
  const lockedTitle = ability.locked ? ability.lockReason : null

  return (
    <article
      aria-label={row.text || id}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border p-3 transition-[border-color,background-color] duration-200 motion-reduce:transition-none",
        muted ? MUTED_CONTAINER : "bg-card",
        state === "failed" && "border-destructive/40",
      )}
      style={muted || state === "failed" ? undefined : { borderColor: tint(hex, 0.28) }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-h-5 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <StatusDot tone={TONE[state]} label={stateChip ?? t`Has audio`} />
            <span title={where} className="truncate">
              {place}
            </span>
            {stateChip && (
              <span className={cn(QUIET_CHIP, state === "failed" && "border-destructive/40 text-destructive")}>{stateChip}</span>
            )}
            <CoreTtsBadges entry={speechEntry} quiet />
            {row.timingFailure && !muted && <span className={QUIET_CHIP} title={row.timingFailure}>{t`No word timing`}</span>}
          </div>
          <SpeechHighlightedText
            text={row.text}
            timestamps={timestamps}
            currentTime={isPlaying ? playbackTime : 0}
            isPlaying={isPlaying}
            accent={hex}
            className={cn("text-[13.5px] text-foreground", muted && MUTED_PRIMARY)}
          />
          {!row.text && <p className="mt-0.5 text-[13px] text-muted-foreground italic">{t`No text in this language yet`}</p>}
          <CoreTtsSpeechEditor
            bookLabel={label}
            language={language}
            displayText={row.text}
            entry={speechEntry}
            accent={hex}
            editing={editingSpeech}
            onEditingChange={setEditingSpeech}
            disabled={ability.locked}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {needsAudio && !muted && (
            <StepActionButton
              icon={WandSparkles}
              onClick={() => onGenerate(id)}
              disabled={!ability.canGenerate || ability.locked || isGenerating}
              disabledReason={lockedTitle ?? (isGenerating ? t`Creating this clip…` : ability.generateReason)}
              accent={hex}
            >
              {isGenerating ? t`Creating…` : t`Create audio`}
            </StepActionButton>
          )}
          <input ref={fileRef} type="file" accept={AUDIO_ACCEPT} className="hidden" tabIndex={-1} aria-hidden onChange={handleFile} />
          {isUploading ? (
            <StepActionButton icon={Upload} onClick={() => undefined} disabled disabledReason={t`Uploading your file…`} accent={hex}>
              {t`Uploading…`}
            </StepActionButton>
          ) : (
            <ClipIconButton
              icon={Upload}
              hex={hex}
              label={lockedTitle ?? (audio ? t`Replace with your own recording` : t`Upload your own recording`)}
              disabled={ability.locked}
              onClick={() => fileRef.current?.click()}
            />
          )}
          {audio && !timestamps && !muted && (
            <ClipIconButton
              icon={Type}
              hex={hex}
              label={lockedTitle ?? (ability.hasTranscriber ? t`Add word timing` : t`Word timing needs an OpenAI key`)}
              disabled={ability.locked || !ability.hasTranscriber}
              busy={isTranscribing}
              onClick={() => onTranscribe(id)}
            />
          )}
          {speechEntry && (
            <ClipIconButton
              icon={Pencil}
              hex={hex}
              label={lockedTitle ?? t`Edit what is read aloud`}
              disabled={ability.locked}
              pressed={editingSpeech}
              onClick={() => setEditingSpeech((value) => !value)}
            />
          )}
          <TtsMuteToggle
            muted={exclusion.excluded}
            lockedReason={muteLockedReason}
            onToggle={() => onToggleMute(id)}
            accent={hex}
            disabled={ability.locked}
            disabledReason={ability.lockReason}
          />
        </div>
      </div>

      {audio && (
        <div className={cn("transition-[opacity,filter] duration-200 motion-reduce:transition-none", muted && MUTED_MEDIA)}>
          <WaveformPlayer
            key={`${language}:${audio.fileName}:${audio.cacheKey ?? ""}`}
            audioUrl={getAudioUrl(label, language, audio.fileName, audio.cacheKey)}
            onTimeUpdate={timestamps ? handleTime : undefined}
            onPlayingChange={handlePlaying}
            accent={hex}
            label={row.text || id}
          />
          {timestamps && !muted && (
            <WordTimestampViewer
              timestamps={timestamps}
              onSave={handleSaveTimestamps}
              isSaving={isSavingTimestamps}
              columns={4}
              accent={hex}
              disabled={ability.locked}
            />
          )}
        </div>
      )}

      {compare && row.baseText && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-dashed px-3 py-2">
          <span className="text-[11px] text-muted-foreground">{baseLanguageName}</span>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">{row.baseText}</p>
          {row.baseAudio && (
            <WaveformPlayer
              key={`${baseLanguage}:${row.baseAudio.fileName}:${row.baseAudio.cacheKey ?? ""}`}
              audioUrl={getAudioUrl(label, baseLanguage, row.baseAudio.fileName, row.baseAudio.cacheKey)}
              accent={hex}
              label={t`${row.baseText} in ${baseLanguageName}`}
            />
          )}
        </div>
      )}

      {failure && !error && !muted && (
        <p className="flex items-start gap-1.5 text-[12px] leading-snug text-destructive" title={row.failure}>
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          <span>
            <span className="font-medium">{failure.title}</span>
            <span className="text-destructive/80"> · {failure.body}</span>
          </span>
        </p>
      )}
      {error && (
        <ProblemNotice level="blocked" icon={TriangleAlert} title={labels.error(error.kind)} body={error.message} />
      )}
    </article>
  )
})
