export interface ClassroomMaterial { id: string; title: string; body: string; studentId: string | null }
export interface ClassroomSession { id: string; joinCode: string; shareUrl: string; expiresAt: string }

const baseUrl = import.meta.env.VITE_CLASSROOM_API_URL?.replace(/\/$/, "")
export function classroomConfigured() { return Boolean(baseUrl) }
async function request<T>(teacherId: string, path: string, init?: RequestInit): Promise<T> {
  if (!baseUrl) throw new Error("Classroom API URL is not configured")
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", "X-Teacher-Id": teacherId, ...init?.headers } })
  if (!response.ok) throw new Error((await response.json().catch(() => ({ error: response.statusText }))).error)
  return response.json() as Promise<T>
}
export const classroomApi = {
  materials: (teacherId: string) => request<ClassroomMaterial[]>(teacherId, "/materials"),
  createSession: (teacherId: string, materialId: string, durationMinutes: number) => request<ClassroomSession>(teacherId, "/sessions", { method: "POST", body: JSON.stringify({ materialId, durationMinutes }) }),
}
