import { msg } from "@lingui/core/macro"
import type { LucideIcon } from "lucide-react"
import { FileDown, Globe, GraduationCap, BookText, Landmark } from "lucide-react"

export type ExportFormat = "project" | "webpub" | "scorm" | "adt" | "epub" | "pnld"

export interface FormatConfig {
  icon: LucideIcon
  label: string
  description: string
  textColor: string
  bgLight: string
  borderColor: string
  buttonClass: string
  badge?: string
}

/**
 * Static export format configuration — single source of truth for all export UI
 */
export const EXPORT_FORMAT_CONFIG: Record<ExportFormat, Omit<FormatConfig, "label" | "description" | "badge">> = {
  project: {
    icon: FileDown,
    textColor: "text-emerald-600",
    bgLight: "bg-emerald-50",
    borderColor: "border-emerald-200",
    buttonClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
  adt: {
    icon: Globe,
    textColor: "text-sky-600",
    bgLight: "bg-sky-50",
    borderColor: "border-sky-200",
    buttonClass: "bg-sky-600 hover:bg-sky-700 text-white",
  },
  scorm: {
    icon: GraduationCap,
    textColor: "text-amber-600",
    bgLight: "bg-amber-50",
    borderColor: "border-amber-200",
    buttonClass: "bg-amber-600 hover:bg-amber-700 text-white",
  },
  webpub: {
    icon: Globe,
    textColor: "text-blue-600",
    bgLight: "bg-blue-50",
    borderColor: "border-blue-200",
    buttonClass: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  epub: {
    icon: BookText,
    textColor: "text-purple-600",
    bgLight: "bg-purple-50",
    borderColor: "border-purple-200",
    buttonClass: "bg-purple-600 hover:bg-purple-700 text-white",
  },
  pnld: {
    icon: Landmark,
    textColor: "text-teal-600",
    bgLight: "bg-teal-50",
    borderColor: "border-teal-200",
    buttonClass: "bg-teal-600 hover:bg-teal-700 text-white",
  },
}

/**
 * Build complete format config with translated labels and descriptions.
 * Must be called at runtime with the i18n translator.
 *
 * When `isPart` is set the Project Archive is reframed as the "Completed Part"
 * the coordinator merges back — it's the recommended export for a book part.
 */
export function buildExportFormatConfig(
  t: (msg: any) => string,
  opts: { isPart?: boolean } = {},
): Record<ExportFormat, FormatConfig> {
  return {
    project: {
      ...EXPORT_FORMAT_CONFIG.project,
      label: opts.isPart ? t(msg`Completed Part`) : t(msg`Project Archive`),
      description: opts.isPart
        ? t(msg`Send this project archive back to the coordinator to merge into the source book.`)
        : t(msg`Back up or transfer the full project including the database, PDF, and all pipeline outputs.`),
      badge: opts.isPart ? t(msg`Recommended`) : undefined,
    },
    adt: {
      ...EXPORT_FORMAT_CONFIG.adt,
      label: t(msg`Web Export`),
      description: t(msg`Full ADT bundle — HTML pages, images, audio, quizzes, and the compiled web app.`),
    },
    scorm: {
      ...EXPORT_FORMAT_CONFIG.scorm,
      label: t(msg`SCORM Export`),
      description: t(msg`Upload to an LMS as a SCORM 1.2 package with completion tracking and offline support.`),
    },
    webpub: {
      ...EXPORT_FORMAT_CONFIG.webpub,
      label: t(msg`WebPub Export`),
      description: t(msg`Readium Web Publication format for standards-based digital distribution platforms.`),
      badge: t(msg`Beta`),
    },
    epub: {
      ...EXPORT_FORMAT_CONFIG.epub,
      label: t(msg`EPUB Export`),
      description: t(msg`Standard EPUB 3 file for e-readers, reading apps, and accessibility tools. Interactive features (quizzes, TTS) work in readers that support JavaScript.`),
      badge: t(msg`Beta`),
    },
    pnld: {
      ...EXPORT_FORMAT_CONFIG.pnld,
      label: t(msg`PNLD Export`),
      description: t(msg`Brazilian PNLD digital work (.zip) with HTML5 content, content.opf and toc.ncx metadata, for submission to the FNDE VALIDE reader.`),
      badge: t(msg`Beta`),
    },
  }
}
