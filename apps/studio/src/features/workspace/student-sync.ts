import type { Student } from "@adt/types"
import { classroomApi } from "@/api/classroom-client"
import { getWorkspace } from "./config"

const KEY = "adt_teacher_workspace_students"
const ids = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string> } catch { return {} } }
export async function syncStudentToWorkspace(student: Student): Promise<void> {
  const workspace = getWorkspace(); if (!workspace) return
  const profile = student.accessibilityProfiles[0]
  const data = { firstName: student.firstName, lastName: student.lastName, profile: { readingLevel: student.grade || "general", preferredLanguage: "en", simplifiedLanguage: Boolean(profile?.adaptations.simplifyLanguage), symbolSupport: Boolean(profile?.adaptations.addImages), audioSupport: Boolean(profile?.adaptations.generateAudio), attentionSupport: Boolean(profile?.adaptations.shortenActivities || profile?.adaptations.chunkContent), notes: [student.notes, profile?.comments].filter(Boolean).join("\n") } }
  const map = ids(); const remote = map[student.id]
  const saved = remote ? await classroomApi.updateStudent(workspace.teacherId, remote, data) : await classroomApi.createStudent(workspace.teacherId, data)
  map[student.id] = saved.id; localStorage.setItem(KEY, JSON.stringify(map))
}
