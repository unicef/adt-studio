import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { AccessibilityProfileInput, StudentInput } from "@adt/types"
import { api } from "@/api/client"
import { syncStudentToWorkspace } from "@/features/workspace/student-sync"

export function useStudents(search = "") { return useQuery({ queryKey: ["students", search], queryFn: () => api.getStudents(search) }) }
export function useStudent(id: string) { return useQuery({ queryKey: ["students", id], queryFn: () => api.getStudent(id), enabled: !!id }) }
export function useStudentDashboard() { return useQuery({ queryKey: ["student-dashboard"], queryFn: api.getStudentDashboard }) }

export function useSaveStudent(id?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: StudentInput) => id ? api.updateStudent(id, data) : api.createStudent(data),
    onSuccess: async (student) => { await syncStudentToWorkspace(student).catch(() => {}); queryClient.invalidateQueries({ queryKey: ["students"] }); queryClient.invalidateQueries({ queryKey: ["student-dashboard"] }); queryClient.setQueryData(["students", student.id], student) },
  })
}
export function useDeleteStudent() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: api.deleteStudent, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["students"] }); queryClient.invalidateQueries({ queryKey: ["student-dashboard"] }) } })
}
export function useAddStudentProfile(studentId: string) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: (data: AccessibilityProfileInput) => api.addStudentProfile(studentId, data), onSuccess: async () => { const student = await api.getStudent(studentId); await syncStudentToWorkspace(student).catch(() => {}); queryClient.invalidateQueries({ queryKey: ["students", studentId] }) } })
}
export function useDeleteStudentProfile(studentId: string) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: (profileId: string) => api.deleteStudentProfile(studentId, profileId), onSuccess: async () => { const student = await api.getStudent(studentId); await syncStudentToWorkspace(student).catch(() => {}); queryClient.invalidateQueries({ queryKey: ["students", studentId] }); queryClient.invalidateQueries({ queryKey: ["student-dashboard"] }) } })
}
export function useGeneratePersonalizedMaterial() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: ({ studentId, sourceBookLabel, profileId }: { studentId: string; sourceBookLabel: string; profileId?: string }) => api.generatePersonalizedMaterial(studentId, sourceBookLabel, profileId), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["students"] }); queryClient.invalidateQueries({ queryKey: ["books"] }); queryClient.invalidateQueries({ queryKey: ["student-dashboard"] }) } })
}
