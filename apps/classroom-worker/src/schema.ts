import { z } from "zod"
export const profileInput = z.object({ readingLevel: z.string().min(1).max(80), preferredLanguage: z.string().min(2).max(20), simplifiedLanguage: z.boolean().default(false), symbolSupport: z.boolean().default(false), audioSupport: z.boolean().default(false), attentionSupport: z.boolean().default(false), notes: z.string().max(4_000).default("") })
export const studentInput = z.object({ firstName: z.string().min(1).max(120), lastName: z.string().min(1).max(120), profile: profileInput })
export const materialInput = z.object({ title: z.string().min(1).max(240), body: z.string().max(100_000).default(""), studentId: z.string().uuid().nullable().default(null) })
export const sessionInput = z.object({ materialId: z.string().uuid(), durationMinutes: z.number().int().min(5).max(1_440).default(120) })
export const participantInput = z.object({ joinCode: z.string().length(6).regex(/^[A-Z0-9]+$/), displayName: z.string().min(1).max(120) })
export const responseInput = z.object({ responses: z.record(z.string(), z.unknown()) })
export const parentShareInput = z.object({ expiresAt: z.string().datetime().nullable().default(null) })
