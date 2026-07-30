import { z } from "zod"

export const ReviewerValidationStatus = z.enum([
  "not-reviewed",
  "pass",
  "needs-changes",
  "not-applicable",
])
export type ReviewerValidationStatus = z.infer<typeof ReviewerValidationStatus>

export const ReviewerValidationFieldType = z.enum(["text", "number", "date", "textarea"])
export type ReviewerValidationFieldType = z.infer<typeof ReviewerValidationFieldType>

export const ValidationFixStage = z.enum([
  "extract",
  "sectioning",
  "storyboard",
  "captions",
  "quizzes",
  "glossary",
  "easy-read",
  "translate",
  "speech",
  "sign-language",
])
export type ValidationFixStage = z.infer<typeof ValidationFixStage>

export const ReviewerValidationIdentificationField = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  description: z.string().min(1).optional(),
  type: ReviewerValidationFieldType,
  required: z.boolean().default(false),
})
export type ReviewerValidationIdentificationField = z.infer<typeof ReviewerValidationIdentificationField>

export const ReviewerValidationInstruction = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  body: z.string().min(1),
  bullets: z.array(z.string().min(1)).optional(),
})
export type ReviewerValidationInstruction = z.infer<typeof ReviewerValidationInstruction>

export const ReviewerValidationCriterion = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  guidance: z.string().min(1),
  fix_stage: ValidationFixStage.optional(),
  requires_comment_on_failure: z.boolean().default(true),
  requires_suggested_modification_on_failure: z.boolean().default(false),
})
export type ReviewerValidationCriterion = z.infer<typeof ReviewerValidationCriterion>

export const ReviewerValidationSection = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  fix_stage: ValidationFixStage.optional(),
  criteria: z.array(ReviewerValidationCriterion).min(1),
})
export type ReviewerValidationSection = z.infer<typeof ReviewerValidationSection>

export const ReviewerValidationCatalogSnapshot = z.object({
  identificationFields: z.array(ReviewerValidationIdentificationField),
  instructions: z.array(ReviewerValidationInstruction),
  pageSections: z.array(ReviewerValidationSection),
})
export type ReviewerValidationCatalogSnapshot = z.infer<typeof ReviewerValidationCatalogSnapshot>

export const ReviewerValidationSession = z
  .object({
    session_id: z.string().min(1),
    reviewer_name: z.string().min(1),
    institution: z.string().min(1).optional(),
    language: z.string().min(1).optional(),
    start_page: z.number().int().min(1).optional(),
    end_page: z.number().int().min(1).optional(),
    comments: z.string().optional(),
    started_at: z.string().datetime().optional(),
    completed_at: z.string().datetime().optional(),
    catalog_snapshot: ReviewerValidationCatalogSnapshot.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.start_page !== undefined &&
      value.end_page !== undefined &&
      value.end_page < value.start_page
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_page"],
        message: "end_page must be greater than or equal to start_page",
      })
    }
  })
export type ReviewerValidationSession = z.infer<typeof ReviewerValidationSession>

export const ReviewerPageValidationResult = z.object({
  criterion_id: z.string().regex(/^[a-z0-9-]+$/),
  status: ReviewerValidationStatus,
  comment: z.string().optional(),
  suggested_modification: z.string().optional(),
})
export type ReviewerPageValidationResult = z.infer<typeof ReviewerPageValidationResult>

export const ReviewerPageValidationRecord = z.object({
  session_id: z.string().min(1),
  page_id: z.string().min(1),
  section_id: z.string().min(1).optional(),
  page_number: z.number().int().min(1).optional(),
  href: z.string().min(1),
  language: z.string().min(1).optional(),
  results: z.array(ReviewerPageValidationResult),
  overall_comment: z.string().optional(),
  reviewed_count: z.number().int().min(0).optional(),
  criteria_count: z.number().int().min(0).optional(),
  updated_at: z.string().datetime().optional(),
})
export type ReviewerPageValidationRecord = z.infer<typeof ReviewerPageValidationRecord>
