import { useEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"

/** Preserve the selected proof viewport even when comparing two pages side by side. */
export function ProofFrame({ srcDoc, width }: { srcDoc: string; width: number }) {
  const { t } = useLingui()
  const host = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [available, setAvailable] = useState(width)
  const [height, setHeight] = useState(760)
  const scale = Math.min(1, available / width)
  useEffect(() => {
    if (!host.current) return
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width))
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  const measure = () => {
    const doc = frame.current?.contentDocument
    const content = doc?.querySelector(".pub-page")
    if (content) setHeight(Math.max(760, Math.ceil(content.getBoundingClientRect().height)))
  }
  return <div ref={host} className="max-h-[720px] w-full overflow-auto">
    <div className="relative mx-auto" style={{ width: width * scale, height: height * scale }}>
      <iframe ref={frame} title={t`Templated page preview`} sandbox="allow-same-origin" srcDoc={srcDoc}
        className="absolute left-0 top-0 origin-top-left border-0 bg-white"
        style={{ width, height, transform: `scale(${scale})` }}
        onLoad={() => {
          measure()
          const doc = frame.current?.contentDocument
          void doc?.fonts.ready.then(measure)
          doc?.querySelectorAll("img").forEach((img) => { if (!img.complete) img.addEventListener("load", measure, { once: true }) })
        }}
      />
    </div>
  </div>
}
