import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fork, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import { fileURLToPath } from "node:url"
import { afterEach, expect, it } from "vitest"
import { createBookStorage, openBookDb } from "@adt/storage"

const children: ChildProcess[] = []
const dirs: string[] = []
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit")
      child.kill("SIGKILL")
      await exited
    }
  }
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

async function start(booksDir: string, mode: string, decisionId = "") {
  const child = fork(
    fileURLToPath(new URL("./__fixtures__/page-decision-process.mjs", import.meta.url)),
    [mode, decisionId],
    {
      execArgv: ["--import", import.meta.resolve("tsx")],
      env: { ...process.env, BOOKS_DIR: booksDir, PROJECT_ROOT: process.cwd() },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  )
  children.push(child)
  let output = ""
  child.stdout?.on("data", (data) => {
    output += data
  })
  child.stderr?.on("data", (data) => {
    output += data
  })
  const message = await new Promise<{
    decision: { decisionId: string }
    status: unknown
    staleStatus: number
    workerCalls: number
  }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Child startup timed out: ${output}`)), 15000)
    child.once("message", (value) => {
      clearTimeout(timer)
      resolve(
        value as {
          decision: { decisionId: string }
          status: unknown
          staleStatus: number
          workerCalls: number
        },
      )
    })
    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once("exit", (code, signal) => {
      clearTimeout(timer)
      reject(new Error(`Child exited ${code}/${signal}: ${output}`))
    })
  })
  return { child, message }
}

it("rejects a killed process's pending decision and reports interruption while retaining committed content", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spec0013-restart-"))
  dirs.push(dir)
  const storage = createBookStorage("book", dir)
  storage.putNodeData("page", "pg001", { text: "keep source", imageId: "asset" })
  storage.putNodeData("image-filtering", "pg001", {
    images: [{ imageId: "asset", isPruned: false }],
  })
  storage.putNodeData("image-filtering", "pg001", {
    images: [{ imageId: "asset", isPruned: true }],
  })
  storage.close()
  const assetPath = path.join(dir, "book", "asset.bin")
  fs.writeFileSync(assetPath, "preserve referenced bytes")
  const snapshot = () => {
    const db = openBookDb(path.join(dir, "book", "book.db"))
    try {
      return db.all("SELECT * FROM node_data ORDER BY rowid")
    } finally {
      db.close()
    }
  }
  const before = snapshot()
  const primed = await start(dir, "prime")
  const exited = once(primed.child, "exit")
  primed.child.kill("SIGKILL")
  await exited
  const restarted = await start(dir, "recover", primed.message.decision.decisionId)
  expect(restarted.message).toMatchObject({
    staleStatus: 409,
    workerCalls: 0,
    status: {
      pendingDecisions: [],
      steps: { "image-meaningfulness": "error" },
      stepErrors: { "image-meaningfulness": "Interrupted" },
    },
  })
  expect(snapshot()).toEqual(before)
  expect(fs.readFileSync(assetPath, "utf8")).toBe("preserve referenced bytes")
}, 40000)
