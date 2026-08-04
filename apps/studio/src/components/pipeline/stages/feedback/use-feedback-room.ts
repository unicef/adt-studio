import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { PUBLICATION_ROOM_TICKET_PARAM, type RoomPeer } from "@adt/types"
import { api, type PublishCommentListResponse } from "@/api/client"
import { publicationCommentsKey } from "@/hooks/use-publication-feedback"
import {
  applyCursor,
  createRoomSocket,
  otherPeers as othersOf,
  pruneCursors,
  upsertComment,
  visibleCursors,
  type ReviewerCursor,
  type RoomSocket,
  type RoomStatus,
  type VisibleCursor,
} from "./lib/room"

const PRUNE_INTERVAL_MS = 1000

export interface FeedbackRoom {
  status: RoomStatus
  /** Everyone but the author — the roster includes the author's own socket. */
  peers: RoomPeer[]
  cursorsFor: (sectionId: string | null) => VisibleCursor[]
}

/**
 * The author's seat in the publication's realtime room.
 *
 * **The author's own cursor is never broadcast.** The Studio sends `hello` and `page`, and it
 * never sends `cursor`. In the feedback loop the author is *reading* — draining threads,
 * resolving, replying — not pointing at a page beside a reviewer, and a cursor labelled with the
 * author's name drifting over a book someone is being asked to review would be a distraction the
 * reviewer did not sign up for. If joint review sessions turn out to want it, the frame already
 * exists and one `send` turns it on.
 *
 * The credential is a 60-second ticket, fetched again before every connection attempt — which is
 * exactly why the socket takes a `resolveUrl` thunk rather than a URL. A reconnect after an hour
 * asleep gets a fresh ticket; a stale one is never retried.
 */
export function useFeedbackRoom(
  bookLabel: string,
  enabled: boolean,
  sectionId: string | null,
): FeedbackRoom {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<RoomStatus>("idle")
  const [peers, setPeers] = useState<RoomPeer[]>([])
  const [selfId, setSelfId] = useState<string | null>(null)
  const [cursors, setCursors] = useState<ReviewerCursor[]>([])

  const socketRef = useRef<RoomSocket | null>(null)
  const sectionRef = useRef<string | null>(sectionId)
  sectionRef.current = sectionId
  const peersRef = useRef<RoomPeer[]>([])
  peersRef.current = peers

  useEffect(() => {
    if (!enabled) return

    const socket = createRoomSocket({
      resolveUrl: async () => {
        const { ticket, ws_url } = await api.createPublicationRoomTicket(bookLabel)
        const url = new URL(ws_url)
        url.searchParams.set(PUBLICATION_ROOM_TICKET_PARAM, ticket)
        return url.toString()
      },
      onStatus: setStatus,
      onOpen: () => {
        socket.send({ t: "hello", section_id: sectionRef.current })
      },
      onFrame: (frame) => {
        if (frame.t === "presence") {
          setSelfId(frame.self_id)
          setPeers(frame.peers)
          const ids = new Set(frame.peers.map((peer) => peer.id))
          setCursors((current) => pruneCursors(current, Date.now(), ids))
          return
        }

        if (frame.t === "cursor") {
          setCursors((current) =>
            applyCursor(current, {
              peerId: frame.peer_id,
              sectionId: frame.section_id,
              selector: frame.selector,
              xOffsetPct: frame.xOffsetPct,
              yOffsetPct: frame.yOffsetPct,
              at: Date.now(),
            }),
          )
          return
        }

        /** Straight into the cache. The panel, the pins and the unresolved badge all read the
         *  one query, so one upsert moves all three without a request. */
        queryClient.setQueryData<PublishCommentListResponse>(
          publicationCommentsKey(bookLabel),
          (previous) =>
            previous === undefined
              ? previous
              : { ...previous, comments: upsertComment(previous.comments, frame.comment) },
        )
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
  }, [bookLabel, enabled, queryClient])

  /** The room routes cursors by page, so it has to be told when the frame moves. */
  useEffect(() => {
    socketRef.current?.send({ t: "page", section_id: sectionId })
  }, [sectionId])

  useEffect(() => {
    if (!enabled) return
    const interval = window.setInterval(() => {
      setCursors((current) =>
        pruneCursors(current, Date.now(), new Set(peersRef.current.map((peer) => peer.id))),
      )
    }, PRUNE_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [enabled])

  const cursorsFor = useCallback(
    (sectionId: string | null) =>
      visibleCursors(cursors, peers, selfId, sectionId, Date.now()),
    [cursors, peers, selfId],
  )

  const others = useMemo(() => othersOf(peers, selfId), [peers, selfId])

  return { status, peers: others, cursorsFor }
}
