import { createBookStorage } from "@adt/storage"

import type { ReadAdtBundle } from "../bundle-reader.js"
import {
  importedSignLanguageVideoId,
  recoverImportedSignLanguageVideos,
} from "../sign-language.js"

/** Adopt the archive's assigned sign-language videos as uploads pinned to the
 * same sections. Videos already adopted by an earlier projection are kept as
 * they are, so a re-projection never duplicates or reassigns them. */
export function seedImportedSignLanguage(
  label: string,
  booksDir: string,
  bundle: ReadAdtBundle,
  files: Record<string, Uint8Array>,
): void {
  const videos = recoverImportedSignLanguageVideos(bundle, files)
  if (videos.length === 0) return
  const storage = createBookStorage(label, booksDir)
  try {
    const existing = new Set(storage.getSignLanguageVideos().map((video) => video.videoId))
    for (const video of videos) {
      const videoId = importedSignLanguageVideoId(video.sectionId)
      if (existing.has(videoId)) continue
      storage.transaction(() => {
        storage.putSignLanguageVideo(videoId, Buffer.from(video.bytes), video.fileName, video.mimeType)
        storage.assignSignLanguageVideo(videoId, video.sectionId)
      })
    }
  } finally {
    storage.close()
  }
}
