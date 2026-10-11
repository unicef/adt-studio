/** Shared HTTP/filesystem acceptance for disposable copies of the representative books. */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"

export function hashes(root, include = () => true) {
  const files = {}
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name), relative = path.relative(root, file)
      if (entry.isDirectory()) walk(file)
      else if (entry.isFile() && include(relative)) files[relative] = createHash("sha256").update(fs.readFileSync(file)).digest("hex")
    }
  }
  walk(root)
  return files
}

export function copyBooks(source, destination) {
  assert.ok(!fs.existsSync(destination), "Disposable destination must be new")
  assert.ok(!path.resolve(destination).startsWith(path.resolve(source) + path.sep), "Destination must be outside source books")
  const before = hashes(source)
  fs.cpSync(source, destination, { recursive: true, errorOnExist: true })
  assert.deepEqual(hashes(source), before, "Source changed while copying; repeat with a stable fixture")
  assert.deepEqual(hashes(destination), before)
  return before
}

const leaves = (nodes) => nodes.flatMap((node) => [node, ...leaves(node.children ?? [])]).filter((node) => !node.isPruned && node.role && node.role !== "image" && node.text)
const assetHashes = (books) => hashes(books, (file) => /^[^/]+\/(images|audio|fonts|videos)\//.test(file))
const content = ({ sectioningTree, rendering, versions, sectioningSynchronization }) => ({ sectioningTree, rendering, versions, sectioningSynchronization })

export async function exercisePackagedSynchronization({ request, books, restart }) {
  const getPage = (label, id) => request(`/books/${label}/pages/${id}`)
  const save = (label, id, tree, previous, storyboard = false) => request(`/books/${label}/pages/${id}/${storyboard ? "storyboard" : "sectioning"}`, "PUT", {
    ...(storyboard ? { sectioning: tree } : tree), baseVersion: previous.versions.sectioning ?? 0, renderingVersion: previous.versions.rendering ?? 0,
  })
  const assetsBefore = assetHashes(books)
  const neighborBefore = content(await getPage("momograde1", "pg006"))
  const initial = await getPage("momograde1", "pg005")
  assert.equal(initial.sectioningSynchronization.layout, "reflowable")
  assert.ok(initial.sectioningSynchronization.sections.some((section) => section.status === "current"))
  const tree = structuredClone(initial.sectioningTree)
  const section = tree.sections.find((section) => !section.isPruned && section.sectionType === "activity_fill_in_the_blank")
  assert.ok(section, "Representative generated activity is required")
  const marker = " Packaged smoke & <safe>."
  leaves(section.nodes)[0].text += marker
  const patch = await save("momograde1", "pg005", tree, initial, true)
  assert.equal(patch.synchronization.sections.find((item) => item.sectionId === section.sectionId)?.status, "text-patched")
  const patched = await getPage("momograde1", "pg005")
  const oldRendering = initial.rendering.sections.find((item) => item.html.includes(`data-section-id="${section.sectionId}"`))
  const newRendering = patched.rendering.sections.find((item) => item.html.includes(`data-section-id="${section.sectionId}"`))
  assert.ok(oldRendering && newRendering)
  assert.equal(newRendering.html.replace(" Packaged smoke &amp; &lt;safe&gt;.", ""), oldRendering.html, "Only proven text bytes may change")
  assert.deepEqual(newRendering.activityAnswers, oldRendering.activityAnswers)
  const controls = [...oldRendering.html.matchAll(/data-id="([^"]+_activity_[a-f0-9]{24})"/g)].map((match) => match[1])
  assert.equal(controls.length, 2, "Use the final generated-control acceptance fixture")
  for (const id of controls) assert.ok(newRendering.html.includes(`data-id="${id}"`))
  const repeated = await save("momograde1", "pg005", tree, patched, true)
  assert.equal(repeated.sectioningVersion, patched.versions.sectioning)
  assert.equal(repeated.renderingVersion, patched.versions.rendering)

  // A structural source edit must persist while the saved activity stays intact.
  const changedStructure = structuredClone(patched.sectioningTree)
  changedStructure.sections.find((item) => item.sectionId === section.sectionId).nodes.push({ nodeId: "pg005_n999999", role: "text", text: "Packaged structural drift", isPruned: false })
  const driftSave = await save("momograde1", "pg005", changedStructure, patched)
  assert.ok(driftSave.synchronization.sections.some((item) => item.status === "structural-drift"))
  const drift = await getPage("momograde1", "pg005")
  assert.deepEqual(drift.rendering, patched.rendering)
  assert.equal(drift.versions.rendering, patched.versions.rendering)

  const fixed = await getPage("spec3-b1-acceptance", "pg001")
  assert.equal(fixed.sectioningSynchronization.layout, "fixed")
  const fixedPackageBefore = hashes(path.join(books, "spec3-b1-acceptance", "adt"))
  const fixedTree = structuredClone(fixed.sectioningTree)
  leaves(fixedTree.sections[0].nodes)[0].text += " Packaged fixed semantic edit."
  await save("spec3-b1-acceptance", "pg001", fixedTree, fixed)
  const fixedSaved = await getPage("spec3-b1-acceptance", "pg001")
  assert.deepEqual(fixedSaved.rendering, fixed.rendering)
  assert.ok(fixedSaved.sectioningSynchronization.sections.every((item) => item.status === "fixed-layout-unmapped" && item.action !== "repair"))
  assert.deepEqual(hashes(path.join(books, "spec3-b1-acceptance", "adt")), fixedPackageBefore)
  assert.deepEqual(assetHashes(books), assetsBefore)
  assert.deepEqual(content(await getPage("momograde1", "pg006")), neighborBefore)

  // Repeated GET and a real process/container replacement cannot add versions,
  // clear drift, or reinterpret a fixed page as semantic rendering.
  assert.deepEqual(content(await getPage("momograde1", "pg005")), content(drift))
  await restart()
  assert.deepEqual(content(await getPage("momograde1", "pg005")), content(drift))
  assert.deepEqual(content(await getPage("spec3-b1-acceptance", "pg001")), content(fixedSaved))
  assert.deepEqual(content(await getPage("momograde1", "pg006")), neighborBefore)
  assert.deepEqual(assetHashes(books), assetsBefore)
  assert.deepEqual(hashes(path.join(books, "spec3-b1-acceptance", "adt")), fixedPackageBefore)
  return { checks: ["atomic Storyboard text Save", "identical Save creates no versions", "activity HTML/control/answer preservation", "structural drift survives Sectioning Save, repeated GET and restart", "fixed semantic Save retains rendering and packaged bytes", "unaffected legacy page unchanged", "all media hashes unchanged"],
    activityVersions: drift.versions, fixedVersions: fixedSaved.versions, generatedControls: controls, assetCount: Object.keys(assetsBefore).length }
}
