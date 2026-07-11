import { z } from "zod"

export const PreviewLiveParticipant = z.object({
  id: z.string(),
  name: z.string(),
  connected: z.boolean(),
})
export type PreviewLiveParticipant = z.infer<typeof PreviewLiveParticipant>

export const PreviewLiveComment = z.object({
  id: z.string(),
  participantId: z.string(),
  participantName: z.string(),
  text: z.string(),
  pageId: z.string().nullable(),
  pageHref: z.string().nullable(),
  sectionIndex: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
  processed: z.boolean(),
})
export type PreviewLiveComment = z.infer<typeof PreviewLiveComment>

export const PreviewLiveSessionSnapshot = z.object({
  code: z.string().length(6),
  previewPath: z.string(),
  refreshToken: z.number().int().nonnegative(),
  participants: z.array(PreviewLiveParticipant),
  comments: z.array(PreviewLiveComment),
})
export type PreviewLiveSessionSnapshot = z.infer<
  typeof PreviewLiveSessionSnapshot
>

export const PreviewLiveClientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    participantId: z.string().min(8).max(80),
    name: z.string().trim().min(1).max(30),
  }),
  z.object({
    type: z.literal("comment"),
    text: z.string().trim().min(1).max(1000),
    pageId: z.string().max(100).nullable(),
    pageHref: z.string().max(500).nullable(),
    sectionIndex: z.number().int().nonnegative().nullable(),
  }),
  z.object({
    type: z.literal("delete-comment"),
    commentId: z.string().min(1).max(100),
  }),
  z.object({
    type: z.literal("host-join"),
    hostToken: z.string().min(20).max(200),
  }),
  z.object({
    type: z.literal("host-action"),
    hostToken: z.string().min(20).max(200),
    action: z.enum(["kick", "end", "mark-processed", "delete-comments", "refresh-preview"]),
    participantId: z.string().min(8).max(80).optional(),
    commentIds: z.array(z.string()).max(500).optional(),
    previewVersion: z.string().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/).optional(),
  }),
])
export type PreviewLiveClientMessage = z.infer<typeof PreviewLiveClientMessage>

export const PreviewLiveServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), data: PreviewLiveSessionSnapshot }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({
    type: z.literal("closed"),
    reason: z.enum(["removed", "host-ended"]),
  }),
])
export type PreviewLiveServerMessage = z.infer<typeof PreviewLiveServerMessage>

export const CreatePreviewLiveSessionRequest = z.object({
  previewVersion: z.string().min(1).max(100),
  joinBaseUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("http://") || value.startsWith("https://"))
    .optional(),
})
export type CreatePreviewLiveSessionRequest = z.infer<
  typeof CreatePreviewLiveSessionRequest
>

export const CreatePreviewLiveSessionResponse = z.object({
  code: z.string().length(6),
  hostToken: z.string(),
  joinUrls: z.array(z.string().url()).min(1),
  snapshot: PreviewLiveSessionSnapshot,
})
export type CreatePreviewLiveSessionResponse = z.infer<
  typeof CreatePreviewLiveSessionResponse
>
