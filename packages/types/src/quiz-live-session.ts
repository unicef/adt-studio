import { z } from "zod"

export const QuizLiveStatus = z.enum([
  "lobby",
  "question",
  "reveal",
  "finished",
])
export type QuizLiveStatus = z.infer<typeof QuizLiveStatus>

export const QuizLiveQuestion = z.object({
  index: z.number().int().nonnegative(),
  question: z.string(),
  options: z.array(z.string()).length(3),
})
export type QuizLiveQuestion = z.infer<typeof QuizLiveQuestion>

export const QuizLiveParticipant = z.object({
  id: z.string(),
  name: z.string(),
  score: z.number().int().nonnegative(),
  answered: z.boolean(),
  connected: z.boolean(),
})
export type QuizLiveParticipant = z.infer<typeof QuizLiveParticipant>

export const QuizLiveReveal = z.object({
  answerIndex: z.number().int().min(0).max(2),
  explanation: z.string(),
  answerCounts: z.array(z.number().int().nonnegative()).length(3),
})
export type QuizLiveReveal = z.infer<typeof QuizLiveReveal>

export const QuizLiveSessionSnapshot = z.object({
  code: z.string().length(6),
  status: QuizLiveStatus,
  questionIndex: z.number().int().nonnegative(),
  questionCount: z.number().int().positive(),
  participantCount: z.number().int().nonnegative(),
  participants: z.array(QuizLiveParticipant),
  question: QuizLiveQuestion.nullable(),
  reveal: QuizLiveReveal.nullable(),
  myAnswerIndex: z.number().int().min(0).max(2).nullable(),
})
export type QuizLiveSessionSnapshot = z.infer<typeof QuizLiveSessionSnapshot>

export const QuizLiveClientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    participantId: z.string().min(8).max(80),
    name: z.string().trim().min(1).max(30),
  }),
  z.object({
    type: z.literal("answer"),
    answerIndex: z.number().int().min(0).max(2),
  }),
  z.object({
    type: z.literal("host-join"),
    hostToken: z.string().min(20).max(200),
  }),
  z.object({
    type: z.literal("host-action"),
    hostToken: z.string().min(20).max(200),
    action: z.enum(["start", "reveal", "next", "kick", "end"]),
    participantId: z.string().min(8).max(80).optional(),
  }),
])
export type QuizLiveClientMessage = z.infer<typeof QuizLiveClientMessage>

export const QuizLiveServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), data: QuizLiveSessionSnapshot }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({
    type: z.literal("closed"),
    reason: z.enum(["removed", "host-ended"]),
  }),
])
export type QuizLiveServerMessage = z.infer<typeof QuizLiveServerMessage>

export const CreateQuizLiveSessionRequest = z.object({
  quizIndexes: z.array(z.number().int().nonnegative()).min(1).max(100).optional(),
  joinBaseUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("http://") || value.startsWith("https://"))
    .optional(),
})
export type CreateQuizLiveSessionRequest = z.infer<
  typeof CreateQuizLiveSessionRequest
>

export const CreateQuizLiveSessionResponse = z.object({
  code: z.string().length(6),
  hostToken: z.string(),
  joinUrls: z.array(z.string().url()).min(1),
  snapshot: QuizLiveSessionSnapshot,
})
export type CreateQuizLiveSessionResponse = z.infer<
  typeof CreateQuizLiveSessionResponse
>
