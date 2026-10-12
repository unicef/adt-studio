import fs from "node:fs"
import path from "node:path"
import type { Storage, CroppedImageInput, SegmentedImageInput } from "@adt/storage"

/** Stage writes through the existing Storage contract, then publish in one real
 * transaction. Provider calls never hold a SQLite transaction. Uncommitted
 * images are readable by later passes but never replace active image rows.
 * Historical/versioned filenames are allocated from the complete history.
 */
export function createGenerationPublication(base: Storage, validate: () => void) {
  const nodes: Array<{ node: string; itemId: string; version: number; data: unknown }> = []
  const written = new Set<string>()
  const recovered: Parameters<Storage["appendLlmLog"]>[0][] = []
  const images = new Map<string, { input: CroppedImageInput | SegmentedImageInput; segment: boolean }>()
  const assignments = new Map<string, string | null>()
  const clearedSteps = new Set<string>()
  const completedSteps = new Map<string, { skipped: boolean; message?: string }>()
  const imageId = (input: CroppedImageInput | SegmentedImageInput) => "sourceImageId" in input
    ? `${input.sourceImageId}_seg${String(input.segmentIndex).padStart(3, "0")}_v${input.version}`
    : `${input.imageId}_crop_v${input.version}`
  const pendingImage = (id: string) => images.get(id)?.input
  const storage: Storage = {
    ...base,
    close() {},
    appendLlmLog(entry) {
      if (entry.pageRecovery && entry.success) recovered.push(entry)
      else base.appendLlmLog(entry)
    },
    transaction(operation) {
      const count = nodes.length, recoveredCount = recovered.length, priorImages = new Map(images), priorAssignments = new Map(assignments), priorSteps = new Set(clearedSteps), priorCompleted = new Map(completedSteps)
      try { return operation() } catch (error) {
        nodes.splice(count); recovered.splice(recoveredCount); images.clear(); assignments.clear(); clearedSteps.clear(); completedSteps.clear()
        priorImages.forEach((v, k) => images.set(k, v)); priorAssignments.forEach((v, k) => assignments.set(k, v)); priorSteps.forEach((v) => clearedSteps.add(v)); priorCompleted.forEach((v, k) => completedSteps.set(k, v))
        throw error
      }
    },
    putNodeData(node, itemId, data) {
      const version = Math.max(0, ...storage.getAllNodeVersions(node, itemId).map((row) => row.version)) + 1
      nodes.push({ node, itemId, version, data: structuredClone(data) })
      return version
    },
    getLatestNodeData(node, itemId) {
      const row = [...nodes].reverse().find((entry) => entry.node === node && entry.itemId === itemId)
      return row ? row.data == null ? null : { version: row.version, data: structuredClone(row.data) } : base.getLatestNodeData(node, itemId)
    },
    getAllNodeVersions(node, itemId) { return [...base.getAllNodeVersions(node, itemId), ...nodes.filter((row) => row.node === node && row.itemId === itemId).map(({ version, data }) => ({ version, data: structuredClone(data) }))] },
    getNodeItemIds(node) { return [...new Set([...base.getNodeItemIds(node), ...nodes.filter((row) => row.node === node).map((row) => row.itemId)])].sort() },
    putCroppedImage(input) { images.set(imageId(input), { input: { ...input, buffer: Buffer.from(input.buffer) }, segment: false }) },
    putSegmentedImage(input) { images.set(imageId(input), { input: { ...input, buffer: Buffer.from(input.buffer) }, segment: true }) },
    getImageBase64(id) { return pendingImage(id)?.buffer.toString("base64") ?? base.getImageBase64(id) },
    getImageDimensions(id) { const image = pendingImage(id); return image ? { width: image.width, height: image.height } : base.getImageDimensions(id) },
    getImageMeta(id) { const image = pendingImage(id); return image ? { pageId: image.pageId, relativePath: `images/${id}.png` } : base.getImageMeta(id) },
    getPageImages(pageId) {
      return [...base.getPageImages(pageId).filter((image) => !images.has(image.imageId)), ...[...images].filter(([, { input }]) => input.pageId === pageId).map(([id, { input }]) => ({ imageId: id, width: input.width, height: input.height, ...("bounds" in input ? { bounds: input.bounds } : {}) }))]
    },
    assignSignLanguageVideo(id, sectionId) { assignments.set(id, sectionId) },
    getSignLanguageVideos() { return base.getSignLanguageVideos().map((video) => assignments.has(video.videoId) ? { ...video, sectionId: assignments.get(video.videoId)! } : video) },
    markStepCompleted(step, message) { completedSteps.set(step, { skipped: false, message }) },
    markStepSkipped(step) { completedSteps.set(step, { skipped: true }) },
    clearStepRuns(steps) { steps.forEach((step) => clearedSteps.add(step)) },
    clearNodesByType() { throw new Error("Generation publication cannot clear retained content") },
    clearExtractedData() { throw new Error("Generation publication cannot clear extraction") },
  }
  return { storage, discardPage(pageId: string) {
    for (let index = recovered.length - 1; index >= 0; index--) if (recovered[index].pageId === pageId) recovered.splice(index, 1)
    for (let index = nodes.length - 1; index >= 0; index--) if (nodes[index].itemId === pageId) nodes.splice(index, 1)
    for (const [id, { input }] of images) if (input.pageId === pageId) images.delete(id)
  }, hasWritten: (node: string, itemId: string) => written.has(JSON.stringify([node, itemId])) || nodes.some((row) => row.node === node && row.itemId === itemId), publish(itemIds?: ReadonlySet<string>) {
    const included = (id: string) => !itemIds || itemIds.has(id)
    const selectedNodes = nodes.filter((row) => included(row.itemId))
    validate()
    base.transaction(() => {
      validate()
      for (const { input, segment } of images.values()) {
        if (!included(input.pageId)) continue
        // Refuse collisions, including an orphan left by a prior failed commit.
        // Equal bytes are safe to reuse; differing bytes never overwrite history.
        const id = imageId(input)
        if (base.bookDir) {
          if (!/^[a-zA-Z0-9_.-]+$/.test(id)) throw new Error("Invalid generated image identity")
          const root = fs.realpathSync(base.bookDir), directory = fs.realpathSync(path.join(root, "images"))
          const relative = path.relative(root, directory)
          if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Generated image directory escapes book")
          const file = path.join(directory, `${id}.png`)
          try { if (!fs.lstatSync(file).isFile()) throw new Error("Invalid generated asset") }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
          if (fs.existsSync(file) && !fs.readFileSync(file).equals(input.buffer)) throw new Error("Generated asset identity collision")
        }
        if (segment) base.putSegmentedImage(input as SegmentedImageInput)
        else base.putCroppedImage(input as CroppedImageInput)
      }
      for (const row of selectedNodes) {
        if (base.putNodeData(row.node, row.itemId, row.data) !== row.version) throw new Error("Generation version changed during publication")
      }
      for (const entry of recovered) if (included(entry.pageId ?? "book")) base.appendLlmLog(entry)
      if (!itemIds) assignments.forEach((sectionId, id) => base.assignSignLanguageVideo(id, sectionId))
      if (!itemIds) base.clearStepRuns([...clearedSteps])
      if (!itemIds) completedSteps.forEach((value, step) => value.skipped ? base.markStepSkipped(step) : base.markStepCompleted(step, value.message))
    })
    for (let index = recovered.length - 1; index >= 0; index--) if (included(recovered[index].pageId ?? "book")) recovered.splice(index, 1)
    for (const row of selectedNodes) written.add(JSON.stringify([row.node, row.itemId]))
    for (let index = nodes.length - 1; index >= 0; index--) if (included(nodes[index].itemId)) nodes.splice(index, 1)
    for (const [id, { input }] of images) if (included(input.pageId)) images.delete(id)
    if (!itemIds) { assignments.clear(); clearedSteps.clear(); completedSteps.clear() }
  } }
}
