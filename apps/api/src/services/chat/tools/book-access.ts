import { createBookStorage, type Storage } from "@adt/storage"
import {
  PIPELINE,
  STAGE_ORDER,
  type ContentNodeData,
  type StageName,
} from "@adt/types"
import type { ChatToolContext } from "../context.js"

export type StageStatus = "done" | "running" | "error" | "partial" | "idle"

export interface StepStatus {
  step: string
  label: string
  status: string
  message?: string
  error?: string
}

export interface StageStatusSummary {
  stage: StageName
  label: string
  status: StageStatus
  steps: StepStatus[]
}

/** Open the book, run `read`, and always close the connection. */
export function withStorage<T>(ctx: ChatToolContext, read: (storage: Storage) => T): T {
  const storage = createBookStorage(ctx.safeLabel, ctx.paths.booksDir)
  try {
    return read(storage)
  } finally {
    storage.close()
  }
}

export function readNode<T>(storage: Storage, node: string, itemId: string): T | null {
  return (storage.getLatestNodeData(node, itemId)?.data as T | undefined) ?? null
}

export function stageStatuses(storage: Storage): StageStatusSummary[] {
  const runs = new Map(storage.getStepRuns().map((run) => [run.step, run]))

  return STAGE_ORDER.map((stageName) => {
    const stage = PIPELINE.find((entry) => entry.name === stageName)
    const steps: StepStatus[] = (stage?.steps ?? []).map((step) => {
      const run = runs.get(step.name)
      return {
        step: step.name,
        label: step.label,
        status: run?.status ?? "idle",
        message: run?.message ?? undefined,
        error: run?.error ?? undefined,
      }
    })

    let status: StageStatus = "idle"
    if (steps.some((step) => step.status === "running")) status = "running"
    else if (steps.some((step) => step.status === "error")) status = "error"
    else if (steps.length > 0 && steps.every((step) => step.status === "done" || step.status === "skipped")) {
      status = "done"
    } else if (steps.some((step) => step.status === "done" || step.status === "skipped")) {
      status = "partial"
    }

    return { stage: stageName, label: stage?.label ?? stageName, status, steps }
  })
}

interface SectioningSection {
  sectionId?: string
  sectionType?: string
  isPruned?: boolean
  nodes?: ContentNodeData[]
}

export interface SectioningNodeData {
  reasoning?: string
  sections?: SectioningSection[]
}

/** Visible text of one section, in reading order, with pruned nodes dropped. */
export function sectionText(section: SectioningSection): string {
  const parts: string[] = []
  const walk = (node: ContentNodeData): void => {
    if (node.isPruned) return
    if (typeof node.text === "string" && node.text.length > 0) parts.push(node.text)
    for (const child of node.children ?? []) walk(child)
  }
  for (const node of section.nodes ?? []) walk(node)
  return parts.join("\n")
}

export function sectioningText(sectioning: SectioningNodeData | null): string {
  if (!sectioning?.sections) return ""
  return sectioning.sections
    .filter((section) => !section.isPruned)
    .map(sectionText)
    .filter(Boolean)
    .join("\n")
}

export function bookLanguages(storage: Storage, bookConfig: Record<string, unknown> | null) {
  const config = readNode<{ language?: string; editing_language?: string }>(
    storage,
    "config",
    "book",
  )
  const metadata = readNode<{ language_code?: string | null }>(storage, "metadata", "book")
  const editing =
    (bookConfig?.editing_language as string | undefined) ??
    config?.editing_language ??
    config?.language ??
    metadata?.language_code ??
    null
  const output = Array.isArray(bookConfig?.output_languages)
    ? (bookConfig.output_languages as string[])
    : []
  return { editingLanguage: editing, outputLanguages: output }
}
