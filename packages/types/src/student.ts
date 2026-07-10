import { z } from "zod"

export const AdaptationRules = z.record(z.string(), z.boolean())
export type AdaptationRules = z.infer<typeof AdaptationRules>

export const AccessibilityTemplate = z.object({
  id: z.string().uuid(),
  category: z.string().min(1).max(120),
  criteria: z.string().max(4_000).default(""),
  supportLevel: z.enum(["low", "moderate", "high"]),
  recommendations: z.array(z.string().min(1)).default([]),
  adaptationRules: AdaptationRules.default({}),
  examples: z.array(z.string().min(1)).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type AccessibilityTemplate = z.infer<typeof AccessibilityTemplate>

export const StudentAccessibilityProfile = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  templateId: z.string().uuid().nullable(),
  name: z.string().min(1).max(120),
  description: z.string().max(4_000).default(""),
  supportLevel: z.enum(["low", "moderate", "high"]),
  adaptations: AdaptationRules.default({}),
  recommendations: z.array(z.string().min(1)).default([]),
  comments: z.string().max(4_000).default(""),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type StudentAccessibilityProfile = z.infer<typeof StudentAccessibilityProfile>

export const Student = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  grade: z.string().max(80).default(""),
  age: z.number().int().min(0).max(120).nullable(),
  notes: z.string().max(8_000).default(""),
  parentName: z.string().max(240).default(""),
  parentEmail: z.string().email().or(z.literal("")).default(""),
  accessibilityProfiles: z.array(StudentAccessibilityProfile).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Student = z.infer<typeof Student>

export const StudentInput = Student.omit({
  id: true,
  accessibilityProfiles: true,
  createdAt: true,
  updatedAt: true,
})
export type StudentInput = z.infer<typeof StudentInput>

export const AccessibilityProfileInput = StudentAccessibilityProfile.omit({
  id: true,
  studentId: true,
  createdAt: true,
  updatedAt: true,
})
export type AccessibilityProfileInput = z.infer<typeof AccessibilityProfileInput>

export const MaterialStatus = z.enum(["ready", "failed"])
export const AssignmentStatus = z.enum(["PENDING", "SENT", "IN_PROGRESS", "COMPLETED"])
export type AssignmentStatus = z.infer<typeof AssignmentStatus>

export const Material = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  sourceBookLabel: z.string(),
  derivedBookLabel: z.string(),
  adaptationPlan: AdaptationRules,
  status: MaterialStatus,
  createdAt: z.string().datetime(),
})
export type Material = z.infer<typeof Material>

export const MaterialAssignment = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  materialId: z.string().uuid(),
  status: AssignmentStatus,
  assignedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
})
export type MaterialAssignment = z.infer<typeof MaterialAssignment>

export const MaterialDelivery = z.object({
  id: z.string().uuid(),
  assignmentId: z.string().uuid(),
  method: z.enum(["manual", "email", "share-link"]),
  recipient: z.string(),
  status: z.enum(["recorded", "sent", "failed"]),
  sentAt: z.string().datetime(),
})
export type MaterialDelivery = z.infer<typeof MaterialDelivery>
