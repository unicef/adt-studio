import { isDeepStrictEqual } from "node:util"
import { HTTPException } from "hono/http-exception"
import { inputSignature, normalizeLocale } from "@adt/pipeline"
import { withSpeechAudioIdentity, type Storage } from "@adt/storage"
import { TTSOutput, WordTimestampOutput, resolveEntryVoiceSlot, voiceSlotEntryId, type SpeechFileEntry, type VoiceSlot, type WordTimestampSaveRequest } from "@adt/types"

/** Bind edit receipts to the actual storage chain, including older locale keys. */
export function timingState(storage: Storage, language: string) {
  const normalized = normalizeLocale(language)
  const legacy = normalized.replace("-", "_")
  const namespaces = new Set(storage.getNodeItemIds("tts"))
  const canonical = storage.getLatestNodeData("tts", normalized)
  const namespace = namespaces.has(normalized) ? normalized : namespaces.has(legacy) ? legacy : normalized
  const audioRow = canonical ?? storage.getLatestNodeData("tts", namespace)
  const audio = TTSOutput.safeParse(audioRow?.data)
  const timingRow = storage.getLatestNodeData("tts-timestamps", namespace)
  return { namespace, audio: audio.success ? audio.data.entries : [], timingRow }
}

export function timingAudioIdentity(namespace: string, entries: SpeechFileEntry[], textId: string, voiceSlot: VoiceSlot) {
  const matches = entries.filter(entry => entry.textId === textId && resolveEntryVoiceSlot(entry) === voiceSlot)
  const audio = matches.length === 1 ? matches[0] : undefined
  return { audio, audioIdentity: audio ? inputSignature({ namespace, audio }) : undefined }
}

function conflict(): never {
  throw new HTTPException(409, { message: "Audio or timings changed. Refresh before saving timings." })
}

/** Validate the whole collection, but compare the complete raw target so unknown
 * historical metadata cannot be silently replaced by a stale editor. */
function target(data: unknown, textId: string, slot: VoiceSlot) {
  if (!WordTimestampOutput.safeParse(data).success) conflict()
  const output = data as WordTimestampOutput
  const matches = Object.entries(output.entries).filter(([, entry]) => entry.textId === textId && resolveEntryVoiceSlot(entry) === slot)
  if (matches.length > 1 || matches.some(([key]) => key !== voiceSlotEntryId(textId, slot))) conflict()
  return { entry: matches[0]?.[1], failed: (output.failed ?? []).filter(entry => entry.textId === textId && resolveEntryVoiceSlot(entry) === slot) }
}

/** A sibling's first save can snapshot legacy audio. Accept that representation
 * change only through the publication service's retained, paired history. Never
 * infer equivalence from a filename alias alone or read media to establish it. */
function legacySnapshotMatches(storage: Storage, namespace: string, textId: string, slot: VoiceSlot,
  receipt: string | undefined, audio: SpeechFileEntry, previous: ReturnType<typeof target>, current: ReturnType<typeof target>) {
  if (!receipt || !previous.entry || previous.entry.audioHash || !audio.audioHash) return false
  const history = storage.getAllNodeVersions("tts", namespace)
  const timings = storage.getAllNodeVersions("tts-timestamps", namespace)
  for (const row of history) {
    const snapshot = TTSOutput.safeParse(row.data)
    if (!snapshot.success || !snapshot.data.legacySnapshotOf || !snapshot.data.timingVersion || snapshot.data.legacySnapshotOf >= row.version) continue
    const original = TTSOutput.safeParse(history.find(item => item.version === snapshot.data.legacySnapshotOf)?.data)
    if (!original.success) continue
    const before = timingAudioIdentity(namespace, original.data.entries, textId, slot)
    const after = timingAudioIdentity(namespace, snapshot.data.entries, textId, slot).audio
    if (!before.audio || before.audio.audioHash || before.audioIdentity !== receipt || !after || !isDeepStrictEqual(after, audio)) continue
    if (!isDeepStrictEqual(withSpeechAudioIdentity(before.audio, { fileName: audio.fileName, audioHash: audio.audioHash }), audio)) continue
    if (previous.entry.legacyAudioFileName && previous.entry.legacyAudioFileName !== before.audio.fileName) continue
    const paired = timings.find(item => item.version === snapshot.data.timingVersion)
    if (!paired) continue
    const expected = { ...previous, entry: { ...previous.entry, audioHash: audio.audioHash, legacyAudioFileName: before.audio.fileName } }
    if (isDeepStrictEqual(expected, current) && isDeepStrictEqual(expected, target(paired.data, textId, slot))) return true
  }
  return false
}

/** Collection versions may advance independently. Merge only an unchanged
 * target from a real older version, with the same recording and namespace. */
export function assertTimingEdit(storage: Storage, state: ReturnType<typeof timingState>, textId: string, slot: VoiceSlot, request: WordTimestampSaveRequest): SpeechFileEntry {
  const { namespace, audio: entries, timingRow } = state
  const { audio, audioIdentity } = timingAudioIdentity(namespace, entries, textId, slot)
  if (!audio) conflict()
  const empty = { entries: {}, generatedAt: "" }
  const current = target(timingRow?.data ?? empty, textId, slot)
  // A hash-only older client cannot distinguish equal version numbers in
  // two locale chains. Require a namespace-bound receipt in that ambiguous case.
  const canonical = normalizeLocale(namespace)
  const legacy = canonical.replace("-", "_")
  const namespaces = new Set(storage.getNodeItemIds("tts"))
  if (!request.audioIdentity && canonical !== legacy && namespaces.has(canonical) && namespaces.has(legacy)) conflict()
  const sameAudio = request.audioIdentity ? request.audioIdentity === audioIdentity : !!audio.audioHash && request.audioHash === audio.audioHash
  if ((timingRow?.version ?? 0) === request.baseVersion) {
    if (!sameAudio) conflict()
    return audio
  }
  const baseline = timingRow && request.baseVersion > 0 && request.baseVersion < timingRow.version
    ? storage.getAllNodeVersions("tts-timestamps", namespace).find(row => row.version === request.baseVersion) : undefined
  if (!baseline) conflict()
  const previous = target(baseline.data, textId, slot)
  if (sameAudio && isDeepStrictEqual(previous, current)) return audio
  if (legacySnapshotMatches(storage, namespace, textId, slot, request.audioIdentity, audio, previous, current)) return audio
  return conflict()
}
