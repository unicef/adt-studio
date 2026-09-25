import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { afterEach, beforeEach, expect, it } from "vitest"
import { resolvePromptFile } from "@adt/llm"
import { createPromptRoutes } from "./prompts.js"

let root: string
let bundled: string
let overrides: string
let books: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-recovery-"))
  bundled = path.join(root, "bundled")
  overrides = path.join(root, "overrides")
  books = path.join(root, "books")
  fs.mkdirSync(bundled)
  fs.mkdirSync(books)
  fs.writeFileSync(path.join(bundled, "test.liquid"), "bundled")
  fs.writeFileSync(path.join(bundled, "unrelated.liquid"), "unchanged")
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

function app() { return createPromptRoutes(bundled, books, undefined, overrides) }

async function read() {
  const response = await app().request("/prompts/test")
  expect(response.status).toBe(200)
  return response.json()
}

async function save(revision: string, content: string) {
  const response = await app().request("/prompts/test", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revision, content }),
  })
  expect(response.status).toBe(200)
  return response.json()
}

// This checks process death, not power-loss durability. Windows does not expose
// the same SIGKILL boundary, so that platform requires a separate runtime check.
it.skipIf(process.platform === "win32").each(["before", "after"])(
  "recovers the authoritative selection after SIGKILL %s pointer publication",
  async (phase) => {
    const initial = await read()
    const saved = await save(initial.revision, "old committed content")
    const dir = path.join(overrides, ".versions", "test")
    const pointer = path.join(dir, ".current")
    const previous = fs.readFileSync(pointer, "utf8")
    const moduleUrl = new URL("../../dist/routes/prompts.js", import.meta.url).href
    const code = `
      import fs from 'node:fs';
      import { createPromptRoutes } from ${JSON.stringify(moduleUrl)};
      const [bundled, books, overrides, pointer, revision, phase] = process.argv.slice(1);
      const rename = fs.renameSync.bind(fs);
      fs.renameSync = (from, to) => {
        if (String(to) === pointer) {
          if (phase === 'after') rename(from, to);
          process.kill(process.pid, 'SIGKILL');
        }
        return rename(from, to);
      };
      const response = await createPromptRoutes(bundled, books, undefined, overrides).request('/prompts/test', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({revision, content: 'crashed writer content'})
      });
      console.error('Writer unexpectedly returned', response.status);
      process.exitCode = 1;
    `
    const child = spawn(process.execPath, ["--input-type=module", "-e", code,
      bundled, books, overrides, pointer, saved.revision, phase])
    let stderr = ""
    child.stderr.on("data", (data) => { stderr += data })
    const termination = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL")
        reject(new Error("Writer did not reach the publication boundary"))
      }, 15000)
      child.once("error", (error) => { clearTimeout(timeout); reject(error) })
      child.once("close", (code, signal) => { clearTimeout(timeout); resolve({ code, signal }) })
    })
    expect(termination, stderr).toEqual({ code: null, signal: "SIGKILL" })
    const expected = phase === "before" ? "old committed content" : "crashed writer content"
    expect(resolvePromptFile([overrides, bundled], "test", null)?.content).toBe(expected)
    if (phase === "before") expect(fs.readFileSync(pointer, "utf8")).toBe(previous)
    const selection = JSON.parse(fs.readFileSync(pointer, "utf8"))
    expect(fs.readFileSync(path.join(dir, ".selections", `${selection.id}.json`), "utf8"))
      .toBe(fs.readFileSync(pointer, "utf8"))
    expect(fs.readFileSync(path.join(dir, saved.version), "utf8")).toBe("old committed content")
    expect(fs.readFileSync(path.join(bundled, "unrelated.liquid"), "utf8")).toBe("unchanged")

    const lock = path.join(overrides, ".prompt-write.lock")
    expect(JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8")).pid).toBe(child.pid)
    // The only child writer is confirmed dead. Perform the documented explicit
    // operator recovery; the application must never steal a live/aged gate.
    fs.rmSync(lock, { recursive: true })
    const recovered = await read()
    expect(recovered.content).toBe(expected)
    const retained = fs.readdirSync(dir).filter((name) => name.endsWith(".liquid"))
    expect(retained).toHaveLength(2)
    const retried = await save(recovered.revision, expected)
    expect(retried.revision).toBe(recovered.revision)
    expect(fs.readdirSync(dir).filter((name) => name.endsWith(".liquid"))).toEqual(retained)
  },
  20000,
)

it("serializes save, reset and restore competing for the same loaded revision", async () => {
  const initial = await read()
  const old = await save(initial.revision, "historical")
  const current = await save(old.revision, "current")
  const operations = [
    { url: "/prompts/test", method: "PUT", content: "competing save" },
    { url: "/prompts/test", method: "DELETE" },
    { url: `/prompts/test/versions/${old.version}/current`, method: "PUT" },
  ]
  const responses = await Promise.all(operations.map(({ url, method, ...body }) => app().request(url, {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: current.revision, ...body }),
  })))
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409, 409])
  const winner = await responses.find((response) => response.status === 200)!.json()
  const final = await read()
  expect(final.revision).toBe(winner.revision)
  expect(final.content).toBe(winner.content)
  for (const previous of [old, current]) {
    expect(fs.readFileSync(path.join(overrides, ".versions", "test", previous.version), "utf8")).toBe(previous.content)
  }
})
