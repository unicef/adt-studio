import { randomBytes, randomInt, randomUUID } from "node:crypto"
import {
  QuizLiveClientMessage,
  type Quiz,
  type QuizLiveServerMessage,
  type QuizLiveSessionSnapshot,
} from "@adt/types"

interface SessionSocket {
  send(data: string): void
  close(code?: number, reason?: string): void
}

interface Connection {
  socket: SessionSocket
  participantId: string | null
  isHost: boolean
}

interface ParticipantState {
  id: string
  name: string
  score: number
  answers: Map<number, number>
}

interface SessionState {
  code: string
  hostToken: string
  quizzes: Quiz[]
  status: "lobby" | "question" | "reveal" | "finished"
  questionIndex: number
  participants: Map<string, ParticipantState>
  connections: Map<string, Connection>
  touchedAt: number
  hostCloseTimer: ReturnType<typeof setTimeout> | null
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
const SESSION_TTL_MS = 4 * 60 * 60 * 1000

function makeCode(): string {
  return Array.from(
    { length: 6 },
    () => CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]
  ).join("")
}

function serialize(message: QuizLiveServerMessage): string {
  return JSON.stringify(message)
}

export function createQuizLiveSessionService() {
  const sessions = new Map<string, SessionState>()

  function pruneExpired(): void {
    const cutoff = Date.now() - SESSION_TTL_MS
    for (const [code, session] of sessions) {
      if (session.touchedAt < cutoff) sessions.delete(code)
    }
  }

  function getSession(code: string): SessionState | null {
    pruneExpired()
    const session = sessions.get(code.toUpperCase()) ?? null
    if (session) session.touchedAt = Date.now()
    return session
  }

  function isConnected(session: SessionState, participantId: string): boolean {
    return Array.from(session.connections.values()).some(
      (connection) => connection.participantId === participantId
    )
  }

  function snapshot(
    session: SessionState,
    participantId: string | null = null
  ): QuizLiveSessionSnapshot {
    const quiz = session.quizzes[session.questionIndex]
    const showQuestion = session.status === "question" || session.status === "reveal"
    const showReveal = session.status === "reveal"
    const participants = Array.from(session.participants.values())
      .map((participant) => ({
        id: participant.id,
        name: participant.name,
        score: participant.score,
        answered: participant.answers.has(session.questionIndex),
        connected: isConnected(session, participant.id),
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

    const answerCounts = [0, 1, 2].map(
      (answerIndex) =>
        participants.filter(
          (participant) =>
            session.participants
              .get(participant.id)
              ?.answers.get(session.questionIndex) === answerIndex
        ).length
    ) as [number, number, number]

    return {
      code: session.code,
      status: session.status,
      questionIndex: session.questionIndex,
      questionCount: session.quizzes.length,
      participantCount: participants.length,
      participants,
      question:
        showQuestion && quiz
          ? {
              index: session.questionIndex,
              question: quiz.question,
              options: quiz.options.map((option) => option.text) as [
                string,
                string,
                string,
              ],
            }
          : null,
      reveal:
        showReveal && quiz
          ? {
              answerIndex: quiz.answerIndex,
              explanation: quiz.options[quiz.answerIndex]?.explanation ?? "",
              answerCounts,
            }
          : null,
      myAnswerIndex:
        participantId == null
          ? null
          : (session.participants
              .get(participantId)
              ?.answers.get(session.questionIndex) ?? null),
    }
  }

  function sendSnapshot(session: SessionState, connection: Connection): void {
    try {
      connection.socket.send(
        serialize({
          type: "snapshot",
          data: snapshot(session, connection.participantId),
        })
      )
    } catch {
      // The close callback will remove sockets that disappear mid-broadcast.
    }
  }

  function broadcast(session: SessionState): void {
    for (const connection of session.connections.values()) {
      sendSnapshot(session, connection)
    }
  }

  function sendError(connection: Connection, message: string): void {
    connection.socket.send(serialize({ type: "error", message }))
  }

  function closeParticipants(
    session: SessionState,
    reason: "removed" | "host-ended",
    participantId?: string
  ): void {
    for (const [connectionId, connection] of session.connections) {
      if (
        connection.isHost ||
        (participantId && connection.participantId !== participantId)
      ) {
        continue
      }
      try {
        connection.socket.send(serialize({ type: "closed", reason }))
        connection.socket.close(reason === "removed" ? 4403 : 4401, reason)
        session.connections.delete(connectionId)
      } catch {
        // The disconnect callback removes sockets that have already gone away.
      }
    }
  }

  return {
    create(quizzes: Quiz[]) {
      if (quizzes.length === 0) throw new Error("At least one quiz is required")
      pruneExpired()
      let code = makeCode()
      while (sessions.has(code)) code = makeCode()
      const session: SessionState = {
        code,
        hostToken: randomBytes(32).toString("base64url"),
        quizzes,
        status: "lobby",
        questionIndex: 0,
        participants: new Map(),
        connections: new Map(),
        touchedAt: Date.now(),
        hostCloseTimer: null,
      }
      sessions.set(code, session)
      return {
        code,
        hostToken: session.hostToken,
        snapshot: snapshot(session),
      }
    },

    getSnapshot(code: string): QuizLiveSessionSnapshot | null {
      const session = getSession(code)
      return session ? snapshot(session) : null
    },

    connect(code: string, socket: SessionSocket): string | null {
      const session = getSession(code)
      if (!session) return null
      const connectionId = randomUUID()
      const connection: Connection = {
        socket,
        participantId: null,
        isHost: false,
      }
      session.connections.set(connectionId, connection)
      sendSnapshot(session, connection)
      return connectionId
    },

    disconnect(code: string, connectionId: string): void {
      const session = getSession(code)
      if (!session) return
      const connection = session.connections.get(connectionId)
      session.connections.delete(connectionId)
      if (
        connection?.isHost &&
        !Array.from(session.connections.values()).some((item) => item.isHost)
      ) {
        if (session.hostCloseTimer) clearTimeout(session.hostCloseTimer)
        session.hostCloseTimer = setTimeout(() => {
          session.hostCloseTimer = null
          if (Array.from(session.connections.values()).some((item) => item.isHost)) {
            return
          }
          session.status = "finished"
          closeParticipants(session, "host-ended")
          sessions.delete(session.code)
        }, 1_500)
      }
      broadcast(session)
    },

    receive(code: string, connectionId: string, raw: string): void {
      const session = getSession(code)
      const connection = session?.connections.get(connectionId)
      if (!session || !connection) return

      let input: unknown
      try {
        input = JSON.parse(raw)
      } catch {
        sendError(connection, "Invalid message")
        return
      }
      const parsed = QuizLiveClientMessage.safeParse(input)
      if (!parsed.success) {
        sendError(connection, "Invalid message")
        return
      }

      const message = parsed.data
      if (message.type === "host-join") {
        if (message.hostToken !== session.hostToken) {
          sendError(connection, "Host access denied")
          return
        }
        connection.isHost = true
        if (session.hostCloseTimer) {
          clearTimeout(session.hostCloseTimer)
          session.hostCloseTimer = null
        }
        sendSnapshot(session, connection)
        return
      }

      if (message.type === "join") {
        const name = message.name.replace(/\s+/g, " ").trim()
        const existing = session.participants.get(message.participantId)
        if (existing) {
          existing.name = name
        } else {
          if (session.participants.size >= 100) {
            sendError(connection, "This live room is full")
            return
          }
          session.participants.set(message.participantId, {
            id: message.participantId,
            name,
            score: 0,
            answers: new Map(),
          })
        }
        connection.participantId = message.participantId
        broadcast(session)
        return
      }

      if (message.type === "answer") {
        if (session.status !== "question" || !connection.participantId) {
          sendError(connection, "Wait for the question to start")
          return
        }
        const participant = session.participants.get(connection.participantId)
        if (!participant) return
        if (!participant.answers.has(session.questionIndex)) {
          participant.answers.set(session.questionIndex, message.answerIndex)
          broadcast(session)
        }
        return
      }

      if (message.hostToken !== session.hostToken) {
        sendError(connection, "Host access denied")
        return
      }

      if (message.action === "kick") {
        if (!message.participantId) {
          sendError(connection, "Choose a participant to remove")
          return
        }
        session.participants.delete(message.participantId)
        closeParticipants(session, "removed", message.participantId)
      } else if (message.action === "start" && session.status === "lobby") {
        session.status = "question"
      } else if (
        message.action === "reveal" &&
        session.status === "question"
      ) {
        const quiz = session.quizzes[session.questionIndex]
        for (const participant of session.participants.values()) {
          if (participant.answers.get(session.questionIndex) === quiz.answerIndex) {
            participant.score += 100
          }
        }
        session.status = "reveal"
      } else if (message.action === "next" && session.status === "reveal") {
        if (session.questionIndex >= session.quizzes.length - 1) {
          session.status = "finished"
        } else {
          session.questionIndex += 1
          session.status = "question"
        }
      } else if (message.action === "end") {
        session.status = "finished"
        closeParticipants(session, "host-ended")
        sessions.delete(session.code)
      } else {
        sendError(connection, "That action is not available right now")
        return
      }
      broadcast(session)
    },
  }
}

export type QuizLiveSessionService = ReturnType<
  typeof createQuizLiveSessionService
>
