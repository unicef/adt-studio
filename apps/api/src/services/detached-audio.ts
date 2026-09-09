import fs from "node:fs"
import path from "node:path"
import type { DetachedRecording, SectionIdRetirementResult } from "@adt/pipeline"
import type { Storage } from "@adt/storage"

/** Where detached uploads are backed up, relative to the book directory. */
export const DETACHED_AUDIO_DIR = path.join("audio", ".detached")

/**
 * Copy uploaded recordings to a safe location before their ids can be reissued,
 * and return the book-relative backup paths.
 *
 * Necessary because audio filenames are derived from the textId. `retireSectionIds`
 * drops the manifest entry, which stops the recording being *served* for content
 * it was never made for — but the file itself sits at
 * `audio/<lang>/${sectionId}_ans_*.<ext>`, exactly where a re-minted id
 * regenerates into (`generateSpeechFile` builds the same
 * `voiceSlotEntryId(textId, slot)` name). Leaving it there means the next run
 * overwrites it, so "the upload is the user's" would be a promise this code
 * breaks. Unlike a sign-language video, which is stored under its own `videoId`
 * and survives unassignment untouched, audio needs a separate backup.
 *
 * Every caller of `retireSectionIds` that does not itself delete the audio needs
 * this — the stage rerun, where the re-mint happens minutes later, and
 * `spreads/apply`, where it happens whenever the spread is un-applied and the
 * page is re-created under its old id with no history to allocate past.
 *
 * Backing up under a dot-directory keeps the copies out of the language dirs
 * `resolveSpeechAudioPath` probes, and packaging copies individual files named by
 * manifest entries rather than walking `audio/`, so nothing here reaches a
 * bundle.
 *
 * Copy rather than move: if any copy or the surrounding storage transaction
 * fails, every original still exists at the path in its rolled-back manifest.
 * Successful copies are kept even on failure; retries use a fresh directory and
 * cannot overwrite them. Only an already-missing source can be skipped.
 */
export function preserveDetachedRecordings(
  bookDir: string,
  detached: readonly DetachedRecording[]
): string[] {
  const preserved: string[] = []
  let batchDir: string | undefined
  const copied = new Set<string>()
  for (const { language, fileName } of detached) {
    const source = path.join(bookDir, "audio", language, fileName)
    if (copied.has(source)) continue
    try {
      // existsSync also returns false for permission errors. Those must abort,
      // not be mistaken for an upload that no longer exists.
      try {
        fs.statSync(source)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue
        throw err
      }
      if (!batchDir) {
        const root = path.join(bookDir, DETACHED_AUDIO_DIR)
        fs.mkdirSync(root, { recursive: true })
        const stamp = new Date().toISOString().replace(/[:.]/g, "-")
        batchDir = fs.mkdtempSync(path.join(root, `${stamp}-`))
      }
      const targetDir = path.join(batchDir, language)
      fs.mkdirSync(targetDir, { recursive: true })
      const target = path.join(targetDir, fileName)
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL)
      copied.add(source)
      preserved.push(path.relative(bookDir, target))
    } catch (err) {
      throw new Error(
        `Could not preserve uploaded recording ${fileName} (${language}); retirement was stopped. Check audio directory permissions and free space, then retry.`,
        { cause: err }
      )
    }
  }
  return preserved
}

/** Keep all retirement writes retryable until every existing upload is safe. */
export function retireWithPreservedRecordings(
  storage: Storage,
  bookDir: string,
  retire: () => SectionIdRetirementResult
) {
  return storage.transaction(() => {
    const retired = retire()
    const preserved = preserveDetachedRecordings(bookDir, retired.detachedRecordings)
    return { retired, preserved }
  })
}
