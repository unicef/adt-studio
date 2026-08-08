import { DomUtils, parseDocument } from "htmlparser2"

import { supportsEditableActivity } from "./extract-editable-activity.js"
import { validateActivityStructure } from "./validate-activity-structure.js"

export const ACTIVITY_CLASSIFICATION_GUIDE = [
  { type: "activity_quiz", description: "A generated comprehension quiz page." },
  { type: "activity_multiple_choice", description: "Choose exactly one answer from several options." },
  { type: "activity_multi_select", description: "Choose more than one correct answer." },
  { type: "activity_true_false", description: "Decide whether a statement is true or false." },
  { type: "activity_fill_in_the_blank", description: "Enter a missing word or short phrase." },
  { type: "activity_fill_in_a_table", description: "Complete missing cells in a table." },
  { type: "activity_open_ended_answer", description: "Write a free-form response." },
  { type: "activity_underline_text", description: "Select or underline part of a text." },
  { type: "activity_matching", description: "Pair related items from two groups." },
  { type: "activity_sorting", description: "Arrange items into an order or categories." },
  { type: "activity_other", description: "A supported Studio activity that fits none of the specific types." },
] as const

export const KNOWN_ACTIVITY_SECTION_TYPES = ACTIVITY_CLASSIFICATION_GUIDE
  .map(({ type }) => type)

export type ImportedActivitySignal =
  | "interactive-control"
  | "activity-data"
  | "draggable-content"
  | "custom-registration"

export interface ImportedActivityInspection {
  sectionId: string
  sectionType: string | null
  isActivity: boolean
  isKnownType: boolean
  isCustomType: boolean
  isQuiz: boolean
  explicitNonActivity: boolean
  supportsStudioEditing: boolean
  signals: ImportedActivitySignal[]
  validationErrors: string[]
  textPreview: string
}

function textWithoutExecutableContent(node: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (node?.type === "script" || node?.name === "script" || node?.name === "style") return ""
  if (node?.type === "text") return typeof node.data === "string" ? node.data : ""
  return (node?.children ?? []).map(textWithoutExecutableContent).join(" ")
}

/** Inspect imported HTML without executing it. Explicit `activity_*` section
 * markers are authoritative; interactive signals are only review candidates. */
export function inspectImportedActivity(
  html: string,
  expectedSectionId: string,
  options: { allowSectionDataId?: boolean } = {},
): ImportedActivityInspection {
  const doc = parseDocument(html)
  const sections = DomUtils.findAll(
    (element) => element.type === "tag" && element.name === "section",
    doc.children,
  )
  const section = sections.find((element) => (
    element.attribs?.["data-section-id"] === expectedSectionId
    || (options.allowSectionDataId === true && element.attribs?.["data-id"] === expectedSectionId)
  )) ?? null
  const sectionType = section?.attribs?.["data-section-type"]?.trim() || null
  const isActivity = Boolean(sectionType?.startsWith("activity_"))
  const isKnownType = Boolean(
    sectionType && (KNOWN_ACTIVITY_SECTION_TYPES as readonly string[]).includes(sectionType),
  )
  const isCustomType = Boolean(sectionType?.startsWith("activity_custom_"))
  const explicitNonActivity = section?.attribs?.["data-adt-non-activity"]
    ?.trim()
    .toLowerCase() === "true"
  const signals = new Set<ImportedActivitySignal>()

  if (section) {
    const descendants = DomUtils.findAll(
      (element) => element.type === "tag" || element.type === "script",
      section.children ?? [],
    )
    for (const element of descendants) {
      const name = element.name?.toLowerCase()
      const attributes = element.attribs ?? {}
      if (
        ["button", "select", "textarea"].includes(name)
        || (name === "input" && (attributes.type ?? "text").toLowerCase() !== "hidden")
      ) {
        signals.add("interactive-control")
      }
      if (Object.keys(attributes).some((attribute) => attribute.startsWith("data-activity-"))) {
        signals.add("activity-data")
      }
      if (attributes.draggable === "true" || attributes["aria-grabbed"] !== undefined) {
        signals.add("draggable-content")
      }
      if (
        (element.type === "script" || name === "script")
        && DomUtils.textContent(element).includes("adtRegisterCustomActivity")
      ) {
        signals.add("custom-registration")
      }
    }
  }

  return {
    sectionId: expectedSectionId,
    sectionType,
    isActivity,
    isKnownType,
    isCustomType,
    isQuiz: sectionType === "activity_quiz",
    explicitNonActivity,
    supportsStudioEditing: Boolean(
      sectionType && (sectionType === "activity_quiz" || supportsEditableActivity(sectionType)),
    ),
    signals: [...signals],
    validationErrors: section && isActivity && sectionType
      ? validateActivityStructure(section, sectionType)
      : [],
    textPreview: section
      ? textWithoutExecutableContent(section).replace(/\s+/g, " ").trim().slice(0, 240)
      : "",
  }
}

function matchingSection(document: ReturnType<typeof parseDocument>, sectionId: string) {
  return DomUtils.findAll(
    (element) => element.type === "tag" && element.name === "section",
    document.children,
  ).find((element) => (
    element.attribs?.["data-section-id"] === sectionId
    || element.attribs?.["data-id"] === sectionId
  )) ?? null
}

/** Restore only the documented custom-activity registration scripts after
 * Studio has packaged its sanitized storyboard. Imported scripts are never
 * executed by the editor itself. */
export function restoreImportedCustomActivityScripts(
  generatedHtml: string,
  sourceHtml: string,
  sectionId: string,
): string {
  const generatedDocument = parseDocument(generatedHtml)
  const sourceDocument = parseDocument(sourceHtml)
  const generatedSection = matchingSection(generatedDocument, sectionId)
  const sourceSection = matchingSection(sourceDocument, sectionId)
  if (
    !generatedSection
    || !sourceSection
    || !generatedSection.attribs?.["data-section-type"]?.startsWith("activity_custom_")
  ) {
    return generatedHtml
  }

  const sourceScripts = DomUtils.findAll(
    (element) => element.type === "script" && !element.attribs?.src
      && DomUtils.textContent(element).includes("adtRegisterCustomActivity"),
    sourceSection.children ?? [],
  )
  if (sourceScripts.length === 0) return generatedHtml
  const generatedScriptBodies = new Set(DomUtils.findAll(
    (element) => element.type === "script",
    generatedSection.children ?? [],
  ).map((element) => DomUtils.textContent(element)))

  for (const sourceScript of sourceScripts) {
    const body = DomUtils.textContent(sourceScript)
    if (generatedScriptBodies.has(body)) continue
    const cloned = parseDocument(DomUtils.getOuterHTML(sourceScript)).children[0]
    if (cloned) DomUtils.appendChild(generatedSection, cloned)
  }
  return DomUtils.getOuterHTML(generatedDocument)
}
