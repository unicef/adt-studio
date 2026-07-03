import { z } from "zod"

export const TaskKind = z.enum([
  "image-generate",
  "re-render",
  "ai-edit",
  "package-adt",
  "prepare-export",
  "transcribe-timestamps",
])
export type TaskKind = z.infer<typeof TaskKind>

export const TaskStatus = z.enum(["queued", "running", "completed", "failed"])
export type TaskStatus = z.infer<typeof TaskStatus>

export const TaskEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("task-start"),
    taskId: z.string(),
    kind: TaskKind,
    label: z.string(),
    description: z.string(),
    pageId: z.string().optional(),
    url: z.string().optional(),
  }),
  z.object({
    type: z.literal("task-progress"),
    taskId: z.string(),
    message: z.string(),
    percent: z.number().optional(),
  }),
  z.object({
    type: z.literal("task-complete"),
    taskId: z.string(),
    result: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("task-error"),
    taskId: z.string(),
    error: z.string(),
  }),
])
export type TaskEvent = z.infer<typeof TaskEvent>

export const TaskInfo = z.object({
  taskId: z.string(),
  kind: TaskKind,
  status: TaskStatus,
  description: z.string(),
  pageId: z.string().optional(),
  url: z.string().optional(),
  error: z.string().optional(),
  result: z.unknown().optional(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
})
export type TaskInfo = z.infer<typeof TaskInfo>
