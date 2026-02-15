import { z } from "zod"

export const QuizOption = z.object({
  text: z.string(),
  explanation: z.string(),
})
export type QuizOption = z.infer<typeof QuizOption>

export const Quiz = z.object({
  quizIndex: z.number().int(),
  afterPageId: z.string(),
  pageIds: z.array(z.string()),
  question: z.string(),
  options: z.array(QuizOption).length(3),
  answerIndex: z.number().int().min(0).max(2),
  reasoning: z.string(),
})
export type Quiz = z.infer<typeof Quiz>

export const QuizGenerationOutput = z.object({
  generatedAt: z.string(),
  language: z.string(),
  pagesPerQuiz: z.number().int(),
  quizzes: z.array(Quiz),
})
export type QuizGenerationOutput = z.infer<typeof QuizGenerationOutput>

/** Schema for what the LLM returns (simpler than the stored Quiz type) */
export const quizLLMSchema = z.object({
  reasoning: z.string(),
  question: z.string(),
  options: z.array(
    z.object({
      text: z.string(),
      explanation: z.string(),
    })
  ),
  answer_index: z.number().int(),
})
