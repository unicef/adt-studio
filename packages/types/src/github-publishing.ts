import { z } from "zod"

export const GitHubPublishStepName = z.enum([
  "connect",
  "detect-changes",
  "package-book",
  "commit",
  "push",
  "enable-pages",
  "verify",
])

export const GitHubPublishStepStatus = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
])

export const GitHubPublishStep = z.object({
  name: GitHubPublishStepName,
  status: GitHubPublishStepStatus,
  detail: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
})

export const GitHubPublishRequest = z.object({
  repository: z.string().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/),
  owner: z.string().min(1).max(100).regex(/^[A-Za-z0-9-]+$/).optional(),
  description: z.string().max(350).optional(),
  visibility: z.enum(["public", "private"]).default("public"),
  commitMessage: z.string().min(1).max(200).optional(),
})

export const GitHubFileChange = z.object({
  path: z.string(),
  status: z.enum(["added", "modified", "deleted"]),
})

export const GitHubDiffLine = z.object({
  type: z.enum(["context", "added", "deleted"]),
  oldLine: z.number().int().positive().optional(),
  newLine: z.number().int().positive().optional(),
  content: z.string(),
})

export const GitHubFileDiff = z.object({
  path: z.string(),
  status: z.enum(["added", "modified", "deleted"]),
  binary: z.boolean(),
  truncated: z.boolean().default(false),
  lines: z.array(GitHubDiffLine),
})

export const GitHubPublishState = z.object({
  id: z.string(),
  status: z.enum(["idle", "running", "completed", "failed"]),
  repository: z.string(),
  owner: z.string().optional(),
  branch: z.string().default("main"),
  commitMessage: z.string().optional(),
  commitSha: z.string().optional(),
  repositoryUrl: z.string().url().optional(),
  pagesUrl: z.string().url().optional(),
  error: z.string().optional(),
  steps: z.array(GitHubPublishStep),
  changes: z.array(GitHubFileChange).default([]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
})

export const GitHubConnection = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().url(),
})

export type GitHubPublishRequest = z.infer<typeof GitHubPublishRequest>
export type GitHubPublishState = z.infer<typeof GitHubPublishState>
export type GitHubPublishStep = z.infer<typeof GitHubPublishStep>
export type GitHubFileChange = z.infer<typeof GitHubFileChange>
export type GitHubDiffLine = z.infer<typeof GitHubDiffLine>
export type GitHubFileDiff = z.infer<typeof GitHubFileDiff>
export type GitHubConnection = z.infer<typeof GitHubConnection>
