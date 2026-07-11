import { useCallback, useEffect, useRef, useState } from "react"
import type {
  PreviewLiveClientMessage,
  PreviewLiveServerMessage,
  PreviewLiveSessionSnapshot,
} from "@adt/types"
import { getPreviewLiveWebSocketUrl } from "@/api/client"

export function usePreviewLiveSocket(code: string | null) {
  const socketRef = useRef<WebSocket | null>(null)
  const [snapshot, setSnapshot] = useState<PreviewLiveSessionSnapshot | null>(null)
  const [connectionState, setConnectionState] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting")
  const [error, setError] = useState<
    "session" | "not-found" | "removed" | "host-ended" | null
  >(null)

  useEffect(() => {
    setSnapshot(null)
    setError(null)
    setConnectionState("connecting")
    if (!code) return
    let active = true
    let retryTimer: number | undefined
    let retryCount = 0

    const connect = () => {
      if (!active) return
      const socket = new WebSocket(getPreviewLiveWebSocketUrl(code))
      socketRef.current = socket
      setConnectionState("connecting")
      socket.addEventListener("open", () => {
        retryCount = 0
        setConnectionState("connected")
      })
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data)) as PreviewLiveServerMessage
          if (message.type === "snapshot") {
            setSnapshot(message.data)
            setError(null)
          } else if (message.type === "closed") {
            setError(message.reason)
            active = false
            socket.close()
          } else setError("session")
        } catch {
          setError("session")
        }
      })
      socket.addEventListener("close", (event) => {
        if (!active) return
        setConnectionState("disconnected")
        if (event.code === 4404 || event.code === 4403 || event.code === 4401) {
          setError(
            event.code === 4404
              ? "not-found"
              : event.code === 4403
                ? "removed"
                : "host-ended",
          )
          active = false
          return
        }
        retryCount += 1
        retryTimer = window.setTimeout(
          connect,
          Math.min(1_000 * 2 ** (retryCount - 1), 10_000),
        )
      })
    }

    connect()
    return () => {
      active = false
      if (retryTimer) window.clearTimeout(retryTimer)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [code])

  const send = useCallback((message: PreviewLiveClientMessage) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false
    socketRef.current.send(JSON.stringify(message))
    return true
  }, [])

  return { snapshot, connectionState, error, send }
}
