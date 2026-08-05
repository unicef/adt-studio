import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import {
  GitHubPublishRequest,
  type GitHubPublishStateType,
  parseBookLabel,
} from "@adt/types"
import { prepareExport } from "../services/export-service.js"
import type { TaskService } from "../services/task-service.js"
import {
  buildPublishManifest,
  connectGitHub,
  detectGitWorkingTreeChanges,
  getGitHubRemoteHead,
  getGitWorkingTreeDiff,
  getPublishedFileDiff,
  openBookWorktreeInEditor,
  publishBookToGitHub,
  pullPublishedBookSnapshot,
  readLatestPublishVersion,
  readPublishVersions,
  speechEntityIdsFromDiff,
} from "../services/github-publishing-service.js"

const STEP_NAMES: GitHubPublishStateType["steps"][number]["name"][] = [
  "connect",
  "detect-changes",
  "package-book",
  "commit",
  "push",
  "enable-pages",
  "verify",
]

function sourceStampPath(bookDir: string): string {
  return path.join(bookDir, "publishing", "github", "source-stamp.json")
}

function sourceStamp(bookDir: string): number {
  let newest = 0
  const visit = (directory: string) => {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "adt" || entry.name === "publishing" || entry.name === ".DS_Store") continue
      const absolute = path.join(directory, entry.name)
      const stats = fs.statSync(absolute)
      newest = Math.max(newest, stats.mtimeMs)
      if (entry.isDirectory()) visit(absolute)
    }
  }
  for (const entry of fs.readdirSync(bookDir, { withFileTypes: true })) {
    const absolute = path.join(bookDir, entry.name)
    if (entry.isFile() && (/\.db$/i.test(entry.name) || entry.name === "config.yaml")) {
      newest = Math.max(newest, fs.statSync(absolute).mtimeMs)
    } else if (entry.isDirectory() && ["images", "audio", "videos"].includes(entry.name)) {
      visit(absolute)
    }
  }
  return newest
}

function readSourceStamp(bookDir: string): number {
  try {
    return Number(JSON.parse(fs.readFileSync(sourceStampPath(bookDir), "utf8")).stamp) || 0
  } catch {
    return 0
  }
}

function writeSourceStamp(bookDir: string, stamp: number): void {
  const target = sourceStampPath(bookDir)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify({ stamp, materializedAt: new Date().toISOString() }, null, 2))
}

function tokenFromHeader(value?: string): string {
  const token = value?.trim()
  if (!token) throw new HTTPException(401, { message: "A GitHub token is required" })
  return token
}

function resolveBookDir(booksDir: string, label: string): { safeLabel: string; bookDir: string } {
  let safeLabel: string
  try {
    safeLabel = parseBookLabel(label)
  } catch (error) {
    throw new HTTPException(400, { message: error instanceof Error ? error.message : String(error) })
  }
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  if (!fs.existsSync(bookDir)) throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
  return { safeLabel, bookDir }
}

export function createGitHubPublishingRoutes(
  booksDir: string,
  webAssetsDir: string,
  configPath?: string,
  taskService?: TaskService,
): Hono {
  const app = new Hono()
  const active = new Map<string, GitHubPublishStateType>()

  app.get("/github/connection", async (c) => {
    const token = tokenFromHeader(c.req.header("X-GitHub-Token"))
    try {
      return c.json(await connectGitHub(token))
    } catch (error) {
      throw new HTTPException(401, { message: error instanceof Error ? error.message : String(error) })
    }
  })

  app.get("/books/:label/github-publishing/status", (c) => {
    const { safeLabel, bookDir } = resolveBookDir(booksDir, c.req.param("label"))
    const running = active.get(safeLabel)
    if (running) return c.json(running)
    const latest = readLatestPublishVersion(bookDir)
    if (latest) return c.json(latest.state)
    return c.json(null)
  })

  app.get("/books/:label/github-publishing/deployments", (c) => {
    const { bookDir } = resolveBookDir(booksDir, c.req.param("label"))
    return c.json(readPublishVersions(bookDir).map((record) => record.state))
  })

  app.get("/books/:label/github-publishing/deployments/:deploymentId/diff", async (c) => {
    const { bookDir } = resolveBookDir(booksDir, c.req.param("label"))
    const deploymentId = c.req.param("deploymentId").trim()
    const filePath = c.req.query("path")?.trim()
    if (!deploymentId || !filePath) {
      throw new HTTPException(400, { message: "A deployment and changed file path are required" })
    }
    try {
      return c.json(await getPublishedFileDiff(bookDir, deploymentId, filePath))
    } catch (error) {
      throw new HTTPException(404, { message: error instanceof Error ? error.message : String(error) })
    }
  })

  app.get("/books/:label/github-publishing/changes", async (c) => {
    const { safeLabel, bookDir } = resolveBookDir(booksDir, c.req.param("label"))
    let changes = await detectGitWorkingTreeChanges(bookDir)
    const stamp = sourceStamp(bookDir)
    // Pipeline edits live in versioned book storage. Materialize them into the
    // deployable worktree once, but never overwrite a direct local file edit.
    if (changes.length === 0 && stamp > readSourceStamp(bookDir)) {
      await prepareExport(safeLabel, "adt", booksDir, webAssetsDir, configPath)
      writeSourceStamp(bookDir, stamp)
      changes = await detectGitWorkingTreeChanges(bookDir)
    }
    const current = buildPublishManifest(path.join(bookDir, "adt"))
    return c.json({ changes, packaged: Object.keys(current).length > 0 })
  })

  app.post("/books/:label/github-publishing/open-editor", async (c) => {
    const { bookDir } = resolveBookDir(booksDir, c.req.param("label"))
    const body = await c.req.json().catch(() => ({})) as { editor?: string }
    if (body.editor !== "vscode" && body.editor !== "cursor" && body.editor !== "system") {
      throw new HTTPException(400, { message: "Choose VS Code, Cursor, or the system editor" })
    }
    try {
      await openBookWorktreeInEditor(bookDir, body.editor)
      return c.json({ ok: true })
    } catch (error) {
      throw new HTTPException(500, { message: error instanceof Error ? error.message : String(error) })
    }
  })

  app.get("/books/:label/github-publishing/diff", async (c) => {
    const { bookDir } = resolveBookDir(booksDir, c.req.param("label"))
    const filePath = c.req.query("path")?.trim()
    if (!filePath) throw new HTTPException(400, { message: "A changed file path is required" })
    try {
      return c.json(await getGitWorkingTreeDiff(bookDir, filePath))
    } catch (error) {
      throw new HTTPException(404, { message: error instanceof Error ? error.message : String(error) })
    }
  })

  app.get("/books/:label/github-publishing/speech-suggestions", async (c) => {
    const { bookDir } = resolveBookDir(booksDir, c.req.param("label"))
    const workingChanges = await detectGitWorkingTreeChanges(bookDir)
    const workingTextChanges = workingChanges.filter((change) => /\.(?:html|json)$/i.test(change.path))
    // Regenerated audio itself becomes a Git change. Keep recommending the
    // text entities from the latest deployment until a newer text edit exists,
    // rather than losing the remaining suggestions after the first clip.
    const latest = workingTextChanges.length === 0 ? readLatestPublishVersion(bookDir) : null
    const changes = workingTextChanges.length > 0 ? workingTextChanges : (latest?.state.changes ?? [])
    const ids = new Set<string>()
    const filesById = new Map<string, Set<string>>()
    for (const change of changes) {
      if (!/\.(?:html|json)$/i.test(change.path)) continue
      try {
        const diff = latest
          ? await getPublishedFileDiff(bookDir, latest.state.id, change.path)
          : await getGitWorkingTreeDiff(bookDir, change.path)
        for (const textId of speechEntityIdsFromDiff(diff)) {
          ids.add(textId)
          const files = filesById.get(textId) ?? new Set<string>()
          files.add(change.path)
          filesById.set(textId, files)
        }
      } catch {
        // A concurrently changed/deleted file may disappear between status and
        // diff reads. Other stable changes should still produce suggestions.
      }
    }
    return c.json({
      source: workingTextChanges.length > 0 ? "working-tree" : latest ? "latest-deployment" : "none",
      items: [...ids].map((textId) => ({ textId, files: [...(filesById.get(textId) ?? [])] })),
    })
  })

  app.get("/books/:label/github-publishing/remote-status", async (c) => {
    const token = tokenFromHeader(c.req.header("X-GitHub-Token"))
    const { bookDir } = resolveBookDir(booksDir, c.req.param("label"))
    const latest = readLatestPublishVersion(bookDir)
    if (!latest?.state.owner || !latest.state.repository) {
      return c.json({
        configured: false,
        behind: false,
        conflict: false,
        localChangeCount: (await detectGitWorkingTreeChanges(bookDir)).length,
        remoteCommitSha: null,
        localCommitSha: null,
      })
    }
    const remoteCommitSha = await getGitHubRemoteHead(
      token,
      latest.state.owner,
      latest.state.repository,
      latest.state.branch,
    )
    const localChanges = await detectGitWorkingTreeChanges(bookDir)
    const behind = remoteCommitSha !== latest.state.commitSha
    return c.json({
      configured: true,
      behind,
      conflict: behind && localChanges.length > 0,
      localChangeCount: localChanges.length,
      remoteCommitSha,
      localCommitSha: latest.state.commitSha ?? null,
    })
  })

  app.post("/books/:label/github-publishing/pull", async (c) => {
    const token = tokenFromHeader(c.req.header("X-GitHub-Token"))
    const { bookDir } = resolveBookDir(booksDir, c.req.param("label"))
    const latest = readLatestPublishVersion(bookDir)
    if (!latest?.state.owner || !latest.state.repository) {
      throw new HTTPException(409, { message: "Publish the book before pulling remote changes" })
    }
    const localChanges = await detectGitWorkingTreeChanges(bookDir)
    if (localChanges.length > 0) {
      throw new HTTPException(409, {
        message: `Sync paused because ${localChanges.length} local change(s) must be committed or resolved first`,
      })
    }
    const result = await pullPublishedBookSnapshot({
      bookDir,
      token,
      owner: latest.state.owner,
      repository: latest.state.repository,
      branch: latest.state.branch,
    })
    return c.json(result)
  })

  app.post("/books/:label/github-publishing/publish", async (c) => {
    const token = tokenFromHeader(c.req.header("X-GitHub-Token"))
    const { safeLabel, bookDir } = resolveBookDir(booksDir, c.req.param("label"))
    if (active.get(safeLabel)?.status === "running") {
      throw new HTTPException(409, { message: "A GitHub deployment is already running" })
    }
    const parsed = GitHubPublishRequest.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.issues.map((issue) => issue.message).join(", ") })
    }

    const now = new Date().toISOString()
    const state: GitHubPublishStateType = {
      id: crypto.randomUUID(),
      status: "running",
      repository: parsed.data.repository,
      branch: "main",
      changes: [],
      startedAt: now,
      steps: STEP_NAMES.map((name) => ({ name, status: "pending" })),
    }
    active.set(safeLabel, state)

    const runPublish = async (emitProgress?: (message: string, percent?: number) => void) => {
      const notify = (next: GitHubPublishStateType) => active.set(safeLabel, structuredClone(next))
      const notifyWithProgress = (next: GitHubPublishStateType) => {
        notify(next)
        const runningIndex = next.steps.findIndex((step) => step.status === "running")
        const running = runningIndex >= 0 ? next.steps[runningIndex] : undefined
        emitProgress?.(running?.detail ?? "Publishing book to GitHub", runningIndex >= 0 ? Math.round((runningIndex / next.steps.length) * 100) : 100)
      }
      try {
        const result = await publishBookToGitHub({
          bookDir,
          token,
          request: parsed.data,
          state,
          onState: notifyWithProgress,
          prepareBook: async () => {
            // A direct edit in the deployable worktree is authoritative. Only
            // rebuild from pipeline storage when Git reports a clean worktree.
            if ((await detectGitWorkingTreeChanges(bookDir)).length === 0) {
              const stamp = sourceStamp(bookDir)
              await prepareExport(safeLabel, "adt", booksDir, webAssetsDir, configPath)
              writeSourceStamp(bookDir, stamp)
            }
          },
        })
        if (result.status === "failed") throw new Error(result.error ?? "GitHub deployment failed")
        return result
      } catch (error) {
        state.status = "failed"
        state.error = error instanceof Error ? error.message : String(error)
        state.completedAt = new Date().toISOString()
        const running = state.steps.find((step) => step.status === "running")
        if (running) {
          running.status = "failed"
          running.detail = state.error
          running.completedAt = state.completedAt
        }
        notify(state)
        throw error
      }
    }

    if (taskService) {
      taskService.submitTask(safeLabel, "publish-github", "Publishing book to GitHub", runPublish, {
        url: `/books/${encodeURIComponent(safeLabel)}/publish`,
      })
    } else {
      void runPublish().catch(() => undefined)
    }

    return c.json(state, 202)
  })

  return app
}
