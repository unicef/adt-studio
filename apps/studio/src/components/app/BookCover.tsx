import { useState } from "react"
import { Image } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { CoverSpec } from "./data"

export interface BookCoverProps {
  title: string
  author: string
  cover: CoverSpec
  fit?: "contain" | "cover"
}

export function BookCover({ title, author, cover, fit = "contain" }: BookCoverProps) {
  const { t } = useLingui()
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const imageSrc = cover.src && cover.src !== failedSrc ? cover.src : null

  return (
    <div
      style={{
        containerType: "size",
        background: cover.bg,
        color: cover.fg,
      }}
      className="w-full h-full relative overflow-hidden border font-sans rounded-lg"
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={t`Cover of ${title}`}
          loading="lazy"
          onError={() => setFailedSrc(imageSrc)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: fit,
            background: "var(--muted)",
          }}
        />
      ) : cover.placeholder ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "#eef0f2",
            color: "#b6bcc6",
          }}
        >
          <Image style={{ width: "30cqi", height: "30cqi", maxWidth: 30, maxHeight: 30 }} />
        </div>
      ) : (
        <>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "4cqi", background: cover.accent }} />
          <div
            style={{
              position: "absolute",
              right: "-16cqi",
              top: "-16cqi",
              width: "52cqi",
              height: "52cqi",
              borderRadius: "50%",
              background: cover.accent,
              opacity: 0.18,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "13cqi",
              right: "9cqi",
              bottom: "30cqi",
              height: "0.7cqi",
              background: cover.accent,
              opacity: 0.9,
            }}
          />
          <div
            style={{
              position: "relative",
              height: "100%",
              padding: "9cqi 9cqi 9cqi 13cqi",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: "clamp(0px, 4.4cqi, 11px)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                opacity: 0.82,
              }}
            >
              {cover.publisherShort}
            </div>
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "clamp(0px, 12.5cqi, 30px)",
                  lineHeight: 1.03,
                  letterSpacing: "-0.01em",
                }}
              >
                {title}
              </div>
              <div style={{ fontSize: "clamp(0px, 5cqi, 13px)", opacity: 0.8, marginTop: "3.4cqi" }}>
                {author}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
