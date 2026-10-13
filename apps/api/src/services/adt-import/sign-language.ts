import path from "node:path"

import type { ReadAdtBundle } from "./bundle-reader.js"

export interface RecoverableSignLanguageVideo {
  sectionId: string
  fileName: string
  mimeType: string
  bytes: Uint8Array
}

const SECTION_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
const GLOSSARY_VIDEO_HREF_RE = /^content\/i18n\/[^/]+\/video\/[^/]+$/

export function importedSignLanguageVideoId(sectionId: string): string {
  return `sl_imported_${sectionId}`
}

function videoMimeType(fileName: string): string | null {
  const extension = path.extname(fileName).toLowerCase()
  if (extension === ".mp4") return "video/mp4"
  if (extension === ".webm") return "video/webm"
  return null
}

function isPlainFileName(value: string): boolean {
  return value.length > 0 && path.basename(value) === value
}

/**
 * Sign-language videos the archive carries with an assignment the projected
 * book can honour: page-section videos from each locale's `videos.json` and
 * glossary-term videos referenced from `glossary.json`. Every locale ships the
 * same files, so one video per section is returned.
 */
export function recoverImportedSignLanguageVideos(
  bundle: ReadAdtBundle,
  files: Record<string, Uint8Array>,
): RecoverableSignLanguageVideo[] {
  const sectionIds = new Set(bundle.pages.map((page) => page.section_id))
  for (const glossary of Object.values(bundle.glossaries)) {
    for (const entry of Object.values(glossary)) sectionIds.add(entry.id)
  }
  const recovered = new Map<string, RecoverableSignLanguageVideo>()
  const adopt = (sectionId: string, archivePath: string): void => {
    if (recovered.has(sectionId) || !sectionIds.has(sectionId) || !SECTION_ID_RE.test(sectionId)) return
    const fileName = path.posix.basename(archivePath)
    const mimeType = videoMimeType(fileName)
    const bytes = files[archivePath]
    if (!mimeType || !bytes) return
    recovered.set(sectionId, { sectionId, fileName, mimeType, bytes })
  }

  const languages = new Set([bundle.manifest.languages.source, ...bundle.manifest.languages.output])
  for (const language of languages) {
    const videoMapBytes = files[`${bundle.root}content/i18n/${language}/videos.json`]
    if (videoMapBytes) {
      let videoMap: unknown
      try {
        videoMap = JSON.parse(new TextDecoder().decode(videoMapBytes))
      } catch {
        videoMap = null
      }
      if (videoMap && typeof videoMap === "object" && !Array.isArray(videoMap)) {
        for (const [sectionId, fileName] of Object.entries(videoMap as Record<string, unknown>)) {
          if (typeof fileName !== "string" || !isPlainFileName(fileName)) continue
          adopt(sectionId, `${bundle.root}content/i18n/${language}/video/${fileName}`)
        }
      }
    }
    const glossary = bundle.glossaries[language]
    if (!glossary) continue
    for (const entry of Object.values(glossary)) {
      if (!entry.video || !GLOSSARY_VIDEO_HREF_RE.test(entry.video)) continue
      adopt(entry.id, `${bundle.root}${entry.video}`)
    }
  }
  return [...recovered.values()]
}
