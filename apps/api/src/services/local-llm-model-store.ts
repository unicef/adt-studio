import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { pipeline } from "node:stream/promises"
import {
  findLocalLlmModel,
  localLlmDownloadBytes,
  type LocalLlmFile,
  type LocalLlmModel,
} from "./local-llm-catalog.js"

export interface LocalLlmManifest {
  version: 1
  id: string
  repository: string
  revision: string
  license?: string
  modelFile: string
  mmprojFile: string
  installedAt: string
}

export interface LocalLlmInstallProgress {
  status: "checking" | "downloading" | "verifying" | "complete"
  file?: string
  total: number
  completed: number
}

export function localLlmModelDirectory(modelsDir: string, model: LocalLlmModel): string {
  return path.join(modelsDir, model.alias)
}

export function readLocalLlmManifest(modelsDir: string, idOrAlias: string): LocalLlmManifest {
  const model = findLocalLlmModel(idOrAlias)
  if (!model) throw new Error(`Unsupported local model: ${idOrAlias}`)
  const manifestPath = path.join(localLlmModelDirectory(modelsDir, model), "manifest.json")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as LocalLlmManifest
  if (manifest.version !== 1 || manifest.id !== model.id || manifest.revision !== model.revision) {
    throw new Error(`Local model manifest is incompatible: ${model.id}`)
  }
  return manifest
}

export function isLocalLlmModelInstalled(modelsDir: string, model: LocalLlmModel): boolean {
  try {
    const manifest = readLocalLlmManifest(modelsDir, model.id)
    const directory = localLlmModelDirectory(modelsDir, model)
    return fs.statSync(path.join(directory, manifest.modelFile)).size === model.model.bytes
      && fs.statSync(path.join(directory, manifest.mmprojFile)).size === model.mmproj.bytes
  } catch {
    return false
  }
}

export function removeLocalLlmModel(modelsDir: string, idOrAlias: string): void {
  const model = findLocalLlmModel(idOrAlias)
  if (!model || !isLocalLlmModelInstalled(modelsDir, model)) {
    throw new Error(`Local model is not installed: ${idOrAlias}`)
  }
  fs.rmSync(localLlmModelDirectory(modelsDir, model), { recursive: true, force: true })
}

async function hashExistingFile(filePath: string, hash: crypto.Hash): Promise<number> {
  if (!fs.existsSync(filePath)) return 0
  const size = fs.statSync(filePath).size
  await pipeline(fs.createReadStream(filePath), hash, { end: false })
  return size
}

async function verifiedExistingFile(filePath: string, file: LocalLlmFile): Promise<boolean> {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size !== file.bytes) return false
  const hash = crypto.createHash("sha256")
  await pipeline(fs.createReadStream(filePath), hash, { end: false })
  return hash.digest("hex") === file.sha256
}

async function downloadVerifiedFile(args: {
  model: LocalLlmModel
  file: LocalLlmFile
  destination: string
  baseCompleted: number
  total: number
  fetchImpl: typeof fetch
  signal: AbortSignal
  onProgress: (progress: LocalLlmInstallProgress) => void
}): Promise<void> {
  const partPath = `${args.destination}.part`
  fs.mkdirSync(path.dirname(partPath), { recursive: true })
  if (await verifiedExistingFile(args.destination, args.file)) {
    args.onProgress({
      status: "verifying",
      file: args.file.name,
      total: args.total,
      completed: args.baseCompleted + args.file.bytes,
    })
    return
  }
  fs.rmSync(args.destination, { force: true })
  if (fs.existsSync(partPath) && fs.statSync(partPath).size > args.file.bytes) {
    fs.rmSync(partPath, { force: true })
  }

  const hash = crypto.createHash("sha256")
  let downloaded = await hashExistingFile(partPath, hash)
  let lastProgressBytes = downloaded
  let lastProgressAt = 0
  const source = `https://huggingface.co/${args.model.repository}/resolve/${args.model.revision}/${args.file.name}`

  if (downloaded < args.file.bytes) {
    const headers = downloaded > 0 ? { Range: `bytes=${downloaded}-` } : undefined
    const response = await args.fetchImpl(source, {
      headers,
      redirect: "follow",
      signal: args.signal,
    })
    if (downloaded > 0 && response.status !== 206) {
      await response.body?.cancel()
      fs.rmSync(partPath, { force: true })
      return downloadVerifiedFile({ ...args })
    }
    if (!response.ok || !response.body) {
      throw new Error(`Hugging Face download failed for ${args.file.name}: HTTP ${response.status}`)
    }

    const output = fs.createWriteStream(partPath, { flags: downloaded > 0 ? "a" : "wx" })
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        downloaded += chunk.byteLength
        if (downloaded > args.file.bytes) throw new Error(`Size mismatch for ${args.file.name}`)
        hash.update(chunk)
        if (!output.write(chunk)) await new Promise<void>((resolve) => output.once("drain", resolve))
        const now = Date.now()
        if (downloaded - lastProgressBytes >= 8 * 1024 ** 2 || now - lastProgressAt >= 250) {
          args.onProgress({
            status: "downloading",
            file: args.file.name,
            total: args.total,
            completed: args.baseCompleted + downloaded,
          })
          lastProgressBytes = downloaded
          lastProgressAt = now
        }
      }
      await new Promise<void>((resolve, reject) => output.end((error?: Error | null) => error ? reject(error) : resolve()))
    } catch (error) {
      output.destroy()
      throw error
    }
  }

  args.onProgress({
    status: "verifying",
    file: args.file.name,
    total: args.total,
    completed: args.baseCompleted + downloaded,
  })
  if (downloaded !== args.file.bytes || hash.digest("hex") !== args.file.sha256) {
    fs.rmSync(partPath, { force: true })
    throw new Error(`Integrity check failed for ${args.file.name}; retry the download`)
  }
  fs.renameSync(partPath, args.destination)
}

export async function installLocalLlmModel(args: {
  modelsDir: string
  id: string
  fetchImpl?: typeof fetch
  signal: AbortSignal
  onProgress: (progress: LocalLlmInstallProgress) => void
}): Promise<LocalLlmManifest> {
  const model = findLocalLlmModel(args.id)
  if (!model) throw new Error(`Unsupported local model: ${args.id}`)
  if (isLocalLlmModelInstalled(args.modelsDir, model)) return readLocalLlmManifest(args.modelsDir, model.id)

  fs.mkdirSync(args.modelsDir, { recursive: true })
  const total = localLlmDownloadBytes(model)
  const staging = path.join(args.modelsDir, ".downloads", model.alias)
  fs.mkdirSync(staging, { recursive: true })
  const partialBytes = [model.model.name, model.mmproj.name].reduce((sum, name) => {
    for (const candidate of [path.join(staging, name), path.join(staging, `${name}.part`)]) {
      if (fs.existsSync(candidate)) return sum + fs.statSync(candidate).size
    }
    return sum
  }, 0)
  const disk = fs.statfsSync(args.modelsDir)
  const free = disk.bavail * disk.bsize
  const required = Math.max(0, total - partialBytes) + 1024 ** 3
  if (free < required) {
    throw new Error(`Not enough disk space. Free at least ${Math.ceil((required - free) / 1024 ** 3)} GB and retry.`)
  }

  args.onProgress({ status: "checking", total, completed: 0 })
  await downloadVerifiedFile({
    model,
    file: model.model,
    destination: path.join(staging, model.model.name),
    baseCompleted: 0,
    total,
    fetchImpl: args.fetchImpl ?? fetch,
    signal: args.signal,
    onProgress: args.onProgress,
  })
  await downloadVerifiedFile({
    model,
    file: model.mmproj,
    destination: path.join(staging, model.mmproj.name),
    baseCompleted: model.model.bytes,
    total,
    fetchImpl: args.fetchImpl ?? fetch,
    signal: args.signal,
    onProgress: args.onProgress,
  })

  // Successful downloads may leave resumable parts or downloader metadata in
  // staging (for example after switching download transports). Do not retain
  // them in the installed model directory.
  for (const file of [model.model, model.mmproj]) {
    fs.rmSync(path.join(staging, `${file.name}.part`), { force: true })
  }
  fs.rmSync(path.join(staging, ".cache"), { recursive: true, force: true })

  const manifest: LocalLlmManifest = {
    version: 1,
    id: model.id,
    repository: model.repository,
    revision: model.revision,
    license: model.license,
    modelFile: model.model.name,
    mmprojFile: model.mmproj.name,
    installedAt: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  const destination = localLlmModelDirectory(args.modelsDir, model)
  fs.rmSync(destination, { recursive: true, force: true })
  fs.renameSync(staging, destination)
  args.onProgress({ status: "complete", total, completed: total })
  return manifest
}
