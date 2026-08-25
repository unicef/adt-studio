import { memo, useCallback } from "react"
import { useLingui } from "@lingui/react/macro"
import type { TTSEntry, WordTimestampEntry, CoreTtsCatalogEntry } from "@/api/client"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { AudioAction } from "@/components/pipeline/stages/languages/components/AudioAction"
import {
  CoreTtsBadges,
  CoreTtsSpeechEditor,
} from "@/components/pipeline/stages/languages/components/CoreTtsSpeechEditor"
import { SpeechHighlightedText } from "@/components/pipeline/stages/languages/components/SpeechHighlightedText"
import { TtsMuteToggle } from "@/components/pipeline/stages/languages/components/TtsMuteToggle"
import { isEasyReadEntry } from "@/components/pipeline/stages/languages/lib/catalog-entries"
import type { EntryTtsExclusion } from "@/components/pipeline/stages/languages/lib/catalog-entries"

export interface SpeechCapabilities {
  /** The language routes to Gemini, so a per-clip regenerate is possible. */
  canGenerate: boolean
  hasGeminiKey: boolean
  hasOpenaiKey: boolean
}

export interface SpeechEntryCardProps {
  label: string
  language: string
  hex: string
  textId: string
  displayText: string
  audio?: TTSEntry
  speechEntry?: CoreTtsCatalogEntry
  timestamps?: WordTimestampEntry
  exclusion: EntryTtsExclusion
  /** True only while this row is the one playing, so word highlighting runs. */
  isPlaying: boolean
  playbackTime: number
  errorMessage?: string
  /** Same for every row, so it is one stable object rather than three booleans. */
  capabilities: SpeechCapabilities
  isGenerating: boolean
  isUploading: boolean
  isTranscribing: boolean
  isSavingTimestamps: boolean
  /** Individually muted ids — an Easy Read row can only be unmuted at its source. */
  mutedIdSet: ReadonlySet<string>
  onToggleMute: (textId: string) => void
  onGenerate: (textId: string) => void
  onUpload: (textId: string, file: File) => void
  onTranscribe: (textId: string) => void
  onSaveTimestamps: (textId: string, words: WordTimestampEntry["words"], duration: number) => void
  onPlaybackTime: (textId: string, time: number) => void
  onPlayingChange: (textId: string, playing: boolean) => void
}

export const SpeechEntryCard = memo(function SpeechEntryCard({
  label,
  language,
  hex,
  textId,
  displayText,
  audio,
  speechEntry,
  timestamps,
  exclusion,
  isPlaying,
  playbackTime,
  errorMessage,
  capabilities,
  isGenerating,
  isUploading,
  isTranscribing,
  isSavingTimestamps,
  mutedIdSet,
  onToggleMute,
  onGenerate,
  onUpload,
  onTranscribe,
  onSaveTimestamps,
  onPlaybackTime,
  onPlayingChange,
}: SpeechEntryCardProps) {
  const { t } = useLingui()

  // Easy Read variants inherit their source entry's mute, so only the source row
  // can undo it — lock the toggle here rather than let it write a no-op.
  const mutedViaSource = exclusion.byId && isEasyReadEntry(textId) && !mutedIdSet.has(textId)
  const lockedReason = exclusion.byCategory
    ? t`Muted by a content type switch in the Speech settings`
    : mutedViaSource
      ? t`Muted via its source text entry`
      : undefined

  // Playback time drives word highlighting and nothing else, so a clip without
  // timestamps has no reason to report it — otherwise every animation frame
  // pushes state into the step and re-renders it ~60x a second for no visible
  // change.
  const handleTime = useCallback(
    (time: number) => onPlaybackTime(textId, time),
    [onPlaybackTime, textId],
  )
  const reportTime = timestamps ? handleTime : undefined
  const handlePlaying = useCallback(
    (playing: boolean) => onPlayingChange(textId, playing),
    [onPlayingChange, textId],
  )
  const handleSaveTimestamps = useCallback(
    (words: WordTimestampEntry["words"], duration: number) =>
      onSaveTimestamps(textId, words, duration),
    [onSaveTimestamps, textId],
  )
  const handleToggleMute = useCallback(() => onToggleMute(textId), [onToggleMute, textId])

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border bg-card p-3.5 transition-opacity",
        exclusion.excluded && "opacity-60",
      )}
      style={{ borderColor: tint(hex, 0.3) }}
    >
      <span className="flex flex-wrap items-center text-[10px] text-muted-foreground">
        <span className="font-mono">{textId}</span>
        {audio && !exclusion.excluded ? (
          <span className="ml-1.5 text-muted-foreground/60">{audio.fileName}</span>
        ) : null}
        {exclusion.excluded ? (
          <span className="ml-1.5 rounded bg-rose-100 px-1 py-0.5 text-[9px] font-medium text-rose-700">
            {t`Muted`}
          </span>
        ) : null}
        <CoreTtsBadges entry={speechEntry} />
        <TtsMuteToggle
          muted={exclusion.excluded}
          lockedReason={lockedReason}
          onToggle={handleToggleMute}
        />
      </span>

      <SpeechHighlightedText
        text={displayText}
        timestamps={timestamps}
        currentTime={isPlaying ? playbackTime : 0}
        isPlaying={isPlaying}
      />

      <CoreTtsSpeechEditor
        bookLabel={label}
        language={language}
        displayText={displayText}
        entry={speechEntry}
      />

      {exclusion.excluded ? null : (
        <AudioAction
          audio={audio}
          audioLang={language}
          bookLabel={label}
          textId={textId}
          accent={hex}
          canGenerate={capabilities.canGenerate}
          hasGeminiKey={capabilities.hasGeminiKey}
          onGenerate={onGenerate}
          isGenerating={isGenerating}
          onUpload={onUpload}
          isUploading={isUploading}
          errorMessage={errorMessage}
          timestamps={timestamps}
          onTranscribe={onTranscribe}
          isTranscribing={isTranscribing}
          hasOpenaiKey={capabilities.hasOpenaiKey}
          onTimeUpdate={reportTime}
          onPlayingChange={handlePlaying}
          onSaveTimestamps={handleSaveTimestamps}
          isSavingTimestamps={isSavingTimestamps}
          timestampColumns={4}
        />
      )}
    </div>
  )
})
