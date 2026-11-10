import type {
  CoreTtsCatalogEntry,
  TextCatalogEntry,
  TTSEntry,
  TTSFailedEntry,
  WordTimestampResponse,
} from "@/api/client"
import {
  getEntryCategory,
  isAnswerEntry,
  type CatalogCategory,
  type EntryTtsExclusion,
} from "@/components/pipeline/stages/languages/lib/catalog-entries"

export type VoiceSlot = "primary" | "secondary"

export type ClipState = "ready" | "failed" | "missing" | "waiting" | "muted"

export type ClipFilter = "all" | "missing" | "failed" | "muted"

export interface SpeechRow {
  id: string
  pageId: string | null
  text: string
  baseText: string
  category: CatalogCategory
  audio?: TTSEntry
  baseAudio?: TTSEntry
  failure?: string
  timingFailure?: string
  state: ClipState
}

export interface SpeechRowSources {
  sourceEntries: readonly TextCatalogEntry[]
  translatedEntries: readonly TextCatalogEntry[] | null
  speechEntries: readonly CoreTtsCatalogEntry[]
  audio: readonly TTSEntry[]
  baseAudio: readonly TTSEntry[]
  failed: readonly TTSFailedEntry[]
  timingFailed: WordTimestampResponse["failed"]
  slot: VoiceSlot
  live: boolean
  exclusionFor: (id: string) => EntryTtsExclusion
}

const PAGE_PREFIX = /^(pg\d+)_/
const PAGE_NUMBER_TEXT = /^\d{1,3}$/

export function pageIdOf(id: string): string | null {
  return PAGE_PREFIX.exec(id)?.[1] ?? null
}

const slotOf = (entry: { voiceSlot?: VoiceSlot }) => entry.voiceSlot ?? "primary"

function bySlot<T extends { textId: string; voiceSlot?: VoiceSlot }>(list: readonly T[], slot: VoiceSlot): Map<string, T> {
  const map = new Map<string, T>()
  for (const entry of list) if (slotOf(entry) === slot) map.set(entry.textId, entry)
  return map
}

export function buildSpeechRows({
  sourceEntries,
  translatedEntries,
  speechEntries,
  audio,
  baseAudio,
  failed,
  timingFailed,
  slot,
  live,
  exclusionFor,
}: SpeechRowSources): SpeechRow[] {
  const audioById = bySlot(audio, slot)
  const baseAudioById = bySlot(baseAudio, slot)
  const failedById = bySlot(failed, slot)
  const timingById = bySlot(timingFailed ?? [], slot)
  const translatedById = translatedEntries ? new Map(translatedEntries.map((entry) => [entry.id, entry.text])) : null
  const speechById = new Map(speechEntries.map((entry) => [entry.id, entry]))

  const order: string[] = []
  const sourceById = new Map<string, string>()
  const add = (id: string) => {
    if (sourceById.has(id)) return
    order.push(id)
    sourceById.set(id, "")
  }
  for (const entry of sourceEntries) {
    add(entry.id)
    sourceById.set(entry.id, entry.text)
  }
  for (const entry of speechEntries) add(entry.id)
  for (const entry of audioById.values()) add(entry.textId)
  for (const entry of failedById.values()) add(entry.textId)

  return order.map((id) => {
    const baseText = sourceById.get(id) ?? ""
    const translated = translatedById ? translatedById.get(id) : baseText
    const text = translated?.trim() ? translated : (speechById.get(id)?.displayText ?? translated ?? "")
    const clip = audioById.get(id)
    const failure = clip ? undefined : failedById.get(id)?.error
    const exclusion = exclusionFor(id)
    const state: ClipState = exclusion.excluded
      ? "muted"
      : clip
        ? "ready"
        : failure
          ? "failed"
          : live
            ? "waiting"
            : "missing"
    return {
      id,
      pageId: pageIdOf(id),
      text,
      baseText,
      category: getEntryCategory(id),
      audio: clip,
      baseAudio: baseAudioById.get(id),
      failure,
      timingFailure: clip && !exclusion.excluded ? timingById.get(id)?.error : undefined,
      state,
    }
  })
}

export interface SpeechCounts {
  total: number
  ready: number
  missing: number
  failed: number
  muted: number
  waiting: number
}

export function countRows(rows: readonly SpeechRow[]): SpeechCounts {
  const counts: SpeechCounts = { total: rows.length, ready: 0, missing: 0, failed: 0, muted: 0, waiting: 0 }
  for (const row of rows) counts[row.state] += 1
  return counts
}

export function countCategories(rows: readonly SpeechRow[]): Map<CatalogCategory, number> {
  const counts = new Map<CatalogCategory, number>([["all", rows.length]])
  for (const row of rows) counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
  return counts
}

export interface RowFilter {
  clip: ClipFilter
  category: CatalogCategory
  pageId: string | null
  search: string
}

export function matchesClip(row: SpeechRow, clip: ClipFilter): boolean {
  if (clip === "all") return true
  if (clip === "missing") return row.state === "missing" || row.state === "waiting"
  return row.state === clip
}

export function filterRows(rows: readonly SpeechRow[], { clip, category, pageId, search }: RowFilter): SpeechRow[] {
  const needle = search.trim().toLowerCase()
  return rows.filter(
    (row) =>
      matchesClip(row, clip) &&
      (category === "all" || row.category === category) &&
      (!pageId || row.pageId === pageId) &&
      (!needle || row.id.toLowerCase().includes(needle) || row.text.toLowerCase().includes(needle) || row.baseText.toLowerCase().includes(needle)),
  )
}

export function pageNumberIds(rows: readonly SpeechRow[]): { ids: string[]; preview: string } {
  const hits = rows.filter((row) => row.state !== "muted" && !isAnswerEntry(row.id) && PAGE_NUMBER_TEXT.test(row.baseText.trim()))
  const unique = [...new Set(hits.map((row) => row.baseText.trim()))].sort((a, b) => Number(a) - Number(b))
  const shown = unique.slice(0, 8).join(", ")
  return { ids: hits.map((row) => row.id), preview: unique.length > 8 ? `${shown}…` : shown }
}
