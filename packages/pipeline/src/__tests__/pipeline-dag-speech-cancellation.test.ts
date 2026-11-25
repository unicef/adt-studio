import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"

const transport = vi.hoisted(() => ({ synthesize: vi.fn() }))
// Isolate the fresh-run speech executor, preserving the real DAG, speech-file
// generation, storage, cancellation and publication. No provider is contacted.
vi.mock("../extraction-admission.js", async original => ({ ...await original<typeof import("../extraction-admission.js")>(), prepareExtractionAdmission: () => ({ outcome: "fresh" }) }))
vi.mock("../speech-inputs.js", async original => ({ ...await original<typeof import("../speech-inputs.js")>(), reconcileSpeechInputs: () => {} }))
vi.mock("../core-tts.js", async original => ({ ...await original<typeof import("../core-tts.js")>(), getReadyCoreTtsEntries: () => [{ id: "text1", text: "First" }, { id: "text2", text: "Queued" }] }))
vi.mock("../dag.js", async original => {
  const real = await original<typeof import("../dag.js")>()
  return { ...real, runPipelineDAG: (executors: Parameters<typeof real.runPipelineDAG>[0], progress: Parameters<typeof real.runPipelineDAG>[1], _stages: unknown, signal?: AbortSignal) =>
    real.runPipelineDAG(new Map([["tts", executors.get("tts")!]]), progress, ["speech"], signal) }
})
vi.mock("@adt/llm", async original => ({ ...await original<typeof import("@adt/llm")>(), createTTSSynthesizer: () => ({ synthesize: transport.synthesize }) }))
import { runFullPipeline } from "../pipeline-dag.js"
const roots: string[] = []
afterEach(() => { transport.synthesize.mockReset(); roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })) })

it("the actual CLI speech executor forwards abort, stops queued speech and retains prior audio and manifest", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dag-speech-cancel-")); roots.push(root)
  const configPath = path.join(root, "global.yaml"), pdfPath = path.join(root, "fixture.pdf")
  fs.writeFileSync(configPath, "default_model: ollama:fixture\nconcurrency: 1\nstructure_types: {}\nrole_types: {}\noutput_languages: [en]\n")
  fs.writeFileSync(pdfPath, "admission isolated")
  const storage = createBookStorage("book", root)
  storage.putNodeData("metadata", "book", { language_code: "en" })
  storage.putNodeData("tts", "en", { entries: [], generatedAt: "prior" })
  const before = storage.getAllNodeVersions("tts", "en")
  storage.close()
  const audio = path.join(root, "book/audio/en")
  fs.mkdirSync(audio, { recursive: true }); fs.writeFileSync(path.join(audio, "prior.mp3"), "retained audio")
  const abort = new AbortController()
  transport.synthesize.mockImplementation(async (input: { signal?: AbortSignal }) => {
    expect(input.signal).toBe(abort.signal)
    abort.abort()
    return new Uint8Array(Buffer.from("late audio"))
  })
  const result = await runFullPipeline({ label: "book", booksRoot: root, pdfPath, configPath, promptsDir: path.resolve("prompts"), templatesDir: path.resolve("templates"), configDir: path.resolve("config"), signal: abort.signal })
  expect(result.steps.statuses.get("tts")).toBe("failed")
  expect(transport.synthesize).toHaveBeenCalledTimes(1)
  expect(fs.readdirSync(audio)).toEqual(["prior.mp3"])
  expect(fs.readFileSync(path.join(audio, "prior.mp3"), "utf8")).toBe("retained audio")
  const reopened = createBookStorage("book", root)
  try { expect(reopened.getAllNodeVersions("tts", "en")).toEqual(before); expect(reopened.getStepRuns().find(row => row.step === "tts")?.status).toBe("error") }
  finally { reopened.close() }
})
