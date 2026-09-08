import fs from "node:fs"
import path from "node:path"
import type { DetachedRecording } from "@adt/pipeline"

/** Where a detached upload is parked, relative to the book directory. */
export const DETACHED_AUDIO_DIR = path.join("audio", ".detached")

/**
 * Move uploaded recordings out of the way of the id that is about to be
 * reissued, and return where each landed.
 *
 * Necessary because audio filenames are derived from the textId. `retireSectionIds`
 * drops the manifest entry, which stops the recording being *served* for content
 * it was never made for — but the file itself sits at
 * `audio/<lang>/${sectionId}_ans_*.<ext>`, exactly where a re-minted id
 * regenerates into (`generateSpeechFile` builds the same
 * `voiceSlotEntryId(textId, slot)` name). Leaving it there means the next run
 * overwrites it, so "the upload is the user's" would be a promise this code
 * breaks. Unlike a sign-language video, which is stored under its own `videoId`
 * and survives unassignment untouched, audio has to be moved.
 *
 * Every caller of `retireSectionIds` that does not itself delete the audio needs
 * this — the stage rerun, where the re-mint happens minutes later, and
 * `spreads/apply`, where it happens whenever the spread is un-applied and the
 * page is re-created under its old id with no history to allocate past.
 *
 * Parking under a dot-directory keeps the files out of the language dirs
 * `resolveSpeechAudioPath` probes, and packaging copies individual files named by
 * manifest entries rather than walking `audio/`, so nothing here reaches a
 * bundle.
 *
 * Best-effort: a book whose audio was already cleared from disk has nothing to
 * move, and failing to park a file must not abort the operation the user asked
 * for.
 */
export function parkDetachedRecordings(
  bookDir: string,
  detached: readonly DetachedRecording[]
): string[] {
  const parked: string[] = []
  // One stamp for the whole batch, so a single operation's detachments stay
  // together and a later one cannot overwrite an earlier one's.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  for (const { language, fileName } of detached) {
    const source = path.join(bookDir, "audio", language, fileName)
    if (!fs.existsSync(source)) continue
    const targetDir = path.join(bookDir, DETACHED_AUDIO_DIR, stamp, language)
    try {
      fs.mkdirSync(targetDir, { recursive: true })
      fs.renameSync(source, path.join(targetDir, fileName))
      parked.push(path.join(DETACHED_AUDIO_DIR, stamp, language, fileName))
    } catch (err) {
      console.warn(
        `[detached-audio] could not preserve detached recording ${fileName} (${language}): ${String(err)}`
      )
    }
  }
  return parked
}
