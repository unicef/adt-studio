import { z } from "zod"

export const ValidationShare = z.object({
  share_id: z.string().min(1),
  token_hash: z.string().regex(/^[a-f0-9]{64}$/),
  package_version: z.string().min(1),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  revoked_at: z.string().datetime().optional(),
})
export type ValidationShare = z.infer<typeof ValidationShare>

export const CreateValidationShare = z.object({
  expires_in_days: z.number().int().min(1).max(90).default(14),
})
export type CreateValidationShare = z.infer<typeof CreateValidationShare>

export const ValidationShareFeedbackCategory = z.enum([
  "content",
  "voice",
  "sign-language",
  "accessibility",
  "other",
])

export const ValidationShareFeedback = z.object({
  feedback_id: z.string().min(1),
  share_id: z.string().min(1),
  reviewer_name: z.string().min(1).max(200),
  category: ValidationShareFeedbackCategory,
  page_href: z.string().max(1000).optional(),
  comment: z.string().min(1).max(10_000),
  created_at: z.string().datetime(),
  resolved_at: z.string().datetime().optional(),
})
export type ValidationShareFeedback = z.infer<typeof ValidationShareFeedback>

export const SubmitValidationShareFeedback = ValidationShareFeedback.pick({
  reviewer_name: true,
  category: true,
  page_href: true,
  comment: true,
})
export type SubmitValidationShareFeedback = z.infer<typeof SubmitValidationShareFeedback>
