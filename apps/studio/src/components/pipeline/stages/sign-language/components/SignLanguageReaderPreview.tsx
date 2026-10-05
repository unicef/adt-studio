import { Hand, Video as VideoIcon } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export function SignLanguageReaderPreview({
  hasAnyVideo,
}: {
  hasAnyVideo: boolean
}) {
  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden ">
      <div className="flex h-full w-full flex-col gap-3 px-5 py-5">
        {/* Header eyebrow */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <Hand className="h-3.5 w-3.5 text-cyan-700" strokeWidth={2} aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] leading-none text-cyan-700">
              <Trans>Reader View</Trans>
            </span>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] leading-none text-cyan-500/80">
            <Trans>Sample</Trans>
          </span>
        </div>

        {/* Mock page */}
        <div className="relative flex-1 min-h-0 overflow-hidden rounded-lg border border-border bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-2.5">
            <div className="h-2.5 w-32 rounded-full bg-secondary" />
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="h-1.5 w-full rounded-full bg-muted" />
              <div className="h-1.5 w-11/12 rounded-full bg-muted" />
              <div className="h-1.5 w-10/12 rounded-full bg-muted" />
              <div className="h-1.5 w-3/4 rounded-full bg-muted" />
            </div>
            <div className="mt-2 h-20 rounded-md bg-gradient-to-br from-cyan-100/70 via-sky-100/70 to-indigo-100/70" />
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="h-1.5 w-full rounded-full bg-muted" />
              <div className="h-1.5 w-11/12 rounded-full bg-muted" />
              <div className="h-1.5 w-9/12 rounded-full bg-muted" />
              <div className="h-1.5 w-4/5 rounded-full bg-muted" />
            </div>
          </div>

          {/* Floating sign-language PIP */}
          <div
            className={cn(
              "absolute bottom-3 right-3 flex w-[88px] flex-col gap-1.5 rounded-lg border border-cyan-200 bg-background p-1.5 shadow-[0_8px_20px_-12px_rgba(8,145,178,0.5)]",
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-500",
            )}
          >
            <div className="relative aspect-[3/4] overflow-hidden rounded bg-gradient-to-b from-cyan-200/50 to-cyan-50">
              {/* Stylized hand / figure */}
              <div className="absolute inset-0 flex items-center justify-center">
                <Hand
                  className="h-9 w-9 text-cyan-700"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </div>
              {/* Live dot */}
              <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded-full bg-black/55 px-1 py-px">
                <span className="relative flex h-1 w-1">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-1 w-1 rounded-full bg-rose-500" />
                </span>
                <span className="text-[7px] font-semibold uppercase leading-none tracking-wider text-white">
                  <Trans>Live</Trans>
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between px-0.5">
              <VideoIcon
                className="h-2.5 w-2.5 text-cyan-700"
                strokeWidth={2}
                aria-hidden
              />
              <span className="text-[8px] font-medium uppercase tracking-wider text-cyan-700">
                <Trans>Sign</Trans>
              </span>
            </div>
          </div>
        </div>

        {/* Footer state pill */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-[10.5px] transition-colors",
            hasAnyVideo
              ? "bg-cyan-50 text-cyan-700"
              : "bg-[#f5f5f5] text-[#737373]",
          )}
        >
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              hasAnyVideo ? "bg-cyan-500" : "bg-[#a3a3a3]",
            )}
            aria-hidden
          />
          {hasAnyVideo ? (
            <Trans>Reader will play the video matched to each section.</Trans>
          ) : (
            <Trans>Upload at least one video to see it appear here.</Trans>
          )}
        </div>
      </div>
    </div>
  )
}
