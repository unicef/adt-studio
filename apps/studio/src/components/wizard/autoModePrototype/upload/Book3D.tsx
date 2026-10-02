import { useState } from "react"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import "./upload.css"

/**
 * The cover as a standing hardback: front face, darkened back board and a page block. Purely visual:
 * the depth follows the book's drawn size, never the PDF. Landscape covers stand at a shallower
 * angle, as on the publish access page. Settles on mount and turns toward the reader on hover.
 */
const RASTER = 2

export function Book3D({ src, alt = "", height = 270, maxWidth = 280, settle, className }: { src?: string; alt?: string; height?: number; maxWidth?: number; settle?: boolean; className?: string }) {
  const [ratio, setRatio] = useState<number | null>(null)
  const r = ratio ?? 0.72
  const h = Math.min(height, maxWidth / r)
  const w = h * r
  const t = Math.max(8, Math.round(h * 0.1)) * RASTER
  const wide = r > 1
  return (
    <div className={cn("am-book-stand relative", className)} style={{ width: w, height: h }}>
      <div aria-hidden className="am-book-floor" />
      <div className="am-book-tilt">
        <div className={cn("am-book", wide && "am-book-wide", settle && "am-book-settle")} style={{ width: w * RASTER, height: h * RASTER }}>
          <div className="am-book-back" style={{ transform: `translateZ(${-t / 2}px)`, backgroundImage: src ? `url(${src})` : undefined }} />
          <div className="am-book-pages" style={{ width: t, top: 4 * RASTER, bottom: 4 * RASTER, transform: `translateX(${t / 2 - 4 * RASTER}px) rotateY(90deg)` }} />
          <div className="am-book-front size-full" style={{ transform: `translateZ(${t / 2}px)` }}>
            {src ? (
              <img src={src} alt={alt} onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} className="block size-full" />
            ) : (
              <div className="am-book-blank grid size-full place-items-center">
                <Sparkles className="size-14 text-brand-300" />
              </div>
            )}
            <span aria-hidden className="am-book-hinge" />
            <span aria-hidden className="am-book-gloss" />
          </div>
        </div>
      </div>
    </div>
  )
}
