import { randomBytes, randomInt, randomUUID } from "node:crypto"
import {
  PreviewLiveClientMessage,
  type PreviewLiveComment,
  type PreviewLiveServerMessage,
  type PreviewLiveSessionSnapshot,
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

interface Participant {
  id: string
  name: string
}

interface Session {
  code: string
  hostToken: string
  previewPath: string
  refreshToken: number
  participants: Map<string, Participant>
  comments: PreviewLiveComment[]
  connections: Map<string, Connection>
  touchedAt: number
  hostCloseTimer: ReturnType<typeof setTimeout> | null
}

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
const SESSION_TTL_MS = 4 * 60 * 60 * 1000

function makeCode(): string {
  return Array.from(
    { length: 6 },
    () => ALPHABET[randomInt(0, ALPHABET.length)]
  ).join("")
}

function serialize(message: PreviewLiveServerMessage): string {
  return JSON.stringify(message)
}

export function createPreviewLiveSessionService() {
  const sessions = new Map<string, Session>()

  const prune = () => {
    const cutoff = Date.now() - SESSION_TTL_MS
    for (const [code, session] of sessions) {
      if (session.touchedAt < cutoff) sessions.delete(code)
    }
  }

  const get = (code: string): Session | null => {
    prune()
    const session = sessions.get(code.toUpperCase()) ?? null
    if (session) session.touchedAt = Date.now()
    return session
  }

  const connected = (session: Session, participantId: string) =>
    Array.from(session.connections.values()).some(
      (connection) => connection.participantId === participantId
    )

  const snapshot = (session: Session): PreviewLiveSessionSnapshot => ({
    code: session.code,
    previewPath: session.previewPath,
    refreshToken: session.refreshToken,
    participants: Array.from(session.participants.values())
      .map((participant) => ({
        ...participant,
        connected: connected(session, participant.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    comments: [...session.comments].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    ),
  })

  const sendSnapshot = (session: Session, connection: Connection) => {
    try {
      connection.socket.send(
        serialize({ type: "snapshot", data: snapshot(session) })
      )
    } catch {
      // The close callback removes sockets that disappear during a broadcast.
    }
  }

  const broadcast = (session: Session) => {
    for (const connection of session.connections.values()) {
      sendSnapshot(session, connection)
    }
  }

  const sendError = (connection: Connection, message: string) => {
    connection.socket.send(serialize({ type: "error", message }))
  }

  const closeParticipants = (
    session: Session,
    reason: "removed" | "host-ended",
    participantId?: string
  ) => {
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
        // The socket is already closed.
      }
    }
  }

  return {
    create(previewPath: string) {
      prune()
      let code = makeCode()
      while (sessions.has(code)) code = makeCode()
      const session: Session = {
        code,
        hostToken: randomBytes(32).toString("base64url"),
        previewPath,
        refreshToken: 0,
        participants: new Map(),
        comments: [],
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

    getSnapshot(code: string) {
      const session = get(code)
      return session ? snapshot(session) : null
    },

    connect(code: string, socket: SessionSocket): string | null {
      const session = get(code)
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

    disconnect(code: string, connectionId: string) {
      const session = get(code)
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
          closeParticipants(session, "host-ended")
          sessions.delete(session.code)
        }, 1_500)
      }
      broadcast(session)
    },

    receive(code: string, connectionId: string, raw: string) {
      const session = get(code)
      const connection = session?.connections.get(connectionId)
      if (!session || !connection) return

      let input: unknown
      try {
        input = JSON.parse(raw)
      } catch {
        sendError(connection, "Invalid message")
        return
      }
      const parsed = PreviewLiveClientMessage.safeParse(input)
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
        const participant = session.participants.get(message.participantId)
        if (participant) participant.name = name
        else if (session.participants.size < 100) {
          session.participants.set(message.participantId, {
            id: message.participantId,
            name,
          })
        } else {
          sendError(connection, "This review room is full")
          return
        }
        connection.participantId = message.participantId
        broadcast(session)
        return
      }

      if (message.type === "comment") {
        if (!connection.participantId) {
          sendError(connection, "Join before leaving a comment")
          return
        }
        const participant = session.participants.get(connection.participantId)
        if (!participant) return
        session.comments.push({
          id: randomUUID(),
          participantId: participant.id,
          participantName: participant.name,
          text: message.text.trim(),
          pageId: message.pageId,
          pageHref: message.pageHref,
          sectionIndex: message.sectionIndex,
          createdAt: new Date().toISOString(),
          processed: false,
        })
        broadcast(session)
        return
      }

      if (message.type === "delete-comment") {
        if (!connection.participantId) {
          sendError(connection, "Join before deleting a comment")
          return
        }
        session.comments = session.comments.filter(
          (comment) =>
            comment.id !== message.commentId ||
            comment.participantId !== connection.participantId
        )
        broadcast(session)
        return
      }

      if (message.hostToken !== session.hostToken) {
        sendError(connection, "Host access denied")
        return
      }
      if (message.action === "kick" && message.participantId) {
        session.participants.delete(message.participantId)
        closeParticipants(session, "removed", message.participantId)
      } else if (message.action === "mark-processed") {
        const ids = new Set(message.commentIds ?? [])
        session.comments = session.comments.map((comment) =>
          ids.has(comment.id) ? { ...comment, processed: true } : comment
        )
      } else if (message.action === "delete-comments") {
        const ids = new Set(message.commentIds ?? [])
        session.comments = session.comments.filter((comment) => !ids.has(comment.id))
      } else if (message.action === "refresh-preview") {
        if (!message.previewVersion) {
          sendError(connection, "A preview version is required")
          return
        }
        session.previewPath = session.previewPath.replace(
          /\/v-[^/]+\//,
          `/v-${encodeURIComponent(message.previewVersion)}/`
        )
        session.refreshToken += 1
      } else if (message.action === "end") {
        closeParticipants(session, "host-ended")
        sessions.delete(session.code)
      } else {
        sendError(connection, "That action is not available")
        return
      }
      broadcast(session)
    },
  }
}

export type PreviewLiveSessionService = ReturnType<
  typeof createPreviewLiveSessionService
>
