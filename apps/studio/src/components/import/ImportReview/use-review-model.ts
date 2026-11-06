import { useLingui } from "@lingui/react/macro"
import {
  AlertCircle,
  Database,
  FileCode2,
  FileText,
  FolderPlus,
  Image,
  ListOrdered,
  Puzzle,
  Scissors,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import type { AnyImportPreview, AdtBundleImportPreview } from "@/api/client"
import { isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import type { FriendlyError } from "@/hooks/use-archive-error"

export type Tone = "green" | "amber" | "red" | "blue"
export type CheckState = "ok" | "bad" | "warn" | "off"
export type ReviewMode = "ready" | "activity" | "repair" | "blocked"

/** A key number in the hero band; null marks a value that couldn't be read. */
export interface Stat { value: string | null; label: string; long?: boolean }
export interface Status { tone: Tone; icon: LucideIcon; title: string; text: string }
export interface Check { icon: LucideIcon; label: string; value: string; state: CheckState }
export interface Issue { file: string; text: string; code: string }
export interface Step { title: string; text: string }

export interface ReviewModel {
  mode: ReviewMode
  kind: "adt" | "backup" | "part"
  subtitle: string | null
  stats: Stat[]
  status: Status | null
  checks: Check[]
  issues: Issue[]
  steps: Step[]
  facts: Array<{ label: string; value: string }> | null
}

const STRUCTURE_CODES = new Set([
  "missing-editing-contract", "unsupported-editing-contract", "nested-page", "changed-page-structure",
  "missing-content-root", "multiple-content-roots", "missing-section", "multiple-sections",
  "missing-section-type", "missing-data-id", "duplicate-data-id", "image-missing-data-id",
])
const FILE_CODES = new Set([
  "unexpected-bundle-entry", "remote-asset", "unsafe-asset", "unsupported-stylesheet",
  "unsupported-script", "unsupported-asset-location", "missing-asset",
])

export function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

/** Turn any of the three preview kinds into what the review screen shows. */
export function useReviewModel(
  preview: AnyImportPreview,
  unresolvedActivityCount: number,
  validationError: FriendlyError | null,
): ReviewModel {
  const { t, i18n } = useLingui()
  const locale = i18n?.locale ?? "en"

  const issueText = (code: string, file: string, detail?: string): string => {
    const messages: Record<string, string> = {
      "missing-editing-contract": t`manifest.json has no editing contract, so ADT Studio can’t match pages to the book.`,
      "unsupported-editing-contract": t`manifest.json uses an editing contract version this ADT Studio doesn’t support.`,
      "nested-page": t`Page HTML must stay at the top level of the archive.`,
      "unexpected-bundle-entry": t`The archive contains a folder or file outside the standard ADT layout.`,
      "changed-page-structure": t`The page’s element ids no longer match the page lists in manifest.json and content/pages.json.`,
      "interleaved-reading-order": t`Sections of one page are split apart in the reading order.`,
      "missing-content-root": t`The page is missing its #content element.`,
      "multiple-content-roots": t`The page has more than one #content element.`,
      "missing-section": t`The page is missing its main section.`,
      "multiple-sections": t`The page has more than one main section.`,
      "missing-section-type": t`The main section has no data-section-type.`,
      "missing-data-id": t`Editable content is missing its data-id.`,
      "duplicate-data-id": t`Two elements share a data-id but their content differs.`,
      "image-missing-data-id": t`An image is missing its data-id.`,
      "remote-asset": t`The page loads a file from the internet.`,
      "unsafe-asset": t`The page points to a file outside the archive.`,
      "unsupported-stylesheet": t`The page uses a custom stylesheet instead of the bundled styles.`,
      "unsupported-script": t`The page uses an unsupported external script.`,
      "unsupported-asset-location": t`Page media is outside the images folder.`,
      "missing-asset": t`The page uses a file that isn’t in the archive.`,
    }
    const base = messages[code] ?? code
    return detail && detail !== code && !file.includes(detail) ? `${base} ${detail}` : base
  }
  const problems = (count: number) => count === 0 ? null : t`${count} {count, plural, one {problem} other {problems}}`

  if (isAdtBundleImportPreview(preview)) return adtModel(preview)
  if (isPartImportPreview(preview)) {
    const range = `${preview.range.startPage}–${preview.range.endPage}`
    return {
      mode: "ready",
      kind: "part",
      subtitle: t`Pages ${range} of ${preview.sourceLabel}`,
      stats: [
        { value: String(preview.pageCount), label: t`Pages in this part` },
        { value: range, label: t`Page range` },
        { value: preview.sourceLabel, label: t`Original book`, long: true },
      ],
      status: { tone: "blue", icon: Scissors, title: t`Imported as its own project`, text: t`Work on these pages on their own, then export the project to merge it back into the full book.` },
      checks: [
        { icon: Scissors, label: t`Part details (part.json)`, value: t`Found`, state: "ok" },
        { icon: FileText, label: t`PDF and settings`, value: t`Found`, state: "ok" },
        { icon: FolderPlus, label: t`New, separate project`, value: t`Yes`, state: "ok" },
      ],
      issues: [],
      steps: [
        { title: t`Create the project`, text: t`Only pages ${range} of the book` },
        { title: t`Edit and finish`, text: t`Run any stage on these pages` },
        { title: t`Merge it back`, text: t`Export the part, then merge it into the full book` },
      ],
      facts: [
        { label: t`Original book`, value: preview.sourceLabel },
        { label: t`Pages`, value: range },
        { label: t`When you’re done`, value: t`Export the part, then merge it into the full book` },
      ],
    }
  }

  const blocked = Boolean(preview.validationError)
  const people = [preview.authors.join(", "), preview.publisher].filter(Boolean).join(" · ")
  return {
    mode: blocked ? "blocked" : "ready",
    kind: "backup",
    subtitle: people || null,
    stats: [
      { value: String(preview.pageCount), label: t`Pages` },
      { value: String(preview.imageCount), label: t`Images` },
      ...(preview.videoCount > 0 ? [{ value: String(preview.videoCount), label: t`Videos` }] : []),
      ...(preview.languageCode ? [{ value: preview.languageCode.toUpperCase(), label: languageName(preview.languageCode, locale) }] : []),
    ],
    status: blocked
      ? { tone: "red", icon: AlertCircle, title: t`This project can’t be imported`, text: validationError?.hint ?? t`Export the project again from ADT Studio, or choose another ZIP.` }
      : null,
    checks: [
      { icon: Database, label: t`Project database`, value: blocked ? t`Has a problem` : t`Found`, state: blocked ? "bad" : "ok" },
      { icon: FileText, label: t`Source PDF`, value: preview.hasSourcePdf ? t`Found` : t`Not included`, state: preview.hasSourcePdf ? "ok" : "off" },
      { icon: FolderPlus, label: t`New, separate project`, value: blocked ? t`Not created` : t`Yes`, state: blocked ? "off" : "ok" },
    ],
    issues: [],
    steps: [
      { title: t`Create the project`, text: t`Separate from your other projects` },
      { title: t`Restore its work`, text: t`Pages, edits and generated features` },
      { title: t`Open the book`, text: t`So you can keep working right away` },
    ],
    facts: null,
  }

  function adtModel(adt: AdtBundleImportPreview): ReviewModel {
    const issues = adt.compatibility.issues
    const structure = issues.filter((issue) => STRUCTURE_CODES.has(issue.code)).length
    const files = issues.filter((issue) => FILE_CODES.has(issue.code)).length
    const order = issues.filter((issue) => issue.code === "interleaved-reading-order").length
    const repair = !adt.compatibility.supported
    const issueCount = issues.length
    const mode: ReviewMode = repair ? "repair" : unresolvedActivityCount > 0 ? "activity" : "ready"
    const outputs = adt.outputLanguages?.length ?? 0
    const source = languageName(adt.sourceLanguage, locale)
    const changes: Record<AdtBundleImportPreview["exportComparisonStatus"], { status: Status; value: string; state: CheckState }> = {
      unchanged: { status: { tone: "green", icon: ShieldCheck, title: t`Unchanged since it was exported`, text: t`ADT Studio compared every page with the fingerprints saved at export.` }, value: t`None`, state: "ok" },
      changed: { status: { tone: "amber", icon: AlertCircle, title: t`Changed since it was exported`, text: t`Some pages differ from the export. They become the working source, so check generated features such as Speech after import.` }, value: t`Some pages`, state: "warn" },
      unavailable: { status: { tone: "amber", icon: AlertCircle, title: t`This export has no fingerprints`, text: t`ADT Studio can’t tell whether its pages changed. They become the working source, so check generated features after import.` }, value: t`Can’t tell`, state: "warn" },
    }
    const change = changes[adt.exportComparisonStatus]
    const status: Status = repair
      ? { tone: "red", icon: TriangleAlert, title: t`${issueCount} {issueCount, plural, one {problem} other {problems}} to fix before import`, text: t`ADT Studio found the book, but these files don’t follow the editing rules. An AI assistant can fix them.` }
      : mode === "activity"
        ? { tone: "amber", icon: Puzzle, title: t`${unresolvedActivityCount} {unresolvedActivityCount, plural, one {activity page needs} other {activity pages need}} a type`, text: t`Choose how ADT Studio should treat them after import, or let your AI assistant classify them.` }
        : change.status
    return {
      mode,
      kind: "adt",
      subtitle: null,
      stats: [
        { value: String(adt.pageCount), label: t`Pages` },
        { value: String(adt.imageCount ?? 0), label: t`Images` },
        { value: String(adt.tocEntryCount ?? 0), label: t`Contents entries` },
        {
          value: adt.sourceLanguage.toUpperCase(),
          label: outputs === 0 ? t`${source} only` : t`${source} + ${outputs} {outputs, plural, one {translation} other {translations}}`,
        },
      ],
      status,
      checks: [
        { icon: FileCode2, label: t`Page structure and element ids`, value: problems(structure) ?? t`OK`, state: structure ? "bad" : "ok" },
        { icon: Image, label: t`Images and other files`, value: problems(files) ?? t`All present`, state: files ? "bad" : "ok" },
        { icon: ListOrdered, label: t`Reading order`, value: problems(order) ?? t`Intact`, state: order ? "bad" : "ok" },
        {
          icon: Puzzle,
          label: t`Activities`,
          value: unresolvedActivityCount > 0 ? t`${unresolvedActivityCount} {unresolvedActivityCount, plural, one {needs} other {need}} a type` : t`Nothing to classify`,
          state: unresolvedActivityCount > 0 ? "warn" : "ok",
        },
        { icon: ShieldCheck, label: t`Changes since export`, value: change.value, state: change.state },
        { icon: FolderPlus, label: t`New, separate project`, value: repair ? t`Not yet` : t`Yes`, state: repair ? "off" : "ok" },
      ],
      issues: issues.map((issue) => ({ file: issue.pageHref, code: issue.code, text: issueText(issue.code, issue.pageHref, issue.detail) })),
      steps: [
        { title: t`Create the project`, text: t`${adt.title}, separate from your other projects` },
        { title: t`Use the exported pages`, text: t`They become the editable source` },
        { title: t`Open the book`, text: t`So you can keep working right away` },
      ],
      facts: null,
    }
  }
}
