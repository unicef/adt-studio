import fs from "node:fs"
import path from "node:path"

import { Liquid } from "liquidjs"
import type {
  GlossaryOutput,
  QuizGenerationOutput,
  TextCatalogOutput,
} from "@adt/types"

import { getGlossaryItemTextId } from "../glossary.js"
import { ACTIVITY_CLASSIFICATION_GUIDE } from "./activity.js"

export const ADT_AGENT_GUIDE_VERSION = 2 as const

export interface AdtAgentGuidePageEntry {
  section_id: string
  href: string
  page_number?: number
}

export interface AdtAgentGuideContext {
  title: string
  label: string
  summary?: string
  language: string
  outputLanguages: string[]
  pageList: AdtAgentGuidePageEntry[]
  catalog?: TextCatalogOutput
  glossary?: GlossaryOutput
  quizData?: QuizGenerationOutput
  imageMap?: ReadonlyMap<string, string>
  configJson?: unknown
  hasGlossary: boolean
  hasQuiz: boolean
  editingContractVersion: number
}

export interface AdtAgentGuideInspection {
  present: boolean
  version: number | null
  current: boolean
}

const GUIDE_VERSION_PATTERN = /<!--\s*adt-studio-agent-guide:\s*(\d+)\s*-->/i

export function inspectAdtAgentGuide(content: string | null): AdtAgentGuideInspection {
  if (content === null) return { present: false, version: null, current: false }
  const match = content.slice(0, 2048).match(GUIDE_VERSION_PATTERN)
  const version = match ? Number.parseInt(match[1], 10) : null
  return {
    present: true,
    version,
    // A guide produced by a newer Studio version must never be replaced with
    // this installation's older instructions.
    current: version !== null && version >= ADT_AGENT_GUIDE_VERSION,
  }
}

/** Render the canonical assistant guide used both by export and import repair. */
export function renderAdtAgentGuide(
  template: string,
  ctx: AdtAgentGuideContext,
): string {
  const liquid = new Liquid({ strictVariables: false })
  const entries = ctx.catalog?.entries ?? []
  const sampleBodyText = entries.find((entry) => /_gp\d+_tx\d+$/.test(entry.id))
    ?? { id: "pg001_gp001_tx001", text: "" }
  const sampleImageText = entries.find((entry) => /_im\d+$/.test(entry.id))
    ?? { id: "pg001_im001", text: "" }
  const samplePageId = ctx.pageList.find((page) => (
    page.section_id.startsWith("pg") && page.page_number !== undefined
  ))?.section_id ?? ctx.pageList[0]?.section_id ?? "pg001_sec001"

  let sampleGlossary: Record<string, unknown> | undefined
  if (ctx.glossary?.items?.length) {
    const item = ctx.glossary.items[0]
    const glossaryId = getGlossaryItemTextId(item, 0)
    sampleGlossary = {
      id: glossaryId,
      defId: `${glossaryId}_def`,
      word: item.word,
      definition: item.definition,
      variations: item.variations,
      variationsJson: JSON.stringify(item.variations),
      emoji: item.emojis.join(""),
    }
  }

  let sampleQuiz: Record<string, unknown> | undefined
  if (ctx.quizData?.quizzes?.length) {
    const quiz = ctx.quizData.quizzes[0]
    const quizId = "qz001"
    const correctAnswers: Record<string, boolean> = {}
    const explanations: Record<string, string> = {}
    const options = quiz.options.map((option, index) => {
      const optionId = `${quizId}_o${index}`
      const explanationId = `${optionId}_exp`
      correctAnswers[optionId] = index === quiz.answerIndex
      explanations[optionId] = explanationId
      return {
        id: optionId,
        text: option.text,
        expId: explanationId,
        expText: option.explanation,
      }
    })
    sampleQuiz = {
      id: quizId,
      question: quiz.question,
      options,
      correctAnswersJson: JSON.stringify(correctAnswers),
      explanationsJson: JSON.stringify(explanations),
    }
  }

  const pageImages = [...(ctx.imageMap ?? new Map<string, string>())]
    .filter(([id]) => id.endsWith("_page"))
    .map(([, filename]) => filename)
    .sort()

  return liquid.parseAndRenderSync(template, {
    agentGuideVersion: ADT_AGENT_GUIDE_VERSION,
    title: ctx.title,
    label: ctx.label,
    summary: ctx.summary,
    language: ctx.language,
    outputLanguages: ctx.outputLanguages,
    totalPages: ctx.pageList.length,
    firstPages: ctx.pageList.slice(0, 5),
    samplePageId,
    sampleBodyText,
    sampleImageText,
    sampleGlossary,
    sampleQuiz,
    hasGlossary: ctx.hasGlossary,
    hasQuiz: ctx.hasQuiz,
    configJsonFormatted: JSON.stringify(ctx.configJson ?? {}, null, 2),
    pageImages,
    editingContractVersion: ctx.editingContractVersion,
    activityClassificationGuide: ACTIVITY_CLASSIFICATION_GUIDE,
  })
}

const TEMPLATE_FILE = "AGENTS.md.liquid"

/**
 * Locate the Liquid template for the exported assistant guide.
 *
 * `webAssetsDir` normally points at `<assets>/adt`, so the template sits beside
 * it. In the desktop app the web assets are unpacked from a ZIP into a temp
 * directory, which puts `path.dirname(webAssetsDir)` under the OS temp root
 * where no template exists — hence the `WEB_ASSETS_DIR` and repo-relative
 * fallbacks. Import and export must agree on this, because import treats a
 * missing template as a hard failure while export silently skips the guide.
 */
export function resolveAdtAgentGuideTemplatePath(webAssetsDir?: string): string | null {
  const candidates = [
    ...(webAssetsDir ? [path.join(path.dirname(webAssetsDir), TEMPLATE_FILE)] : []),
    ...(process.env.WEB_ASSETS_DIR
      ? [path.join(path.dirname(path.resolve(process.env.WEB_ASSETS_DIR)), TEMPLATE_FILE)]
      : []),
    path.resolve(process.cwd(), "assets", TEMPLATE_FILE),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

export function readAdtAgentGuideTemplate(webAssetsDir?: string): string | null {
  const templatePath = resolveAdtAgentGuideTemplatePath(webAssetsDir)
  return templatePath ? fs.readFileSync(templatePath, "utf8") : null
}
