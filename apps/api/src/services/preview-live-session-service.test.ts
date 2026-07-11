import { describe, expect, it } from "vitest"
import type { PreviewLiveServerMessage } from "@adt/types"
import { createPreviewLiveSessionService } from "./preview-live-session-service.js"

function fakeSocket() {
  const messages: PreviewLiveServerMessage[] = []
  const closes: number[] = []
  return {
    messages,
    closes,
    socket: {
      send(data: string) {
        messages.push(JSON.parse(data) as PreviewLiveServerMessage)
      },
      close(code?: number) {
        if (code) closes.push(code)
      },
    },
  }
}

describe("preview live session service", () => {
  it("collects page comments and lets the host mark them processed", () => {
    const service = createPreviewLiveSessionService()
    const created = service.create("/api/books/demo/adt/v-1/")
    const player = fakeSocket()
    const host = fakeSocket()
    const playerConnection = service.connect(created.code, player.socket)!
    const hostConnection = service.connect(created.code, host.socket)!

    service.receive(
      created.code,
      playerConnection,
      JSON.stringify({
        type: "join",
        participantId: "participant-123",
        name: "Alex",
      })
    )
    service.receive(
      created.code,
      playerConnection,
      JSON.stringify({
        type: "comment",
        text: "Make this heading clearer",
        pageId: "pg001",
        pageHref: "pg001.html",
        sectionIndex: 0,
      })
    )

    const comment = service.getSnapshot(created.code)?.comments[0]
    expect(comment).toMatchObject({
      participantName: "Alex",
      text: "Make this heading clearer",
      pageId: "pg001",
      sectionIndex: 0,
      processed: false,
    })

    service.receive(
      created.code,
      hostConnection,
      JSON.stringify({
        type: "host-action",
        hostToken: created.hostToken,
        action: "mark-processed",
        commentIds: [comment!.id],
      })
    )
    expect(service.getSnapshot(created.code)?.comments[0]?.processed).toBe(true)
  })

  it("removes a participant and closes their connection", () => {
    const service = createPreviewLiveSessionService()
    const created = service.create("/preview")
    const player = fakeSocket()
    const host = fakeSocket()
    const playerConnection = service.connect(created.code, player.socket)!
    const hostConnection = service.connect(created.code, host.socket)!
    service.receive(
      created.code,
      playerConnection,
      JSON.stringify({
        type: "join",
        participantId: "participant-123",
        name: "Alex",
      })
    )
    service.receive(
      created.code,
      hostConnection,
      JSON.stringify({
        type: "host-action",
        hostToken: created.hostToken,
        action: "kick",
        participantId: "participant-123",
      })
    )

    expect(service.getSnapshot(created.code)?.participants).toHaveLength(0)
    expect(player.messages.at(-1)).toEqual({
      type: "closed",
      reason: "removed",
    })
    expect(player.closes).toEqual([4403])
  })

  it("lets participants delete only their own comments", () => {
    const service = createPreviewLiveSessionService()
    const created = service.create("/preview")
    const alex = fakeSocket()
    const sam = fakeSocket()
    const alexConnection = service.connect(created.code, alex.socket)!
    const samConnection = service.connect(created.code, sam.socket)!
    service.receive(
      created.code,
      alexConnection,
      JSON.stringify({ type: "join", participantId: "participant-alex", name: "Alex" })
    )
    service.receive(
      created.code,
      samConnection,
      JSON.stringify({ type: "join", participantId: "participant-sam", name: "Sam" })
    )
    service.receive(
      created.code,
      alexConnection,
      JSON.stringify({
        type: "comment",
        text: "Remove one word",
        pageId: "pg001",
        pageHref: "pg001.html",
        sectionIndex: 0,
      })
    )
    const commentId = service.getSnapshot(created.code)!.comments[0]!.id

    service.receive(
      created.code,
      samConnection,
      JSON.stringify({ type: "delete-comment", commentId })
    )
    expect(service.getSnapshot(created.code)?.comments).toHaveLength(1)

    service.receive(
      created.code,
      alexConnection,
      JSON.stringify({ type: "delete-comment", commentId })
    )
    expect(service.getSnapshot(created.code)?.comments).toHaveLength(0)
  })

  it("keeps participants connected when the host refreshes the preview", () => {
    const service = createPreviewLiveSessionService()
    const created = service.create("/api/books/demo/adt/v-old-version/")
    const player = fakeSocket()
    const host = fakeSocket()
    service.connect(created.code, player.socket)
    const hostConnection = service.connect(created.code, host.socket)!

    service.receive(
      created.code,
      hostConnection,
      JSON.stringify({
        type: "host-action",
        hostToken: created.hostToken,
        action: "refresh-preview",
        previewVersion: "new-version",
      })
    )

    expect(service.getSnapshot(created.code)?.refreshToken).toBe(1)
    expect(service.getSnapshot(created.code)?.previewPath).toBe(
      "/api/books/demo/adt/v-new-version/"
    )
    expect(player.messages.at(-1)).toMatchObject({
      type: "snapshot",
      data: { refreshToken: 1 },
    })
    expect(player.closes).toHaveLength(0)
  })
})
