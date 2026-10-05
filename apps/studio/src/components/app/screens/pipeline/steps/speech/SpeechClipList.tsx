import { useCallback, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type {
  CoreTtsCatalogEntry,
  TTSEntry,
  WordTimestamp,
  WordTimestampEntry,
} from "@/api/client"
import type { EntryTtsExclusion } from "@/components/pipeline/stages/languages/lib/catalog-entries"
import { SpeechEntryCard, type SpeechCapabilities } from "./SpeechEntryCard"

const ROW_ESTIMATE = 132

/** Ids of the clips with a mutation in flight, so a row can show its own spinner. */
export interface SpeechBusyIds {
  generating?: string
  uploading?: string
  transcribing?: string
  savingTimestamps?: string
}

export interface SpeechClipListProps {
  /**
   * The scroll viewport, owned by the step's body. It arrives as an element
   * rather than a ref: the viewport is an *ancestor* of this list, and React
   * attaches refs bottom-up, so a ref would still read null when the
   * virtualizer first looks for it and the list would render nothing.
   */
  scrollElement: HTMLDivElement | null
  rows: TTSEntry[]
  label: string
  language: string
  hex: string
  textById: ReadonlyMap<string, string>
  speechById: ReadonlyMap<string, CoreTtsCatalogEntry>
  timestampsById?: Record<string, WordTimestampEntry>
  errorById: Record<string, string>
  exclusionFor: (textId: string) => EntryTtsExclusion
  mutedIdSet: ReadonlySet<string>
  capabilities: SpeechCapabilities
  busy: SpeechBusyIds
  onToggleMute: (textId: string) => void
  onGenerate: (textId: string) => void
  onUpload: (textId: string, file: File) => void
  onTranscribe: (textId: string) => void
  onSaveTimestamps: (textId: string, words: WordTimestamp[], duration: number) => void
}

/**
 * The virtualized clip list, deliberately its own component.
 *
 * `useVirtualizer` re-renders whichever component hosts it on every scroll
 * frame. Hosting it in the step meant a scroll re-ran the step's whole hook
 * stack — queries, mutations, config reads — dozens of times per drag. Down
 * here the scroll only re-renders this list, and the rows' `memo` absorbs the
 * rest.
 *
 * Playback position lives here for the same reason: it ticks once per animation
 * frame while a clip plays, and the step above has no use for it.
 */
export function SpeechClipList({
  scrollElement,
  rows,
  label,
  language,
  hex,
  textById,
  speechById,
  timestampsById,
  errorById,
  exclusionFor,
  mutedIdSet,
  capabilities,
  busy,
  onToggleMute,
  onGenerate,
  onUpload,
  onTranscribe,
  onSaveTimestamps,
}: SpeechClipListProps) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 4,
    getItemKey: (index) => rows[index]?.textId ?? index,
  })

  // Only one clip plays at a time, so every other row renders with
  // `isPlaying: false` and holds its memo through playback.
  const [playing, setPlaying] = useState<{ textId: string; time: number } | null>(null)
  const handlePlaybackTime = useCallback(
    (textId: string, time: number) => setPlaying({ textId, time }),
    [],
  )
  const handlePlayingChange = useCallback(
    (textId: string, isPlaying: boolean) =>
      setPlaying((current) =>
        isPlaying ? { textId, time: 0 } : current?.textId === textId ? null : current,
      ),
    [],
  )

  return (
    <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const entry = rows[virtualRow.index]
        const isPlaying = playing?.textId === entry.textId
        return (
          <div
            key={entry.textId}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="pb-2"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <SpeechEntryCard
              label={label}
              language={language}
              hex={hex}
              textId={entry.textId}
              displayText={textById.get(entry.textId) ?? ""}
              audio={entry}
              speechEntry={speechById.get(entry.textId)}
              timestamps={timestampsById?.[entry.textId]}
              exclusion={exclusionFor(entry.textId)}
              isPlaying={isPlaying}
              playbackTime={isPlaying ? playing.time : 0}
              errorMessage={errorById[entry.textId]}
              capabilities={capabilities}
              isGenerating={busy.generating === entry.textId}
              isUploading={busy.uploading === entry.textId}
              isTranscribing={busy.transcribing === entry.textId}
              isSavingTimestamps={busy.savingTimestamps === entry.textId}
              mutedIdSet={mutedIdSet}
              onToggleMute={onToggleMute}
              onGenerate={onGenerate}
              onUpload={onUpload}
              onTranscribe={onTranscribe}
              onSaveTimestamps={onSaveTimestamps}
              onPlaybackTime={handlePlaybackTime}
              onPlayingChange={handlePlayingChange}
            />
          </div>
        )
      })}
    </div>
  )
}
