import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"

it("the actual CLI resolves a global model variant before a book generic and sends its include bytes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-cli-"))
  const bundled = path.join(root, "resources", "prompts"), books = path.join(root, "books"), global = path.join(books, ".adt-studio", "prompt-overrides")
  const book = path.join(books, "book", "prompts")
  for (const dir of [bundled, global, book]) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(root, "config.yaml"), "default_model: openai:gpt-4o\nrole_types: {}\nstructure_types: {}\nmetadata:\n  prompt: metadata_extraction\n  max_retries: 0\n")
  fs.writeFileSync(path.join(bundled, "metadata_extraction.liquid"), '{% chat role: "user" %}bundled{% endchat %}')
  fs.writeFileSync(path.join(book, "metadata_extraction.liquid"), '{% chat role: "user" %}book generic{% endchat %}')
  fs.writeFileSync(path.join(global, "metadata_extraction__openai_gpt_4o.liquid"), '{% chat role: "user" %}{% include "_shared" %}{% endchat %}')
  fs.writeFileSync(path.join(global, "_shared.liquid"), "CLI global variant include")
  const capture = path.join(root, "transport.json")
  const stub = path.join(root, "transport.mjs")
  // Exit at the transport boundary: no network or paid calls, and no unrelated
  // downstream generation. This exercises the actual CLI, extraction and DAG.
  fs.writeFileSync(stub, `import fs from 'node:fs'; globalThis.fetch=async (_url, init)=>{fs.writeFileSync(${JSON.stringify(capture)},String(init.body));process.exit(43)};`)
  const cli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url))
  const fixture = path.join(process.cwd(), "tests/fixtures/raven.pdf")
  try {
    const result = await new Promise<{code: number | null; error: string}>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", stub, cli, "book", fixture, "--start-page", "1", "--end-page", "1", "--books-dir", books], { cwd: root, env: { PATH: process.env.PATH, HOME: root, OPENAI_API_KEY: "test-key", PROMPTS_DIR: bundled }, timeout: 60000 })
      let error = ""
      child.stderr.on("data", (data) => { error += data })
      child.on("error", reject); child.on("exit", (code) => resolve({ code, error }))
    })
    expect(result, result.error).toMatchObject({ code: 43 })
    expect(fs.readFileSync(capture, "utf8")).toContain("CLI global variant include")
    expect(fs.readFileSync(capture, "utf8")).not.toContain("book generic")
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}, 70000)
