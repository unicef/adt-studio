export interface ClassroomMaterial { id: string; title: string; body: string; studentId: string | null; syncStatus: "pending" | "uploading" | "synced" | "failed"; syncError: string | null }
export interface ClassroomSession { id: string; joinCode: string; shareUrl: string; expiresAt: string }
export interface WorkspaceAnalytics { totalProfiles: number; totalMaterials: number; totalMaterialsSent: number; totalMaterialsSynced: number; pendingUploads: number; activity: Array<{ type: string; description: string; created_at: string }> }

const baseUrl = (import.meta.env.VITE_CLASSROOM_API_URL ?? "https://adt-classroom-sessions.elasticsounds.workers.dev").replace(/\/$/, "")
export function classroomConfigured() { return Boolean(baseUrl) }
async function request<T>(teacherId: string, path: string, init?: RequestInit): Promise<T> {
  if (!baseUrl) throw new Error("Classroom API URL is not configured")
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", "X-Teacher-Id": teacherId, ...init?.headers } })
  if (!response.ok) throw new Error((await response.json().catch(() => ({ error: response.statusText }))).error)
  return response.json() as Promise<T>
}
export const classroomApi = {
  createStudent: (teacherId: string, data: { firstName: string; lastName: string; profile: { readingLevel: string; preferredLanguage: string; simplifiedLanguage: boolean; symbolSupport: boolean; audioSupport: boolean; attentionSupport: boolean; notes: string } }) => request<{ id: string }>(teacherId, "/students", { method: "POST", body: JSON.stringify(data) }),
  updateStudent: (teacherId: string, id: string, data: { firstName: string; lastName: string; profile: { readingLevel: string; preferredLanguage: string; simplifiedLanguage: boolean; symbolSupport: boolean; audioSupport: boolean; attentionSupport: boolean; notes: string } }) => request<{ id: string }>(teacherId, `/students/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  materials: (teacherId: string) => request<ClassroomMaterial[]>(teacherId, "/materials"),
  createMaterial: (teacherId: string, data: { title: string; body: string; studentId?: string | null }) => request<ClassroomMaterial>(teacherId, "/materials", { method: "POST", body: JSON.stringify(data) }),
  createSession: (teacherId: string, materialId: string, durationMinutes: number) => request<ClassroomSession>(teacherId, "/sessions", { method: "POST", body: JSON.stringify({ materialId, durationMinutes }) }),
  analytics: (teacherId: string) => request<WorkspaceAnalytics>(teacherId, "/workspace/analytics"),
  sendToParent: (teacherId: string, materialId: string, parentEmail: string) => request<{ status: string; sentAt: string }>(teacherId, `/materials/${materialId}/deliveries`, { method: "POST", body: JSON.stringify({ parentEmail }) }),
  retryMaterialSync: (teacherId: string, materialId: string) => request<ClassroomMaterial>(teacherId, `/materials/${materialId}/sync`, { method: "POST" }),
  uploadMaterialContent: (teacherId: string, materialId: string, content: ArrayBuffer) => request<ClassroomMaterial>(teacherId, `/materials/${materialId}/content`, { method: "PUT", headers: { "Content-Type": "application/zip" }, body: content }),
}
