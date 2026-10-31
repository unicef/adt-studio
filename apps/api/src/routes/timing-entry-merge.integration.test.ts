import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"
import { createBookStorage, openBookDb } from "@adt/storage"
import type { TTSOutput, WordTimestampOutput, WordTimestampReadEntry } from "@adt/types"
import { beginSpeechRun, endSpeechRun } from "../services/speech-progress.js"
import { createTTSRoutes } from "./tts.js"

const roots: string[] = []
afterEach(() => { endSpeechRun("book"); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

function fixture(namespace = "en", legacy = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-timing-entry-"))
  roots.push(root)
  const label = "book"
  const language = namespace.replace("_", "-")
  const config = path.join(root, "config.yaml")
  fs.writeFileSync(config, `editing_language: ${language}\noutput_languages: [${language}]\nrole_types:\n  section_text: Main body text\nstructure_types:\n  paragraph: Paragraph\n`)
  const storage = createBookStorage(label, root)
  const ids = ["pg001_t001", "pg001_t002"]
  storage.putNodeData("metadata", "book", { title: "Timing regression", language_code: language, reasoning: "fixture" })
  storage.putNodeData("text-catalog", "book", { entries: ids.map(id => ({ id, text: id, pageId: "pg001", sectionId: "pg001_sec001" })), generatedAt: "fixture" })
  storage.putNodeData("core-tts-catalog", namespace, { language, entries: ids.map(id => ({ id, displayText: id, speechText: id, changed: false, transformations: [], status: "ready", generation: { mode: "unchanged", generatedAt: "fixture", enabledTransformations: [], sourceTextHash: "source", contextHash: "context" } })), generatedAt: "fixture" })
  const audio = ids.flatMap(textId => (["primary", "secondary"] as const).map(voiceSlot => {
    const bytes = Buffer.from(`${textId} ${voiceSlot} recording`)
    const fileName = `${textId}-${voiceSlot}.mp3`
    const dir = path.join(root, label, "audio", namespace)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, fileName), bytes)
    return { textId, language, fileName, voiceSlot, voice: voiceSlot, model: "model", cached: false,
      ...(legacy ? {} : { audioHash: createHash("sha256").update(bytes).digest("hex") }) }
  }))
  storage.putNodeData("tts", namespace, { entries: audio, generatedAt: "fixture" })
  storage.putNodeData("tts-timestamps", namespace, { retainedCollectionMetadata: { origin: "Historical import" }, entries: Object.fromEntries(audio.map(entry => [entry.textId + (entry.voiceSlot === "secondary" ? "--secondary" : ""), {
    textId: entry.textId, language, voiceSlot: entry.voiceSlot, audioHash: entry.audioHash,
    source: "manual", words: [{ word: entry.textId, start: 0, end: 1 }], duration: 1,
    retainedMetadata: { correction: "Keep this unknown historical field" },
  }])), generatedAt: "fixture" })
  storage.close()
  const app = createTTSRoutes(root, config)
  const inspect = <T>(fn: (storage: ReturnType<typeof createBookStorage>) => T): T => {
    const book = createBookStorage(label, root)
    try { return fn(book) } finally { book.close() }
  }
  const read = async () => {
    const response = await app.request(`/books/${label}/tts/timestamps/${language}`)
    expect(response.status).toBe(200)
    return await response.json() as { entries: Record<string, WordTimestampReadEntry>; version: number }
  }
  const save = (entry: WordTimestampReadEntry, start: number, overrides = {}) => app.request(`/books/${label}/tts/timestamps/${language}/${entry.textId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      baseVersion: entry.version, audioIdentity: entry.audioIdentity, voiceSlot: entry.voiceSlot,
      words: [{ word: entry.textId, start, end: 1 }], duration: 1, ...overrides,
    }),
  })
  return { root, label, language, namespace, audio, app, inspect, read, save }
}

describe("independent timing drafts in one collection", () => {
  it.each([["en", false], ["en", true], ["pt_BR", true]] as const)("merges separate drafts and preserves recordings/history (%s, legacy=%s)", async (namespace, legacy) => {
    const f = fixture(namespace, legacy)
    const before = f.inspect(s => s.getAllNodeVersions("tts-timestamps", namespace))
    const { entries } = await f.read()
    const responses = await Promise.all([f.save(entries.pg001_t001, .2), f.save(entries.pg001_t002, .3)])
    expect(responses.map(r => r.status)).toEqual([200, 200])
    const after = await f.read()
    expect(after).toMatchObject({ retainedCollectionMetadata: { origin: "Historical import" } })
    expect(after.entries.pg001_t001.words[0].start).toBe(.2)
    expect(after.entries.pg001_t002.words[0].start).toBe(.3)
    for (const entry of Object.values(after.entries)) expect(entry).toMatchObject({ retainedMetadata: { correction: "Keep this unknown historical field" } })
    expect(after.entries["pg001_t001--secondary"].words[0].start).toBe(0)
    expect(after.entries["pg001_t002--secondary"].words[0].start).toBe(0)
    expect(f.inspect(s => s.getAllNodeVersions("tts-timestamps", namespace).find(row => row.version === 1))).toEqual(before.find(row => row.version === 1))
    for (const entry of f.audio) expect(fs.readFileSync(path.join(f.root, f.label, "audio", namespace, entry.fileName), "utf8")).toBe(`${entry.textId} ${entry.voiceSlot} recording`)
  })

  it("merges simultaneous primary and secondary drafts without crossing voices", async () => {
    const f = fixture("pt_BR", true)
    const { entries } = await f.read()
    const responses = await Promise.all([f.save(entries.pg001_t001, .2), f.save(entries["pg001_t001--secondary"], .4)])
    expect(responses.map(r => r.status)).toEqual([200, 200])
    const after = await f.read()
    expect(after).toMatchObject({ retainedCollectionMetadata: { origin: "Historical import" } })
    expect(after.entries.pg001_t001.words[0].start).toBe(.2)
    expect(after.entries["pg001_t001--secondary"].words[0].start).toBe(.4)
  })

  it.each(["target", "metadata", "voice", "alias", "snapshot-link", "snapshot-pair", "namespace"])("rejects a stale legacy draft after snapshot evidence changes (%s)", async change => {
    const f = fixture("pt_BR", true)
    const { entries } = await f.read()
    expect((await f.save(entries.pg001_t001, .2)).status).toBe(200)
    f.inspect(s => {
      const timing = s.getLatestNodeData("tts-timestamps", "pt_BR")!.data as WordTimestampOutput
      const audio = s.getLatestNodeData("tts", "pt_BR")!.data as TTSOutput
      if (change === "target") timing.entries.pg001_t002.words[0].start = .5
      if (change === "metadata") Object.assign(timing.entries.pg001_t002, { retainedMetadata: { correction: "Changed since opening" } })
      if (change === "alias") timing.entries.pg001_t002.legacyAudioFileName = "another-recording.mp3"
      if (change === "voice") audio.entries.find(entry => entry.textId === "pg001_t002")!.voice = "Changed voice"
      if (change === "snapshot-link" || change === "snapshot-pair") {
        // Simulate a damaged/imported snapshot record; no filename alias alone
        // can authorize rebasing the original receipt.
        const row = s.getAllNodeVersions("tts", "pt_BR").find(row => (row.data as TTSOutput).legacySnapshotOf)!
        const damaged = row.data as TTSOutput
        if (change === "snapshot-link") damaged.legacySnapshotOf = 999
        else damaged.timingVersion = 999
        const db = openBookDb(path.join(f.root, f.label, `${f.label}.db`))
        db.run("UPDATE node_data SET data = ? WHERE node = ? AND item_id = ? AND version = ?", [JSON.stringify(damaged), "tts", "pt_BR", row.version])
        db.close()
      }
      s.putNodeData("tts-timestamps", "pt_BR", timing)
      s.putNodeData("tts", change === "namespace" ? "pt-BR" : "pt_BR", audio)
    })
    const before = f.inspect(s => [s.getAllNodeVersions("tts", "pt_BR"), s.getAllNodeVersions("tts-timestamps", "pt_BR")])
    expect((await f.save(entries.pg001_t002, .3)).status).toBe(409)
    expect(f.inspect(s => [s.getAllNodeVersions("tts", "pt_BR"), s.getAllNodeVersions("tts-timestamps", "pt_BR")])).toEqual(before)
  })

  it("does not let an old hash-only client cross equal-version locale chains", async () => {
    const f = fixture("pt_BR")
    const { entries } = await f.read()
    f.inspect(s => {
      s.putNodeData("tts", "pt-BR", s.getLatestNodeData("tts", "pt_BR")!.data)
      const changed = s.getLatestNodeData("tts-timestamps", "pt_BR")!.data as WordTimestampOutput
      changed.entries.pg001_t001.words[0].start = .7
      s.putNodeData("tts-timestamps", "pt-BR", changed)
    })
    fs.cpSync(path.join(f.root, f.label, "audio", "pt_BR"), path.join(f.root, f.label, "audio", "pt-BR"), { recursive: true })
    const before = f.inspect(s => s.getAllNodeVersions("tts-timestamps", "pt-BR"))
    expect((await f.save(entries.pg001_t001, .3, { audioIdentity: undefined, audioHash: f.audio[0].audioHash })).status).toBe(409)
    expect(f.inspect(s => s.getAllNodeVersions("tts-timestamps", "pt-BR"))).toEqual(before)
    const current = await f.read()
    expect((await f.save(current.entries.pg001_t001, .4)).status).toBe(200)
  })

  it.each(["target", "metadata", "audio", "future", "missing-history", "alias", "failure"])("rejects changed or unprovable target without altering the collection (%s)", async change => {
    const f = fixture()
    const { entries } = await f.read()
    f.inspect(s => {
      const row = s.getLatestNodeData("tts-timestamps", "en")!
      const data = row.data as WordTimestampOutput
      if (change === "target") data.entries.pg001_t002.words[0].start = .5
      if (change === "metadata") Object.assign(data.entries.pg001_t002, { retainedMetadata: { correction: "New correction" } })
      if (change === "alias") data.entries.alias = { ...data.entries.pg001_t002 }
      if (change === "failure") data.failed = [{ textId: "pg001_t002", error: "New failure" }]
      if (change === "audio") {
        const output = s.getLatestNodeData("tts", "en")!.data as TTSOutput
        output.entries.find(entry => entry.textId === "pg001_t002")!.voice = "changed"
        s.putNodeData("tts", "en", output)
      }
      s.putNodeData("tts-timestamps", "en", data)
    })
    const before = f.inspect(s => s.getAllNodeVersions("tts-timestamps", "en"))
    const overrides = change === "future" ? { baseVersion: 999 } : change === "missing-history" ? { baseVersion: 0 } : {}
    expect((await f.save(entries.pg001_t002, .3, overrides)).status).toBe(409)
    expect(f.inspect(s => s.getAllNodeVersions("tts-timestamps", "en"))).toEqual(before)
  })
})

describe("legacy speech language read model", () => {
  it("uses normalized selection and the physical namespace without rewriting", async () => {
    const f = fixture("pt_BR", true)
    const before = f.inspect(s => [s.getAllNodeVersions("tts", "pt_BR"), s.getAllNodeVersions("tts-timestamps", "pt_BR")])
    const response = await f.app.request(`/books/${f.label}/tts`)
    const data = await response.json()
    expect(Object.keys(data.languages)).toEqual(["pt-BR"])
    expect(data.languages["pt-BR"]).toMatchObject({ storageLanguage: "pt_BR" })
    expect(data.languages["pt-BR"].entries).toHaveLength(4)
    const entry = data.languages["pt-BR"].entries[0]
    expect((await f.app.request(`/books/${f.label}/audio/${data.languages["pt-BR"].storageLanguage}/${entry.fileName}`)).status).toBe(200)
    expect(f.inspect(s => [s.getAllNodeVersions("tts", "pt_BR"), s.getAllNodeVersions("tts-timestamps", "pt_BR")])).toEqual(before)
  })

  it.each([false, true])("normalizes live snapshots and honors canonical precedence (both=%s)", async canonical => {
    const f = fixture("pt_BR", true)
    beginSpeechRun("book", new Map([
      ["pt_BR", f.audio], ...(canonical ? [["pt-BR", []] as [string, typeof f.audio]] : []),
    ]), new Map())
    const data = await (await f.app.request(`/books/${f.label}/tts`)).json()
    expect(data.live).toBe(true)
    expect(Object.keys(data.languages)).toEqual(["pt-BR"])
    expect(data.languages["pt-BR"].storageLanguage).toBe(canonical ? "pt-BR" : "pt_BR")
    expect(data.languages["pt-BR"].entries).toHaveLength(canonical ? 0 : 4)
  })

  it.each(["valid", "empty", "malformed", "invalidated"])("canonical storage is authoritative when legacy data also exists (%s)", async state => {
    const f = fixture("pt_BR", true)
    f.inspect(s => {
      const data = s.getLatestNodeData("tts", "pt_BR")!.data as TTSOutput
      s.putNodeData("tts", "pt-BR", state === "malformed" ? { invalid: true } : { ...data, entries: state === "empty" ? [] : data.entries.map(entry => ({ ...entry, voice: "Canonical voice" })) })
    })
    if (state === "invalidated") {
      const db = openBookDb(path.join(f.root, f.label, `${f.label}.db`))
      db.run("UPDATE node_data SET data = NULL WHERE node = ? AND item_id = ?", ["tts", "pt-BR"])
      db.close()
    }
    const before = f.inspect(s => s.getAllNodeVersions("tts", "pt_BR"))
    const data = await (await f.app.request(`/books/${f.label}/tts`)).json()
    expect(data.languages.pt_BR).toBeUndefined()
    if (state === "malformed" || state === "invalidated") {
      expect(data.languages["pt-BR"]).toBeUndefined()
      expect((await f.read()).entries).toEqual({})
      expect((await f.save({ textId: "pg001_t001", version: 0, audioHash: "invented" } as WordTimestampReadEntry, .2, { audioHash: "invented" })).status).toBe(409)
      expect(f.inspect(s => s.getAllNodeVersions("tts", "pt_BR"))).toEqual(before)
    }
    else {
      expect(data.languages["pt-BR"].storageLanguage).toBe("pt-BR")
      expect(data.languages["pt-BR"].entries).toHaveLength(state === "empty" ? 0 : 4)
      if (state === "valid") expect(data.languages["pt-BR"].entries[0].voice).toBe("Canonical voice")
    }
  })
})
