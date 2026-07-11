import { classroomApi, type ClassroomMaterial } from "@/api/classroom-client"
import { getWorkspace } from "./config"
import { BASE_URL } from "@/api/client"

const KEY = "adt_teacher_workspace_materials"
export interface StoredCloudMaterial { material: ClassroomMaterial; parentEmail: string }
function entries(): Record<string, StoredCloudMaterial> { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, StoredCloudMaterial> } catch { return {} } }
export function getSyncedMaterial(bookLabel: string): StoredCloudMaterial | null { return entries()[bookLabel] ?? null }
export async function syncGeneratedMaterial(bookLabel: string, parentEmail = "", title = bookLabel): Promise<ClassroomMaterial> {
  const workspace = getWorkspace(); if (!workspace) throw new Error("Connect a workspace before synchronizing materials.")
  const material = await classroomApi.createMaterial(workspace.teacherId, { title, body: JSON.stringify({ sourceBookLabel: bookLabel, generatedAt: new Date().toISOString() }), studentId: null })
  const source = await fetch(`${BASE_URL}/books/${bookLabel}/export-project`)
  if (!source.ok) throw new Error("Could not export the generated material for cloud synchronization.")
  const synced = await classroomApi.uploadMaterialContent(workspace.teacherId, material.id, await source.arrayBuffer())
  const next = entries(); next[bookLabel] = { material: synced, parentEmail }; localStorage.setItem(KEY, JSON.stringify(next)); return synced
}
