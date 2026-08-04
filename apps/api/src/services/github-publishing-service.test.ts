import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import git from "isomorphic-git"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildPublishManifest,
  assertRemoteNotAdvanced,
  connectGitHub,
  detectGitWorkingTreeChanges,
  diffPublishManifests,
  getPublishedFileDiff,
  readLatestPublishVersion,
  readPublishVersions,
  resolveRepositoryPath,
  speechEntityIdsFromDiff,
  waitForPages,
  writePublishVersion,
} from "./github-publishing-service.js"

describe("github publishing state", () => {
  let bookDir: string

  beforeEach(() => {
    bookDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-github-publishing-"))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    fs.rmSync(bookDir, { recursive: true, force: true })
  })

  it("retries transient GitHub network failures before connecting", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed", { cause: new Error("socket closed") }))
      .mockRejectedValueOnce(new TypeError("fetch failed", { cause: new Error("ETIMEDOUT") }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        login: "adt-expert",
        name: "ADT Expert",
        avatar_url: "https://example.test/avatar.png",
      }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const connectionPromise = connectGitHub("test-token")
    await vi.runAllTimersAsync()

    await expect(connectionPromise).resolves.toEqual({
      login: "adt-expert",
      name: "ADT Expert",
      avatarUrl: "https://example.test/avatar.png",
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("retries five times before reporting a persistent GitHub connectivity failure", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockRejectedValue(
      new TypeError("fetch failed", { cause: new Error("ETIMEDOUT") }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const connectionPromise = connectGitHub("test-token")
    const rejection = expect(connectionPromise).rejects.toThrow("after 5 attempts")
    await vi.runAllTimersAsync()

    await rejection
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it("reports GitHub Pages build diagnostics when deployment fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "errored" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: "errored",
        error: { message: "Jekyll could not render page 12" },
      }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(waitForPages("test-token", "/repos/adt/book")).rejects.toThrow(
      "GitHub Pages build failed: Jekyll could not render page 12",
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("detects added, modified, and deleted deployment files", () => {
    const adtDir = path.join(bookDir, "adt")
    fs.mkdirSync(adtDir)
    fs.writeFileSync(path.join(adtDir, "index.html"), "first")
    fs.writeFileSync(path.join(adtDir, "old.txt"), "remove me")
    const previous = buildPublishManifest(adtDir)

    fs.writeFileSync(path.join(adtDir, "index.html"), "second")
    fs.rmSync(path.join(adtDir, "old.txt"))
    fs.writeFileSync(path.join(adtDir, "new.txt"), "new")
    const current = buildPublishManifest(adtDir)

    expect(diffPublishManifests(previous, current)).toEqual([
      { path: "index.html", status: "modified" },
      { path: "new.txt", status: "added" },
      { path: "old.txt", status: "deleted" },
    ])
  })

  it("rejects repository paths that escape the pull directory", () => {
    expect(resolveRepositoryPath(path.join(bookDir, "pull"), "pages/index.html")).toBe(
      path.join(bookDir, "pull", "pages", "index.html"),
    )
    expect(() => resolveRepositoryPath(path.join(bookDir, "pull"), "../outside.txt")).toThrow(
      "Unsafe repository path",
    )
    expect(() => resolveRepositoryPath(path.join(bookDir, "pull"), "/tmp/outside.txt")).toThrow(
      "Unsafe repository path",
    )
  })

  it("blocks a deployment when collaborators advanced the remote branch", () => {
    expect(() => assertRemoteNotAdvanced({
      id: "previous",
      status: "completed",
      owner: "adt-expert",
      repository: "science-book",
      branch: "main",
      commitSha: "local-sha",
      changes: [],
      steps: [],
      startedAt: "2026-08-04T00:00:00.000Z",
    }, {
      owner: "adt-expert",
      repository: "science-book",
      commitSha: "collaborator-sha",
    })).toThrow("Synchronize or resolve")
  })

  it("finds changed speech entities in Git HTML and JSON diffs", () => {
    expect(speechEntityIdsFromDiff({
      path: "pg001.html",
      status: "modified",
      binary: false,
      truncated: false,
      lines: [
        { type: "deleted", oldLine: 1, content: '<span data-id="pg001_n0002">English</span>' },
        { type: "added", newLine: 1, content: '<span data-id="pg001_n0002">You</span>' },
        { type: "context", oldLine: 2, newLine: 2, content: '<span data-id="pg001_n0003">Unchanged</span>' },
      ],
    })).toEqual(["pg001_n0002"])

    expect(speechEntityIdsFromDiff({
      path: "assets/text.json",
      status: "modified",
      binary: false,
      truncated: false,
      lines: [
        { type: "added", newLine: 4, content: '"pg002_t0004": "Updated phrase"' },
      ],
    })).toEqual(["pg002_t0004"])

    expect(speechEntityIdsFromDiff({
      path: "assets/image.png",
      status: "modified",
      binary: true,
      truncated: false,
      lines: [],
    })).toEqual([])
  })

  it("uses Git working-tree semantics for an unpublished book", async () => {
    const adtDir = path.join(bookDir, "adt")
    fs.mkdirSync(adtDir)
    fs.writeFileSync(path.join(adtDir, "index.html"), "book")
    fs.writeFileSync(path.join(adtDir, ".build-hash"), "ignored")

    await expect(detectGitWorkingTreeChanges(bookDir)).resolves.toEqual([
      { path: "index.html", status: "added" },
    ])
  })

  it("reports local file edits against the last published Git commit", async () => {
    const adtDir = path.join(bookDir, "adt")
    const gitdir = path.join(bookDir, "publishing", "github", "repository.git")
    fs.mkdirSync(adtDir, { recursive: true })
    await git.init({ fs, dir: adtDir, gitdir, defaultBranch: "main" })
    fs.writeFileSync(path.join(adtDir, "page.html"), "before")
    await git.add({ fs, dir: adtDir, gitdir, filepath: "page.html" })
    await git.commit({
      fs,
      dir: adtDir,
      gitdir,
      message: "publish",
      author: { name: "ADT", email: "adt@example.test" },
    })

    fs.writeFileSync(path.join(adtDir, "page.html"), "after")
    fs.writeFileSync(path.join(adtDir, "new-audio.mp3"), "audio")

    await expect(detectGitWorkingTreeChanges(bookDir)).resolves.toEqual([
      { path: "new-audio.mp3", status: "added" },
      { path: "page.html", status: "modified" },
    ])
  })

  it("stores immutable publishing versions and reads the newest one", () => {
    const baseState = {
      status: "completed" as const,
      repository: "science-book",
      branch: "main",
      changes: [],
      steps: [],
      startedAt: "2026-08-02T00:00:00.000Z",
    }
    writePublishVersion(bookDir, {
      state: { ...baseState, id: "first", commitSha: "111" },
      manifest: { "index.html": { sha256: "a", size: 1 } },
    })
    writePublishVersion(bookDir, {
      state: { ...baseState, id: "second", commitSha: "222" },
      manifest: { "index.html": { sha256: "b", size: 1 } },
    })

    expect(readLatestPublishVersion(bookDir)?.state.commitSha).toBe("222")
    expect(readPublishVersions(bookDir).map((record) => record.state.id)).toEqual(["second", "first"])
    expect(fs.readdirSync(path.join(bookDir, "publishing", "github", "versions"))).toHaveLength(2)
  })

  it("reads a deployed file diff from the deployment's exact Git commit", async () => {
    const adtDir = path.join(bookDir, "adt")
    const gitdir = path.join(bookDir, "publishing", "github", "repository.git")
    fs.mkdirSync(adtDir, { recursive: true })
    await git.init({ fs, dir: adtDir, gitdir, defaultBranch: "main" })
    fs.writeFileSync(path.join(adtDir, "index.html"), "before\n")
    await git.add({ fs, dir: adtDir, gitdir, filepath: "index.html" })
    await git.commit({ fs, dir: adtDir, gitdir, message: "first", author: { name: "ADT", email: "adt@example.test" } })
    fs.writeFileSync(path.join(adtDir, "index.html"), "after\n")
    await git.add({ fs, dir: adtDir, gitdir, filepath: "index.html" })
    const commitSha = await git.commit({ fs, dir: adtDir, gitdir, message: "second", author: { name: "ADT", email: "adt@example.test" } })
    writePublishVersion(bookDir, {
      state: {
        id: "deployment-1",
        status: "completed",
        repository: "science-book",
        branch: "main",
        commitSha,
        changes: [{ path: "index.html", status: "modified" }],
        steps: [],
        startedAt: "2026-08-02T00:00:00.000Z",
      },
      manifest: {},
    })

    await expect(getPublishedFileDiff(bookDir, "deployment-1", "index.html")).resolves.toMatchObject({
      path: "index.html",
      status: "modified",
      binary: false,
      lines: [
        { type: "added", newLine: 1, content: "after" },
        { type: "deleted", oldLine: 1, content: "before" },
        { type: "context", oldLine: 2, newLine: 2, content: "" },
      ],
    })
  })
})
