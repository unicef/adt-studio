import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { CoreTtsCatalogEntry, WordTimestamp, WordTimestampEntry } from "@/api/client"
import { isEasyReadEntry, type EntryTtsExclusion } from "@/components/pipeline/stages/languages/lib/catalog-entries"
import { SpeechClipRow, type ClipAbility } from "./SpeechClipRow"
import type { ClipError } from "./useSpeechAudio"
import type { SpeechRow } from "./speechRows"

const ROW_ESTIMATE = 112

export interface SpeechBusyIds {
  generating?: string
  uploading?: string
  transcribing?: string
  savingTimestamps?: string
}

export interface SpeechClipListProps {
  rows: readonly SpeechRow[]
  label: string
  language: string
  baseLanguage: string
  baseLanguageName: string
  hex: string
  compare: boolean
  pageNumberOf: (pageId: string | null) => number | null
  speechById: ReadonlyMap<string, CoreTtsCatalogEntry>
  timestampsById: Record<string, WordTimestampEntry>
  errorFor: (textId: string) => ClipError | undefined
  exclusionFor: (textId: string) => EntryTtsExclusion
  mutedIdSet: ReadonlySet<string>
  ability: ClipAbility
  busy: SpeechBusyIds
  onToggleMute: (textId: string) => void
  onGenerate: (textId: string) => void
  onUpload: (textId: string, file: File) => void
  onTranscribe: (textId: string) => void
  onSaveTimestamps: (textId: string, words: WordTimestamp[], duration: number) => void
}

function useScrollHost() {
  const anchor = useRef<HTMLDivElement>(null)
  const [host, setHost] = useState<{ element: HTMLElement | null; margin: number }>({ element: null, margin: 0 })

  useLayoutEffect(() => {
    const node = anchor.current
    const element = node?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ?? null
    if (!node || !element) return
    const measure = () => {
      const margin = Math.round(node.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop)
      setHost((current) => (current.element === element && current.margin === margin ? current : { element, margin }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    const content = element.firstElementChild
    if (content) observer.observe(content)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { anchor, ...host }
}

export function SpeechClipList({
  rows,
  label,
  language,
  baseLanguage,
  baseLanguageName,
  hex,
  compare,
  pageNumberOf,
  speechById,
  timestampsById,
  errorFor,
  exclusionFor,
  mutedIdSet,
  ability,
  busy,
  onToggleMute,
  onGenerate,
  onUpload,
  onTranscribe,
  onSaveTimestamps,
}: SpeechClipListProps) {
  const { t } = useLingui()
  const { anchor, element, margin } = useScrollHost()
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => element,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 4,
    scrollMargin: margin,
    getItemKey: (index) => rows[index]?.id ?? index,
  })

  const [playing, setPlaying] = useState<{ textId: string; time: number } | null>(null)
  const handlePlaybackTime = useCallback((textId: string, time: number) => setPlaying({ textId, time }), [])
  const handlePlayingChange = useCallback(
    (textId: string, isPlaying: boolean) =>
      setPlaying((current) => (isPlaying ? { textId, time: 0 } : current?.textId === textId ? null : current)),
    [],
  )

  const viaCategory = t`Muted by a content type switch in the Speech settings`
  const viaSource = t`Muted with its source text. Unmute that row instead.`

  return (
    <div ref={anchor} style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
      {virtualizer.getVirtualItems().map((item) => {
        const row = rows[item.index]
        const exclusion = exclusionFor(row.id)
        const lockReason = exclusion.byCategory
          ? viaCategory
          : exclusion.byId && isEasyReadEntry(row.id) && !mutedIdSet.has(row.id)
            ? viaSource
            : undefined
        const isPlaying = playing?.textId === row.id
        return (
          <div
            key={row.id}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="pb-2"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${item.start - margin}px)` }}
          >
            <SpeechClipRow
              row={row}
              label={label}
              language={language}
              baseLanguage={baseLanguage}
              baseLanguageName={baseLanguageName}
              hex={hex}
              pageNumber={pageNumberOf(row.pageId)}
              speechEntry={speechById.get(row.id)}
              timestamps={timestampsById[row.id]}
              exclusion={exclusion}
              muteLockedReason={lockReason}
              compare={compare}
              isPlaying={isPlaying}
              playbackTime={isPlaying ? playing.time : 0}
              error={errorFor(row.id)}
              ability={ability}
              isGenerating={busy.generating === row.id}
              isUploading={busy.uploading === row.id}
              isTranscribing={busy.transcribing === row.id}
              isSavingTimestamps={busy.savingTimestamps === row.id}
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
