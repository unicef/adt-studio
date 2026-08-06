import { useAtomValue, useSetAtom, useStore } from "jotai"
import { useEffect, useRef } from "react"
import { currentSectionIdAtom } from "@/features/navigation/state/nav.atoms"
import { devicePreviewAtom, type DevicePreview } from "@/shared/state/ui.atoms"
import { anchorFromPoint } from "@/features/comments/lib/anchor"
import {
  applyCommentFrame,
  applyCursor,
  cursorFromFrame,
  pruneCursors,
} from "@/features/comments/lib/presence"
import { isCommentEvent, ROOM_CURSOR_THROTTLE_MS } from "@/features/comments/lib/room-protocol"
import { createRoomSocket, type RoomSocket } from "@/features/comments/lib/room-socket"
import type { CommentsRuntimeContext } from "@/features/comments/hooks/useCommentsContext"
import {
  commentsAtom,
  settlingPinIdAtom,
  showResolvedAtom,
} from "@/features/comments/state/comments.atoms"
import {
  peerCursorsAtom,
  roomPeersAtom,
  roomStatusAtom,
  selfPeerIdAtom,
} from "@/features/comments/state/presence.atoms"

/** How often dead cursors are swept. Coarse on purpose: it is a fallback for peers who stopped
 *  reporting, not the mechanism that makes a moving cursor smooth. */
const PRUNE_INTERVAL_MS = 1000

function roomUrl(apiBase: string): string | null {
  if (typeof window === "undefined") return null
  try {
    const url = new URL(`${apiBase}room`, window.location.href)
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:"
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Live cursors and live pins for the published reader.
 *
 * One socket per document (each page turn is a reload, so the room sees a leave and a join —
 * cheap, and it keeps the roster's page column honest without any extra protocol).
 *
 * **Cursors are sent whenever the tab is visible, not only in comment mode.** Figma shows who
 * is where regardless of what tool anyone is holding, and that is most of the value: a teacher
 * and a reviewer reading the same page want to see each other move. Comment mode stays what it
 * always was — the thing that turns a click into a pin.
 *
 * Reads go through the jotai store directly rather than through subscribed values: this hook
 * mutates state in socket callbacks that outlive several renders, and a captured `comments`
 * array would apply every frame to a stale list.
 */
export function usePresenceRoom(context: CommentsRuntimeContext | null): void {
  const store = useStore()
  const sectionId = useAtomValue(currentSectionIdAtom)
  const device = useAtomValue(devicePreviewAtom) as DevicePreview
  const setStatus = useSetAtom(roomStatusAtom)
  const setPeers = useSetAtom(roomPeersAtom)
  const setSelfId = useSetAtom(selfPeerIdAtom)
  const setCursors = useSetAtom(peerCursorsAtom)
  const setComments = useSetAtom(commentsAtom)
  const setSettling = useSetAtom(settlingPinIdAtom)

  const socketRef = useRef<RoomSocket | null>(null)
  const sectionRef = useRef<string | null>(sectionId ?? null)
  sectionRef.current = sectionId ?? null
  const deviceRef = useRef<DevicePreview>(device)
  deviceRef.current = device

  useEffect(() => {
    if (!context) return
    const url = roomUrl(context.apiBase)
    if (url === null) return

    const socket = createRoomSocket({
      resolveUrl: async () => url,
      onStatus: (status) => setStatus(status),
      onOpen: () => {
        socket.send({ t: "hello", section_id: sectionRef.current, device: deviceRef.current })
      },
      onFrame: (frame) => {
        if (frame.t === "presence") {
          setSelfId(frame.self_id)
          setPeers(frame.peers)
          const ids = new Set(frame.peers.map((peer) => peer.id))
          setCursors((cursors) => pruneCursors(cursors, Date.now(), ids))
          return
        }

        if (frame.t === "cursor") {
          setCursors((cursors) => applyCursor(cursors, cursorFromFrame(frame, Date.now())))
          return
        }

        if (!isCommentEvent(frame.t)) return

        const outcome = applyCommentFrame(store.get(commentsAtom), frame.comment, {
          sectionId: sectionRef.current,
          showResolved: store.get(showResolvedAtom) as boolean,
        })
        if (!outcome.changed) return
        setComments(outcome.comments)
        if (outcome.arrivedRootId !== null) setSettling(outcome.arrivedRootId)
      },
    })

    socketRef.current = socket

    return () => {
      socketRef.current = null
      socket.close()
      setStatus("closed")
      setPeers([])
      setSelfId(null)
      setCursors([])
    }
  }, [context, setComments, setCursors, setPeers, setSelfId, setSettling, setStatus, store])

  /** A page turn is normally a reload, but the runtime also swaps sections in place in some
   *  layouts, so the room is told either way. */
  useEffect(() => {
    socketRef.current?.send({ t: "page", section_id: sectionId ?? null })
  }, [sectionId])

  /** The width this reader is at, so anybody following them can match it. Its own frame: a
   *  reader can resize without turning a page for an hour. */
  useEffect(() => {
    socketRef.current?.send({ t: "device", device })
  }, [device])

  useEffect(() => {
    if (!context) return

    let lastSentAt = 0
    let pending: { x: number; y: number } | null = null
    let timer: number | null = null

    const flush = (): void => {
      timer = null
      const point = pending
      pending = null
      if (!point) return
      if (document.visibilityState === "hidden") return
      const section = sectionRef.current
      if (section === null) return

      const anchor = anchorFromPoint(point.x, point.y)
      if (!anchor) return

      lastSentAt = Date.now()
      socketRef.current?.send({
        t: "cursor",
        section_id: section,
        selector: anchor.selector,
        xOffsetPct: anchor.xOffsetPct,
        yOffsetPct: anchor.yOffsetPct,
      })
    }

    const onPointerMove = (event: PointerEvent): void => {
      pending = { x: event.clientX, y: event.clientY }
      if (timer !== null) return
      const wait = Math.max(0, ROOM_CURSOR_THROTTLE_MS - (Date.now() - lastSentAt))
      timer = window.setTimeout(flush, wait)
    }

    document.addEventListener("pointermove", onPointerMove, { passive: true })
    return () => {
      document.removeEventListener("pointermove", onPointerMove)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [context])

  useEffect(() => {
    if (!context) return
    const interval = window.setInterval(() => {
      setCursors((cursors) =>
        pruneCursors(cursors, Date.now(), new Set(store.get(roomPeersAtom).map((peer) => peer.id))),
      )
    }, PRUNE_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [context, setCursors, store])
}
