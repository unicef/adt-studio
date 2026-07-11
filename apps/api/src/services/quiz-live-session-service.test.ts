import { describe, expect, it } from "vitest"
import type { Quiz, QuizLiveServerMessage } from "@adt/types"
import { createQuizLiveSessionService } from "./quiz-live-session-service.js"

function quiz(answerIndex: number): Quiz {
  return {
    quizIndex: 0,
    afterPageId: "page-1",
    pageIds: ["page-1"],
    question: "Which one is correct?",
    options: [
      { text: "First", explanation: "First explanation" },
      { text: "Second", explanation: "Second explanation" },
      { text: "Third", explanation: "Third explanation" },
    ],
    answerIndex,
    reasoning: "A reason",
  }
}

function fakeSocket() {
  const messages: QuizLiveServerMessage[] = []
  return {
    messages,
    socket: {
      send(data: string) {
        messages.push(JSON.parse(data) as QuizLiveServerMessage)
      },
      close() {},
    },
  }
}

describe("quiz live session service", () => {
  it("keeps answers private until reveal and scores only once", () => {
    const service = createQuizLiveSessionService()
    const created = service.create([quiz(1)])
    const player = fakeSocket()
    const host = fakeSocket()
    const playerConnection = service.connect(created.code, player.socket)
    const hostConnection = service.connect(created.code, host.socket)
    expect(playerConnection).not.toBeNull()
    expect(hostConnection).not.toBeNull()

    service.receive(
      created.code,
      playerConnection!,
      JSON.stringify({
        type: "join",
        participantId: "participant-123",
        name: "Sam",
      })
    )
    service.receive(
      created.code,
      hostConnection!,
      JSON.stringify({
        type: "host-action",
        hostToken: created.hostToken,
        action: "start",
      })
    )
    service.receive(
      created.code,
      playerConnection!,
      JSON.stringify({ type: "answer", answerIndex: 1 })
    )

    const beforeReveal = service.getSnapshot(created.code)
    expect(beforeReveal?.reveal).toBeNull()
    expect(beforeReveal?.participants[0]?.score).toBe(0)

    service.receive(
      created.code,
      hostConnection!,
      JSON.stringify({
        type: "host-action",
        hostToken: created.hostToken,
        action: "reveal",
      })
    )
    expect(service.getSnapshot(created.code)?.reveal).toEqual({
      answerIndex: 1,
      explanation: "Second explanation",
      answerCounts: [0, 1, 0],
    })
    expect(service.getSnapshot(created.code)?.participants[0]?.score).toBe(100)

    service.receive(
      created.code,
      hostConnection!,
      JSON.stringify({
        type: "host-action",
        hostToken: created.hostToken,
        action: "reveal",
      })
    )
    expect(service.getSnapshot(created.code)?.participants[0]?.score).toBe(100)
  })

  it("rejects host actions that do not have the session token", () => {
    const service = createQuizLiveSessionService()
    const created = service.create([quiz(0)])
    const client = fakeSocket()
    const connection = service.connect(created.code, client.socket)

    service.receive(
      created.code,
      connection!,
      JSON.stringify({
        type: "host-action",
        hostToken: "not-the-right-host-token",
        action: "start",
      })
    )

    expect(service.getSnapshot(created.code)?.status).toBe("lobby")
    expect(client.messages.at(-1)).toEqual({
      type: "error",
      message: "Host access denied",
    })
  })

  it("lets the host remove a participant", () => {
    const service = createQuizLiveSessionService()
    const created = service.create([quiz(0)])
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
        name: "Sam",
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
  })
})
