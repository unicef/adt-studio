import crypto from "node:crypto"
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import git from "isomorphic-git"
import http from "isomorphic-git/http/node"
import type {
  GitHubConnectionType,
  GitHubFileChangeType,
  GitHubFileDiffType,
  GitHubPublishRequestType,
  GitHubPublishStateType,
} from "@adt/types"

const API_ROOT = "https://api.github.com"
const MAX_BLOB_BYTES = 95 * 1024 * 1024
const GITHUB_REQUEST_ATTEMPTS = 5

function networkErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  if (cause instanceof Error && cause.message && cause.message !== error.message) {
    return `${error.message}: ${cause.message}`
  }
  return error.message
}

function isTransientNetworkError(error: unknown): boolean {
  const detail = networkErrorDetail(error)
  return /fetch failed|timeout|timed out|socket|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR/i.test(detail)
}

async function waitForRetry(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, attempt * 400))
}

interface GitHubResponse<T> {
  status: number
  data: T
}

interface FileManifestEntry {
  sha256: string
  size: number
}

export interface PublishVersionRecord {
  state: GitHubPublishStateType
  manifest: Record<string, FileManifestEntry>
}

export type PublishStateListener = (state: GitHubPublishStateType) => void

function publishingDir(bookDir: string): string {
  return path.join(bookDir, "publishing", "github")
}

function versionsDir(bookDir: string): string {
  return path.join(publishingDir(bookDir), "versions")
}

function gitDir(bookDir: string): string {
  return path.join(publishingDir(bookDir), "repository.git")
}

function gitAuth(token: string): { username: string; password: string } {
  return { username: token, password: "x-oauth-basic" }
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%2F/gi, "/")
}

async function githubRequest<T>(
  token: string,
  endpoint: string,
  init: RequestInit = {},
): Promise<GitHubResponse<T>> {
  for (let attempt = 1; attempt <= GITHUB_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${API_ROOT}${endpoint}`, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ADT-Studio",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
        signal: init.signal ?? AbortSignal.timeout(60_000),
      })
      const text = await response.text()
      let data: T & { message?: string }
      try {
        data = text ? JSON.parse(text) as T & { message?: string } : {} as T & { message?: string }
      } catch {
        data = { message: text || undefined } as T & { message?: string }
      }
      if (!response.ok) {
        const message = data.message ?? `GitHub request failed (${response.status})`
        throw new Error(message)
      }
      return { status: response.status, data }
    } catch (error) {
      if (!isTransientNetworkError(error)) throw error
      if (attempt < GITHUB_REQUEST_ATTEMPTS) {
        await waitForRetry(attempt)
        continue
      }
      throw new Error(
        `Cannot connect to the GitHub API after ${GITHUB_REQUEST_ATTEMPTS} attempts. ${networkErrorDetail(error)}. Check the internet connection, VPN, proxy, or firewall and try again.`,
        { cause: error },
      )
    }
  }
  throw new Error("Cannot connect to the GitHub API")
}

export async function connectGitHub(token: string): Promise<GitHubConnectionType> {
  const { data } = await githubRequest<{
    login: string
    name: string | null
    avatar_url: string
  }>(token, "/user")
  return { login: data.login, name: data.name, avatarUrl: data.avatar_url }
}

export async function getGitHubRemoteHead(
  token: string,
  owner: string,
  repository: string,
  branch = "main",
): Promise<string> {
  const repoPath = `/repos/${encodePathSegment(owner)}/${encodePathSegment(repository)}`
  const ref = await githubRequest<{ object: { sha: string } }>(
    token,
    `${repoPath}/git/ref/heads/${encodePathSegment(branch)}`,
  )
  return ref.data.object.sha
}

export async function pullPublishedBookSnapshot(options: {
  bookDir: string
  token: string
  owner: string
  repository: string
  branch?: string
}): Promise<{ commitSha: string; files: number; backupPath: string | null }> {
  const { bookDir, token, owner, repository } = options
  const branch = options.branch ?? "main"
  const repoPath = `/repos/${encodePathSegment(owner)}/${encodePathSegment(repository)}`
  const commitSha = await getGitHubRemoteHead(token, owner, repository, branch)
  const commit = await githubRequest<{ tree: { sha: string } }>(token, `${repoPath}/git/commits/${commitSha}`)
  const tree = await githubRequest<{
    tree: Array<{ path: string; type: string; sha: string; size?: number }>
    truncated?: boolean
  }>(token, `${repoPath}/git/trees/${commit.data.tree.sha}?recursive=1`)
  if (tree.data.truncated) throw new Error("The remote book is too large to pull safely")

  const pullRoot = path.join(publishingDir(bookDir), "pulls", commitSha)
  fs.rmSync(pullRoot, { recursive: true, force: true })
  fs.mkdirSync(pullRoot, { recursive: true })
  const blobs = tree.data.tree.filter((entry) => entry.type === "blob")
  for (const entry of blobs) {
    if ((entry.size ?? 0) > MAX_BLOB_BYTES) throw new Error(`${entry.path} is too large to pull from GitHub`)
    const blob = await githubRequest<{ content: string; encoding: string }>(token, `${repoPath}/git/blobs/${entry.sha}`)
    if (blob.data.encoding !== "base64") throw new Error(`Unsupported GitHub encoding for ${entry.path}`)
    const destination = path.join(pullRoot, entry.path)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, Buffer.from(blob.data.content.replace(/\s/g, ""), "base64"))
  }

  const adtDir = path.join(bookDir, "adt")
  let backupPath: string | null = null
  if (fs.existsSync(adtDir)) {
    const backupRoot = path.join(publishingDir(bookDir), "local-versions")
    fs.mkdirSync(backupRoot, { recursive: true })
    backupPath = path.join(backupRoot, `${Date.now()}-${commitSha.slice(0, 7)}`)
    fs.renameSync(adtDir, backupPath)
  }
  fs.renameSync(pullRoot, adtDir)
  return { commitSha, files: blobs.length, backupPath }
}

function walkFiles(root: string): string[] {
  const files: string[] = []
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".DS_Store" || entry.name === ".build-hash") continue
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join("/"))
    }
  }
  visit(root)
  return files.sort()
}

export function buildPublishManifest(root: string): Record<string, FileManifestEntry> {
  const manifest: Record<string, FileManifestEntry> = {}
  if (!fs.existsSync(root)) return manifest
  for (const relativePath of walkFiles(root)) {
    const content = fs.readFileSync(path.join(root, relativePath))
    manifest[relativePath] = {
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
      size: content.byteLength,
    }
  }
  return manifest
}

export function diffPublishManifests(
  previous: Record<string, FileManifestEntry>,
  current: Record<string, FileManifestEntry>,
): GitHubFileChangeType[] {
  const paths = new Set([...Object.keys(previous), ...Object.keys(current)])
  const changes: GitHubFileChangeType[] = []
  for (const filePath of [...paths].sort()) {
    if (!previous[filePath]) {
      changes.push({ path: filePath, status: "added" })
      continue
    }
    if (!current[filePath]) {
      changes.push({ path: filePath, status: "deleted" })
      continue
    }
    if (previous[filePath].sha256 !== current[filePath].sha256) {
      changes.push({ path: filePath, status: "modified" })
    }
  }
  return changes
}

function matrixToChanges(matrix: Array<[string, number, number, number]>): GitHubFileChangeType[] {
  return matrix
    .filter(([filePath, head, workdir]) =>
      filePath !== ".DS_Store" && filePath !== ".build-hash" && head !== workdir)
    .map(([filePath, head, workdir]) => ({
      path: filePath,
      status: head === 0 ? "added" as const : workdir === 0 ? "deleted" as const : "modified" as const,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
}

export async function detectGitWorkingTreeChanges(bookDir: string): Promise<GitHubFileChangeType[]> {
  const dir = path.join(bookDir, "adt")
  if (!fs.existsSync(dir)) return []
  const repositoryGitDir = gitDir(bookDir)
  if (!fs.existsSync(path.join(repositoryGitDir, "HEAD"))) {
    return walkFiles(dir).map((filePath) => ({ path: filePath, status: "added" as const }))
  }
  const matrix = await git.statusMatrix({ fs, dir, gitdir: repositoryGitDir })
  return matrixToChanges(matrix)
}

export type BookEditor = "vscode" | "cursor" | "system"

/** Open the published book worktree in an explicitly selected local editor. */
export async function openBookWorktreeInEditor(
  bookDir: string,
  editor: BookEditor,
): Promise<void> {
  const worktree = path.join(bookDir, "adt")
  if (!fs.existsSync(worktree)) throw new Error("Package the book before opening its Git worktree")

  let command: string
  let args: string[]
  if (editor === "system") {
    if (process.platform === "darwin") [command, args] = ["open", [worktree]]
    else if (process.platform === "win32") [command, args] = ["explorer.exe", [worktree]]
    else [command, args] = ["xdg-open", [worktree]]
  } else if (process.platform === "darwin") {
    [command, args] = ["open", ["-a", editor === "vscode" ? "Visual Studio Code" : "Cursor", worktree]]
  } else {
    [command, args] = [editor === "vscode" ? "code" : "cursor", [worktree]]
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" })
    child.once("error", (error) => reject(new Error(`Unable to open the editor: ${error.message}`)))
    child.once("spawn", () => {
      child.unref()
      resolve()
    })
  })
}

function isBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8_192).includes(0)
}

function lineDiff(before: string, after: string): GitHubFileDiffType["lines"] {
  const oldLines = before === "" ? [] : before.split("\n")
  const newLines = after === "" ? [] : after.split("\n")
  const rows = oldLines.length + 1
  const cols = newLines.length + 1
  // Exact LCS for normal text files. Large generated bundles use a bounded
  // prefix/suffix comparison so opening a diff can never freeze the API.
  if (oldLines.length * newLines.length > 1_000_000) {
    let prefix = 0
    while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1
    let oldSuffix = oldLines.length - 1
    let newSuffix = newLines.length - 1
    while (oldSuffix >= prefix && newSuffix >= prefix && oldLines[oldSuffix] === newLines[newSuffix]) {
      oldSuffix -= 1
      newSuffix -= 1
    }
    return [
      ...oldLines.slice(0, prefix).map((content, index) => ({ type: "context" as const, oldLine: index + 1, newLine: index + 1, content })),
      ...oldLines.slice(prefix, oldSuffix + 1).map((content, index) => ({ type: "deleted" as const, oldLine: prefix + index + 1, content })),
      ...newLines.slice(prefix, newSuffix + 1).map((content, index) => ({ type: "added" as const, newLine: prefix + index + 1, content })),
      ...oldLines.slice(oldSuffix + 1).map((content, index) => ({ type: "context" as const, oldLine: oldSuffix + index + 2, newLine: newSuffix + index + 2, content })),
    ]
  }
  const table = Array.from({ length: rows }, () => new Uint32Array(cols))
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? table[oldIndex + 1][newIndex + 1] + 1
        : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1])
    }
  }
  const lines: GitHubFileDiffType["lines"] = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      lines.push({ type: "context", oldLine: oldIndex + 1, newLine: newIndex + 1, content: oldLines[oldIndex] })
      oldIndex += 1
      newIndex += 1
    } else if (newIndex < newLines.length && (oldIndex >= oldLines.length || table[oldIndex][newIndex + 1] >= table[oldIndex + 1][newIndex])) {
      lines.push({ type: "added", newLine: newIndex + 1, content: newLines[newIndex] })
      newIndex += 1
    } else {
      lines.push({ type: "deleted", oldLine: oldIndex + 1, content: oldLines[oldIndex] })
      oldIndex += 1
    }
  }
  return lines
}

export async function getGitWorkingTreeDiff(bookDir: string, filePath: string): Promise<GitHubFileDiffType> {
  const change = (await detectGitWorkingTreeChanges(bookDir)).find((candidate) => candidate.path === filePath)
  if (!change) throw new Error("The selected file has no unpublished changes")
  const dir = path.join(bookDir, "adt")
  const workingPath = path.resolve(dir, filePath)
  if (workingPath !== dir && !workingPath.startsWith(`${dir}${path.sep}`)) throw new Error("Invalid book file path")
  const afterBuffer = change.status === "deleted" ? Buffer.alloc(0) : fs.readFileSync(workingPath)
  let beforeBuffer = Buffer.alloc(0)
  if (change.status !== "added") {
    const oid = await git.resolveRef({ fs, dir, gitdir: gitDir(bookDir), ref: "HEAD" })
    beforeBuffer = Buffer.from((await git.readBlob({ fs, dir, gitdir: gitDir(bookDir), oid, filepath: filePath })).blob)
  }
  const binary = isBinary(beforeBuffer) || isBinary(afterBuffer)
  const allLines = binary ? [] : lineDiff(beforeBuffer.toString("utf8"), afterBuffer.toString("utf8"))
  const limit = 5_000
  return { path: filePath, status: change.status, binary, truncated: allLines.length > limit, lines: allLines.slice(0, limit) }
}

const SPEECH_ENTITY_ID_RE = /(?:data-id=["']|["'])(pg\d+_(?:n|t)\d+)["']/g

/** Extract text entity IDs whose source content changed in a Git diff. */
export function speechEntityIdsFromDiff(diff: GitHubFileDiffType): string[] {
  if (diff.binary || !/\.(?:html|json)$/i.test(diff.path)) return []
  const ids = new Set<string>()
  for (const line of diff.lines) {
    if (line.type === "context") continue
    for (const match of line.content.matchAll(SPEECH_ENTITY_ID_RE)) {
      if (match[1]) ids.add(match[1])
    }
  }
  return [...ids].sort()
}

async function synchronizeLocalGitRepository(options: {
  bookDir: string
  token: string
  owner: string
  repository: string
  branch: string
}): Promise<void> {
  const { bookDir, token, owner, repository, branch } = options
  const dir = path.join(bookDir, "adt")
  const repositoryGitDir = gitDir(bookDir)
  fs.mkdirSync(repositoryGitDir, { recursive: true })
  if (!fs.existsSync(path.join(repositoryGitDir, "HEAD"))) {
    await git.init({ fs, dir, gitdir: repositoryGitDir, defaultBranch: branch })
  }
  const url = `https://github.com/${owner}/${repository}.git`
  const remotes = await git.listRemotes({ fs, dir, gitdir: repositoryGitDir })
  if (remotes.some((remote) => remote.remote === "origin")) {
    await git.deleteRemote({ fs, dir, gitdir: repositoryGitDir, remote: "origin" })
  }
  await git.addRemote({ fs, dir, gitdir: repositoryGitDir, remote: "origin", url })
  await git.fetch({
    fs,
    http,
    dir,
    gitdir: repositoryGitDir,
    remote: "origin",
    ref: branch,
    singleBranch: true,
    depth: 1,
    onAuth: () => gitAuth(token),
  })
  const remoteOid = await git.resolveRef({ fs, dir, gitdir: repositoryGitDir, ref: `refs/remotes/origin/${branch}` })
  await git.writeRef({ fs, dir, gitdir: repositoryGitDir, ref: `refs/heads/${branch}`, value: remoteOid, force: true })
  await git.writeRef({ fs, dir, gitdir: repositoryGitDir, ref: "HEAD", value: `refs/heads/${branch}`, symbolic: true, force: true })
}

async function createLocalGitCommit(options: {
  bookDir: string
  branch: string
  message: string
  authorName: string
  authorEmail: string
  changes: GitHubFileChangeType[]
}): Promise<string> {
  const { bookDir, branch, message, authorName, authorEmail, changes } = options
  const dir = path.join(bookDir, "adt")
  const repositoryGitDir = gitDir(bookDir)
  for (const change of changes) {
    if (change.status === "deleted") {
      await git.remove({ fs, dir, gitdir: repositoryGitDir, filepath: change.path })
    } else {
      await git.add({ fs, dir, gitdir: repositoryGitDir, filepath: change.path })
    }
  }
  if (changes.length === 0) {
    return git.resolveRef({ fs, dir, gitdir: repositoryGitDir, ref: `refs/heads/${branch}` })
  }
  return git.commit({
    fs,
    dir,
    gitdir: repositoryGitDir,
    message,
    author: { name: authorName, email: authorEmail },
  })
}

async function pushWithSystemGit(options: {
  bookDir: string
  token: string
  branch: string
}): Promise<void> {
  const { bookDir, token, branch } = options
  const args = [
    `--git-dir=${gitDir(bookDir)}`,
    `--work-tree=${path.join(bookDir, "adt")}`,
    "-c",
    "credential.helper=!f() { echo username=x-access-token; echo password=$ADT_GITHUB_TOKEN; }; f",
    "push",
    "origin",
    `${branch}:${branch}`,
  ]
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", args, {
      env: { ...process.env, ADT_GITHUB_TOKEN: token, GIT_TERMINAL_PROMPT: "0" },
      stdio: ["ignore", "ignore", "pipe"],
    })
    let stderr = ""
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-8_000)
    })
    child.once("error", (error) => reject(new Error(`Unable to start Git transport: ${error.message}`)))
    child.once("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `Git push failed with exit code ${code ?? "unknown"}`))
    })
  })
}

async function pushLocalGitCommit(options: {
  bookDir: string
  token: string
  branch: string
  onFallback?: () => void
}): Promise<void> {
  const { bookDir, token, branch, onFallback } = options
  try {
    await git.push({
      fs,
      http,
      dir: path.join(bookDir, "adt"),
      gitdir: gitDir(bookDir),
      remote: "origin",
      ref: branch,
      onAuth: () => gitAuth(token),
    })
  } catch (error) {
    if (!isTransientNetworkError(error)) throw error
    onFallback?.()
    await pushWithSystemGit({ bookDir, token, branch })
  }
}

export function readLatestPublishVersion(bookDir: string): PublishVersionRecord | null {
  const dir = versionsDir(bookDir)
  if (!fs.existsSync(dir)) return null
  const names = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort()
  const latest = names.at(-1)
  if (!latest) return null
  return JSON.parse(fs.readFileSync(path.join(dir, latest), "utf-8")) as PublishVersionRecord
}

export function readPublishVersions(bookDir: string): PublishVersionRecord[] {
  const dir = versionsDir(bookDir)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8")) as PublishVersionRecord)
}

export async function getPublishedFileDiff(
  bookDir: string,
  deploymentId: string,
  filePath: string,
): Promise<GitHubFileDiffType> {
  const record = readPublishVersions(bookDir).find((candidate) => candidate.state.id === deploymentId)
  if (!record) throw new Error("Deployment not found")
  const change = record.state.changes.find((candidate) => candidate.path === filePath)
  if (!change) throw new Error("The selected file was not part of this deployment")
  if (!record.state.commitSha) throw new Error("This deployment did not create a Git commit")

  const dir = path.join(bookDir, "adt")
  const gitdir = gitDir(bookDir)
  const commit = await git.readCommit({ fs, dir, gitdir, oid: record.state.commitSha })
  const parentOid = commit.commit.parent[0]
  const readVersionBlob = async (oid: string | undefined): Promise<Buffer> => {
    if (!oid) return Buffer.alloc(0)
    try {
      return Buffer.from((await git.readBlob({ fs, dir, gitdir, oid, filepath: filePath })).blob)
    } catch {
      return Buffer.alloc(0)
    }
  }
  const beforeBuffer = change.status === "added" ? Buffer.alloc(0) : await readVersionBlob(parentOid)
  const afterBuffer = change.status === "deleted" ? Buffer.alloc(0) : await readVersionBlob(record.state.commitSha)
  const binary = isBinary(beforeBuffer) || isBinary(afterBuffer)
  const allLines = binary ? [] : lineDiff(beforeBuffer.toString("utf8"), afterBuffer.toString("utf8"))
  const limit = 5_000
  return {
    path: filePath,
    status: change.status,
    binary,
    truncated: allLines.length > limit,
    lines: allLines.slice(0, limit),
  }
}

export function writePublishVersion(bookDir: string, record: PublishVersionRecord): void {
  const dir = versionsDir(bookDir)
  fs.mkdirSync(dir, { recursive: true })
  const existing = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).length
  const filename = `${String(existing + 1).padStart(6, "0")}-${record.state.id}.json`
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(record, null, 2))
}

function suggestedCommitMessage(changes: GitHubFileChangeType[]): string {
  if (changes.length === 0) return "chore(book): republish accessible book"
  const added = changes.filter((change) => change.status === "added").length
  const modified = changes.filter((change) => change.status === "modified").length
  const deleted = changes.filter((change) => change.status === "deleted").length
  const details = [added && `${added} added`, modified && `${modified} updated`, deleted && `${deleted} removed`]
    .filter(Boolean)
    .join(", ")
  return `feat(book): publish accessible book (${details})`
}

function updateStep(
  state: GitHubPublishStateType,
  name: GitHubPublishStateType["steps"][number]["name"],
  status: GitHubPublishStateType["steps"][number]["status"],
  detail?: string,
): void {
  const step = state.steps.find((candidate) => candidate.name === name)
  if (!step) return
  const wasRunning = step.status === "running"
  step.status = status
  if (detail) step.detail = detail
  if (status === "running" && !wasRunning) step.startedAt = new Date().toISOString()
  if (status === "completed" || status === "failed") step.completedAt = new Date().toISOString()
}

async function ensureRepository(
  token: string,
  owner: string,
  currentUser: string,
  request: GitHubPublishRequestType,
): Promise<string> {
  const endpoint = `/repos/${encodePathSegment(owner)}/${encodePathSegment(request.repository)}`
  const exists = await fetch(`${API_ROOT}${endpoint}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ADT-Studio",
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (exists.ok) {
    const repository = await exists.json() as { default_branch?: string }
    return repository.default_branch ?? "main"
  }
  if (exists.status !== 404) throw new Error(`Unable to inspect repository (${exists.status})`)

  const createEndpoint = owner === currentUser ? "/user/repos" : `/orgs/${encodePathSegment(owner)}/repos`
  const created = await githubRequest<{ default_branch?: string }>(token, createEndpoint, {
    method: "POST",
    body: JSON.stringify({
      name: request.repository,
      description: request.description ?? "Accessible digital book published by ADT Studio",
      private: request.visibility === "private",
      auto_init: true,
      has_issues: true,
    }),
  })
  return created.data.default_branch ?? "main"
}

async function enablePages(token: string, owner: string, repository: string, branch: string): Promise<void> {
  const endpoint = `/repos/${encodePathSegment(owner)}/${encodePathSegment(repository)}/pages`
  try {
    await githubRequest(token, endpoint, {
      method: "POST",
      body: JSON.stringify({ source: { branch, path: "/" } }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/already exists|already enabled/i.test(message)) throw error
    await githubRequest(token, endpoint, {
      method: "PUT",
      body: JSON.stringify({ source: { branch, path: "/" } }),
    })
  }
}

export async function waitForPages(
  token: string,
  repositoryEndpoint: string,
): Promise<{ html_url?: string; status?: string }> {
  let last: { html_url?: string; status?: string } = {}
  for (let attempt = 0; attempt < 20; attempt += 1) {
    last = (await githubRequest<{ html_url?: string; status?: string }>(token, `${repositoryEndpoint}/pages`)).data
    if (last.status === "built") return last
    if (last.status === "errored") {
      let detail = "GitHub Pages reported a failed deployment"
      try {
        const build = (await githubRequest<{
          error?: { message?: string }
          status?: string
        }>(token, `${repositoryEndpoint}/pages/builds/latest`)).data
        if (build.error?.message?.trim()) detail = `GitHub Pages build failed: ${build.error.message.trim()}`
      } catch {
        // The Pages status remains authoritative when detailed build-log
        // permissions are unavailable.
      }
      throw new Error(detail)
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000))
  }
  return last
}

export async function publishBookToGitHub(options: {
  bookDir: string
  token: string
  request: GitHubPublishRequestType
  state: GitHubPublishStateType
  onState: PublishStateListener
  prepareBook?: () => Promise<void>
}): Promise<GitHubPublishStateType> {
  const { bookDir, token, request, state, onState, prepareBook } = options
  const adtDir = path.join(bookDir, "adt")
  let manifest: Record<string, FileManifestEntry> = {}
  try {
    updateStep(state, "connect", "running", "Checking the GitHub account")
    onState(state)
    const connection = await connectGitHub(token)
    const owner = request.owner ?? connection.login
    state.owner = owner
    const branch = await ensureRepository(token, owner, connection.login, request)
    state.branch = branch
    await synchronizeLocalGitRepository({
      bookDir,
      token,
      owner,
      repository: request.repository,
      branch,
    })
    updateStep(state, "connect", "completed", `Connected as ${connection.login}`)
    onState(state)

    updateStep(state, "detect-changes", "running", "Comparing this build with the last published version")
    onState(state)
    const detectedChanges = await detectGitWorkingTreeChanges(bookDir)
    updateStep(state, "detect-changes", "completed", `${detectedChanges.length} file changes detected`)
    onState(state)

    updateStep(state, "package-book", "running", "Rebuilding the accessible web book")
    onState(state)
    await prepareBook?.()
    manifest = buildPublishManifest(adtDir)
    if (Object.keys(manifest).length === 0) throw new Error("The book has not been packaged yet")
    state.changes = await detectGitWorkingTreeChanges(bookDir)
    state.commitMessage = request.commitMessage ?? suggestedCommitMessage(state.changes)
    updateStep(state, "package-book", "completed", `${Object.keys(manifest).length} deployable files ready`)
    onState(state)

    const repoPath = `/repos/${encodePathSegment(owner)}/${encodePathSegment(request.repository)}`

    updateStep(state, "commit", "running", state.commitMessage)
    onState(state)
    state.commitSha = await createLocalGitCommit({
      bookDir,
      branch,
      message: state.commitMessage,
      authorName: connection.name || connection.login,
      authorEmail: `${connection.login}@users.noreply.github.com`,
      changes: state.changes,
    })
    const committedChanges = new Map(
      state.changes.map((change) => [change.path, change]),
    )
    // Files can change while a package is being finalized (for example an ADT
    // edit or a VS Code save). Capture those late writes before pushing rather
    // than leaving an unexpectedly dirty book repository behind.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const residual = await detectGitWorkingTreeChanges(bookDir)
      if (residual.length === 0) break
      for (const change of residual) committedChanges.set(change.path, change)
      state.commitSha = await createLocalGitCommit({
        bookDir,
        branch,
        message: state.commitMessage,
        authorName: connection.name || connection.login,
        authorEmail: `${connection.login}@users.noreply.github.com`,
        changes: residual,
      })
      if (attempt === 2 && (await detectGitWorkingTreeChanges(bookDir)).length > 0) {
        throw new Error("Book files kept changing during commit; wait for edits to finish and deploy again")
      }
    }
    state.changes = [...committedChanges.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    )
    updateStep(state, "commit", "completed", state.commitSha.slice(0, 7))

    updateStep(state, "push", "running", "Updating the main branch")
    onState(state)
    await pushLocalGitCommit({
      bookDir,
      token,
      branch,
      onFallback: () => {
        updateStep(state, "push", "running", "The built-in transport timed out. Continuing with the system Git transport")
        onState(state)
      },
    })
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const lateChanges = await detectGitWorkingTreeChanges(bookDir)
      if (lateChanges.length === 0) break
      updateStep(state, "push", "running", `Publishing ${lateChanges.length} change(s) saved during deployment`)
      onState(state)
      for (const change of lateChanges) committedChanges.set(change.path, change)
      state.commitSha = await createLocalGitCommit({
        bookDir,
        branch,
        message: state.commitMessage,
        authorName: connection.name || connection.login,
        authorEmail: `${connection.login}@users.noreply.github.com`,
        changes: lateChanges,
      })
      state.changes = [...committedChanges.values()].sort((left, right) =>
        left.path.localeCompare(right.path),
      )
      await pushLocalGitCommit({ bookDir, token, branch })
      if (attempt === 2 && (await detectGitWorkingTreeChanges(bookDir)).length > 0) {
        throw new Error("Book files kept changing during push; wait for edits to finish and deploy again")
      }
    }
    state.repositoryUrl = `https://github.com/${owner}/${request.repository}`
    updateStep(state, "push", "completed", `${branch} is up to date`)

    updateStep(state, "enable-pages", "running", "Configuring GitHub Pages")
    onState(state)
    await enablePages(token, owner, request.repository, branch)
    state.pagesUrl = `https://${owner.toLowerCase()}.github.io/${request.repository}/`
    updateStep(state, "enable-pages", "completed", state.pagesUrl)

    updateStep(state, "verify", "running", "GitHub Pages is building the site")
    onState(state)
    const page = await waitForPages(token, repoPath)
    if (page.html_url) state.pagesUrl = page.html_url
    updateStep(state, "verify", "completed", page.status ?? "deployment queued")
    state.status = "completed"
    state.completedAt = new Date().toISOString()
    onState(state)
    writePublishVersion(bookDir, { state, manifest })
    return state
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    state.status = "failed"
    state.error = message
    const running = state.steps.find((step) => step.status === "running")
    if (running) updateStep(state, running.name, "failed", message)
    state.completedAt = new Date().toISOString()
    onState(state)
    writePublishVersion(bookDir, { state, manifest })
    return state
  }
}
