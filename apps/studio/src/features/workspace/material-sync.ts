import { classroomApi, type ClassroomMaterial } from "@/api/classroom-client"
import { getWorkspace } from "./config"
import { BASE_URL } from "@/api/client"
import { unzipSync } from "fflate"

const KEY = "adt_teacher_workspace_materials"
export interface StoredCloudMaterial { material: ClassroomMaterial; parentEmail: string }
function entries(): Record<string, StoredCloudMaterial> { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, StoredCloudMaterial> } catch { return {} } }
export function getSyncedMaterial(bookLabel: string): StoredCloudMaterial | null { return entries()[bookLabel] ?? null }
async function publishReader(bookLabel: string, material: ClassroomMaterial): Promise<ClassroomMaterial> {
  const workspace = getWorkspace(); if (!workspace) throw new Error("Connect a workspace before synchronizing materials.")
  // export-adt contains the browser-ready reader, unlike export-project which
  // deliberately excludes adt/. Publish its individual files so R2 can serve
  // the complete interactive material in a browser.
  const packageRun = await fetch(`${BASE_URL}/books/${bookLabel}/package-adt`, { method: "POST" })
  if (!packageRun.ok) throw new Error("Could not package the interactive material. Run Storyboard first, then try again.")
  for (let attempt = 0; attempt < 90; attempt++) {
    const status = await fetch(`${BASE_URL}/books/${bookLabel}/package-adt/status`)
    if (status.ok && (await status.json() as { hasAdt: boolean }).hasAdt) break
    await new Promise((resolve) => window.setTimeout(resolve, 1_000))
    if (attempt === 89) throw new Error("The interactive material package did not finish in time.")
  }
  const source = await fetch(`${BASE_URL}/books/${bookLabel}/export-adt`)
  if (!source.ok) throw new Error("Could not export the interactive material. Finish the Preview package first, then try again.")
  const archive = await source.arrayBuffer()
  const files = unzipSync(new Uint8Array(archive))
  if (!files["index.html"]) throw new Error("The generated material does not include an interactive reader.")
  const paths = Object.keys(files).filter((path) => path && !path.startsWith("/") && !path.split("/").some((part) => part === "." || part === ".."))
  await Promise.all(paths.map((path) => classroomApi.uploadMaterialFile(workspace.teacherId, material.id, path, files[path])))
  return classroomApi.uploadMaterialContent(workspace.teacherId, material.id, archive)
}
export async function syncGeneratedMaterial(bookLabel: string, parentEmail = "", title = bookLabel): Promise<ClassroomMaterial> {
  const workspace = getWorkspace(); if (!workspace) throw new Error("Connect a workspace before synchronizing materials.")
  const material = await classroomApi.createMaterial(workspace.teacherId, { title, body: JSON.stringify({ sourceBookLabel: bookLabel, parentEmail, generatedAt: new Date().toISOString() }), studentId: null })
  const synced = await publishReader(bookLabel, material)
  const next = entries(); next[bookLabel] = { material: synced, parentEmail }; localStorage.setItem(KEY, JSON.stringify(next)); return synced
}
export async function publishInteractiveMaterial(bookLabel: string, material?: ClassroomMaterial): Promise<ClassroomMaterial> {
  const stored = getSyncedMaterial(bookLabel)
  const target = material ?? stored?.material
  if (!target) throw new Error("Material is not synchronized.")
  const synced = await publishReader(bookLabel, target)
  const next = entries(); next[bookLabel] = { material: synced, parentEmail: stored?.parentEmail ?? "" }; localStorage.setItem(KEY, JSON.stringify(next)); return synced
}
