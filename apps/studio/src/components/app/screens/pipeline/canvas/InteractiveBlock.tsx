import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { bridgeIframeKeys } from "./iframeKeyBridge"
import { SectionSkeleton } from "./PageSkeleton"

export interface InteractiveBlockProps {
  src: string
  frameTitle: string
  frameWidth: number
  frameHeight: number
  displayWidth: number
  animateHeight?: boolean
  className?: string
}

const HEIGHT_SETTLE_MS = 180
const REVEAL_TIMEOUT_MS = 1500

const measuredHeights = new Map<string, number>()
const MEASURED_CAP = 60

let lastSettledHeight: number | null = null

function rememberHeight(src: string, height: number): void {
  measuredHeights.delete(src)
  measuredHeights.set(src, height)
  if (measuredHeights.size > MEASURED_CAP) {
    measuredHeights.delete(measuredHeights.keys().next().value as string)
  }
  lastSettledHeight = height
}

function startingHeight(src: string): number | null {
  return measuredHeights.get(src) ?? lastSettledHeight
}

export function InteractiveBlock({
  src,
  frameTitle,
  frameWidth,
  frameHeight,
  displayWidth,
  animateHeight = true,
  className,
}: InteractiveBlockProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState<number | null>(() => startingHeight(src))
  const [ready, setReady] = useState(() => measuredHeights.has(src))
  const scale = displayWidth / frameWidth

  useEffect(() => {
    setHeight(startingHeight(src))
    setReady(measuredHeights.has(src))
  }, [src])

  const [canAnimate, setCanAnimate] = useState(() => measuredHeights.has(src))
  useEffect(() => {
    if (!ready) {
      setCanAnimate(false)
      return
    }
    const frame = requestAnimationFrame(() => setCanAnimate(true))
    return () => cancelAnimationFrame(frame)
  }, [ready])

  useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | undefined
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as { type?: unknown; height?: unknown } | null
      if (!data || data.type !== "adt-preview:height") return
      if (typeof data.height !== "number" || data.height <= 0) return
      const next = Math.ceil(data.height)
      clearTimeout(settle)
      settle = setTimeout(() => {
        rememberHeight(src, next)
        setHeight(next)
        setReady(true)
      }, HEIGHT_SETTLE_MS)
    }
    window.addEventListener("message", onMessage)
    return () => {
      clearTimeout(settle)
      window.removeEventListener("message", onMessage)
    }
  }, [src])

  const revealTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(revealTimeout.current), [])

  const unbridge = useRef<() => void>(undefined)
  useEffect(() => () => unbridge.current?.(), [])

  return (
    <div className={cn("relative overflow-hidden bg-card", className)}>
      <div
        className={cn(
          "overflow-hidden",
          canAnimate && animateHeight && "transition-[height] duration-200 ease-out",
        )}
        style={{ height: Math.round((height ?? frameHeight) * scale) }}
      >
        <iframe
          ref={frameRef}
          src={src}
          title={frameTitle}
          onLoad={(event) => {
            clearTimeout(revealTimeout.current)
            if (measuredHeights.has(src)) {
              setReady(true)
            } else {
              revealTimeout.current = setTimeout(() => setReady(true), REVEAL_TIMEOUT_MS)
            }
            unbridge.current?.()
            unbridge.current = bridgeIframeKeys(event.currentTarget)
          }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          style={{
            width: frameWidth,
            height: height ?? frameHeight,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
          className={cn(
            "block border-0 bg-white duration-200",
            ready ? "animate-in fade-in-0" : "invisible",
          )}
        />
      </div>
      {!ready && <SectionSkeleton className="absolute inset-0 rounded-none border-0" />}
    </div>
  )
}
