import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, List, Lock, MessageSquare, Settings, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { STORY_ACTS } from "./story-acts"
import { useStoryPlayer } from "./useStoryPlayer"

interface Point {
  x: number
  y: number
}

function CursorGlyph({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4 drop-shadow-sm" aria-hidden="true">
      <path
        d="M2 1.5 L2 13.5 L5.6 10.4 L8 15 L10.4 13.7 L8 9.3 L13 8.8 Z"
        fill={color}
        stroke="white"
        strokeWidth="1"
      />
    </svg>
  )
}

function Cursor({
  name,
  color,
  className,
  style,
}: {
  name: string
  color: string
  className: string
  style?: CSSProperties
}) {
  return (
    <div className={className} style={style}>
      <CursorGlyph color={color} />
      <span
        className="ml-3 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium leading-4 text-white shadow-sm"
        style={{ backgroundColor: color }}
      >
        {name}
      </span>
    </div>
  )
}

function useEnterCount(isActive: boolean): number {
  const [count, setCount] = useState(0)
  const wasActiveRef = useRef(isActive)

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      setCount((previous) => previous + 1)
    }
    wasActiveRef.current = isActive
  }, [isActive])

  return count
}

function typingStyle(
  prefersReducedMotion: boolean,
  length: number,
  durationMs: number,
): CSSProperties | undefined {
  if (prefersReducedMotion) return undefined
  return {
    display: "inline-block",
    overflow: "hidden",
    whiteSpace: "nowrap",
    verticalAlign: "bottom",
    width: 0,
    /* eslint-disable-next-line lingui/no-unlocalized-strings -- CSS animation shorthand */
    animation: `hero-typing-width ${durationMs}ms steps(${Math.max(length, 1)}, end) 150ms forwards`,
  }
}

export function PublishingHeroPreview() {
  const { t, i18n } = useLingui()
  const pageRef = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState<Point | null>(null)
  const [pin, setPin] = useState<Point | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const {
    activeAct,
    activeIndex,
    isSeized,
    isEnded,
    prefersReducedMotion,
    seize,
    release,
    jumpToAct,
  } = useStoryPlayer()

  const isLinkActive = activeAct.id === "link"
  const isPrivacyActive = activeAct.id === "privacy"
  const isCommentActive = activeAct.id === "comment"
  const isControlActive = activeAct.id === "control"
  const showThread = isCommentActive || isControlActive

  const linkEnterCount = useEnterCount(isLinkActive)
  const privacyEnterCount = useEnterCount(isPrivacyActive)
  const commentEnterCount = useEnterCount(isCommentActive)

  const addressText = t`adt-publish.your-school.workers.dev`
  const lockCode = t`K7M3PQ`
  const showStoryThread = showThread && !sidebarOpen && !isEnded
  const showResolved = isControlActive || isEnded

  const track = useCallback((event: React.MouseEvent) => {
    const bounds = pageRef.current?.getBoundingClientRect()
    if (!bounds) return
    setPointer({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
  }, [])

  const dropPin = useCallback((event: React.MouseEvent) => {
    const bounds = pageRef.current?.getBoundingClientRect()
    if (!bounds) return
    setPin({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
    setSidebarOpen(true)
  }, [])

  const handlePageEnter = useCallback(() => seize(), [seize])
  const handlePageLeave = useCallback(() => {
    setPointer(null)
    release()
  }, [release])

  const reviewerCursorOpacity = showThread ? (isSeized ? 0.35 : 1) : 0

  return (
    <div className="relative w-full max-w-[min(56rem,calc((100dvh-32rem)*1.5))] mh:max-w-2xl">
      <div aria-live="off" className="sr-only">
        <p>
          <Trans>
            A published book open in a web browser, playing through four short moments and then staying open to explore.
          </Trans>
        </p>
        <ul>
          {STORY_ACTS.map((act) => (
            <li key={act.id}>{i18n._(act.srDescriptionMsg)}</li>
          ))}
        </ul>
        <p>
          <Trans>Move your pointer over the page to pause the story and try pinning a comment yourself.</Trans>
        </p>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-8 -inset-y-5 rounded-[3rem] bg-gradient-to-b from-indigo-100/60 via-sky-50/30 to-transparent blur-2xl"
      />

      <div
        aria-hidden="true"
        className="relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-2xl shadow-indigo-950/[0.08] ring-1 ring-zinc-950/[0.03]"
      >
        <div className="relative flex items-center gap-1.5 border-b border-zinc-100 bg-zinc-50/80 px-4 py-2">
          <span className="size-2.5 rounded-full bg-[#f57970]" />
          <span className="size-2.5 rounded-full bg-[#fbc02d]" />
          <span className="size-2.5 rounded-full bg-[#57c454]" />
          <span
            className={cn(
              "absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-white px-3.5 py-1 text-[11px] leading-4 text-zinc-500 motion-safe:transition-all motion-safe:duration-500",
              isLinkActive && !isSeized
                ? "scale-[1.05] border-indigo-200 shadow-md shadow-indigo-500/10 ring-2 ring-indigo-100"
                : "border-zinc-200/80",
            )}
          >
            <Lock className="size-3 shrink-0 text-emerald-600" />
            <span className="relative inline-flex items-center">
              <span key={`address-${linkEnterCount}`} style={typingStyle(prefersReducedMotion, addressText.length, 1100)}>
                {addressText}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "ml-px inline-block h-3 w-px bg-zinc-400 motion-safe:animate-hero-caret-blink",
                  isLinkActive ? "opacity-100" : "opacity-0",
                )}
              />
            </span>
          </span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-zinc-900/90 px-2.5 py-1 text-[10px] font-medium leading-4 text-white">
            <span className="flex -space-x-1">
              <span className="size-3 rounded-full bg-[#ffb224] ring-1 ring-zinc-900" />
              <span className="size-3 rounded-full bg-[#f76808] ring-1 ring-zinc-900" />
            </span>
            <Trans>2 reading</Trans>
          </span>
        </div>

        <div
          ref={pageRef}
          onMouseMove={track}
          onMouseEnter={handlePageEnter}
          onMouseLeave={handlePageLeave}
          onClick={dropPin}
          className="relative cursor-none bg-white px-8 pb-4 pt-5 sm:px-10 mh:px-7 mh:pb-3 mh:pt-3.5"
        >
          <div className="relative">
          <div className="flex h-9 w-1/2 items-center rounded-md bg-sky-700 px-3.5 mh:h-7">
            <span className="text-[13px] font-bold tracking-wide text-white mh:text-[11px]">
              <Trans>THE WATER CYCLE</Trans>
            </span>
          </div>

          <div className="relative mt-4 w-fit mh:mt-2.5">
            <p className="text-[15px] font-semibold text-zinc-800 mh:text-[13px]">
              <Trans>Where does the rain come from?</Trans>
            </p>
            <button
              type="button"
              tabIndex={-1}
              key={`pin1-${commentEnterCount}`}
              onClick={(event) => {
                event.stopPropagation()
                setSidebarOpen((open) => !open)
              }}
              className={cn(
                "absolute -right-8 -top-2 size-6 cursor-none rounded-full text-[10px] font-semibold text-white shadow-md ring-2 ring-white motion-safe:transition-[background-color,opacity] motion-safe:duration-300",
                showThread ? "opacity-100" : "pointer-events-none opacity-0",
                showResolved ? "bg-emerald-600" : "bg-[#e5484d]",
                showThread && "motion-safe:animate-pin-pop",
              )}
            >
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center motion-safe:transition-opacity motion-safe:duration-200",
                  showResolved ? "opacity-0" : "opacity-100",
                )}
              >
                1
              </span>
              <Check
                aria-hidden="true"
                className={cn(
                  "absolute inset-0 m-auto size-3 motion-safe:transition-opacity motion-safe:duration-200",
                  showResolved ? "opacity-100" : "opacity-0",
                )}
              />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-[5fr_3fr] gap-5 mh:mt-2.5 mh:gap-4">
            <div className="flex flex-col gap-2.5 mh:gap-2">
              <div className="relative h-40 overflow-hidden rounded-lg border border-sky-100 bg-gradient-to-b from-sky-100 to-sky-50 mh:h-16">
                <span className="absolute right-5 top-4 size-9 rounded-full bg-amber-300 mh:right-4 mh:top-2 mh:size-5" />
                <span className="absolute -left-2 bottom-6 h-3.5 w-32 rounded-full bg-sky-200 mh:bottom-3 mh:h-2.5 mh:w-24" />
                <span className="absolute bottom-11 left-14 h-3.5 w-24 rounded-full bg-sky-200/80 mh:bottom-5 mh:left-10 mh:h-2.5 mh:w-16" />
                <span className="absolute bottom-2 left-20 h-3.5 w-36 rounded-full bg-sky-300/60 mh:hidden" />
              </div>
              <div className="h-3 w-full rounded bg-zinc-100 mh:h-2.5" />
              <div className="h-3 w-11/12 rounded bg-zinc-100 mh:h-2.5 mh:w-4/5" />
              <div className="h-3 w-4/5 rounded bg-zinc-100 mh:hidden" />
              <div className="h-3 w-5/6 rounded bg-zinc-100 mh:hidden" />
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 mh:gap-1.5 mh:p-2.5">
              <div className="h-3 w-1/2 rounded bg-amber-200/80 mh:h-2.5" />
              <div className="h-2.5 w-full rounded bg-amber-100 mh:h-2" />
              <div className="h-2.5 w-5/6 rounded bg-amber-100 mh:h-2" />
              <div className="h-2.5 w-3/4 rounded bg-amber-100 mh:hidden" />
              <div className="h-2.5 w-4/5 rounded bg-amber-100 mh:hidden" />
            </div>
          </div>

          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 z-20 flex flex-col gap-2.5 bg-white px-7 pt-3.5 sm:px-8 motion-safe:transition-opacity motion-safe:duration-500",
              isLinkActive && !isSeized ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="h-9 w-1/2 animate-pulse rounded-md bg-zinc-200 mh:h-7" />
            <div className="h-4 w-2/5 animate-pulse rounded bg-zinc-200 mh:h-3.5" />
            <div className="mt-1 grid grid-cols-[5fr_3fr] gap-5 mh:gap-4">
              <div className="flex flex-col gap-2.5 mh:gap-2">
                <div className="h-40 animate-pulse rounded-lg bg-zinc-100 mh:h-16" />
                <div className="h-3 w-full animate-pulse rounded bg-zinc-100 mh:h-2.5" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-zinc-100 mh:hidden" />
              </div>
              <div className="h-full min-h-16 animate-pulse rounded-lg bg-zinc-100" />
            </div>
          </div>

          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-white/50 backdrop-blur-[3px] motion-safe:transition-opacity motion-safe:duration-400",
              isPrivacyActive && !isSeized ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-lg">
              <Lock className="size-4 text-indigo-600" aria-hidden="true" />
              <span
                key={`lock-${privacyEnterCount}`}
                className="font-mono text-[15px] font-semibold tracking-[0.35em] text-zinc-800"
                style={typingStyle(prefersReducedMotion, lockCode.length, 900)}
              >
                {lockCode}
              </span>
              <p className="text-[10px] leading-4 text-zinc-500">
                <Trans>Only people with this code can open it</Trans>
              </p>
            </div>
          </div>
          </div>

          <div
            className={cn(
              "pointer-events-none absolute right-2 top-9 z-10 w-40 rounded-lg border bg-white/95 p-2 shadow-md backdrop-blur-sm motion-safe:transition-all motion-safe:duration-300",
              showStoryThread ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
              isControlActive ? "border-emerald-200" : "border-amber-200",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#ffb224] text-[8px] font-semibold text-white">
                M
              </span>
              <span className="text-[9px] font-semibold text-zinc-800">
                <Trans>Maria</Trans>
              </span>
              {isControlActive && (
                <span className="ml-auto flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-medium text-emerald-700 motion-safe:animate-hero-stamp">
                  <Check className="size-2.5" aria-hidden="true" />
                  <Trans>Resolved</Trans>
                </span>
              )}
            </div>
            <p className="mt-1 text-left text-[9px] leading-3.5 text-zinc-600">
              <Trans>Could this title be simpler for 2nd grade?</Trans>
            </p>
          </div>

          <Cursor
            name={t`Maria`}
            color="#ffb224"
            className={cn(
              "pointer-events-none absolute right-[24%] top-[46%] z-20",
              !prefersReducedMotion && "hero-cursor-approach",
            )}
            style={{
              opacity: reviewerCursorOpacity,
              transitionProperty: prefersReducedMotion ? "none" : "opacity",
              transitionDuration: prefersReducedMotion ? "0ms" : "300ms",
            }}
            key={`maria-${commentEnterCount}`}
          />
          <div
            className="pointer-events-none absolute bottom-[26%] left-[22%] z-20 motion-safe:transition-opacity motion-safe:duration-300 motion-safe:animate-cursor-float-b"
            style={{ opacity: reviewerCursorOpacity }}
          >
            <Cursor name={t`João`} color="#f76808" className="" />
          </div>

          {pin && (
            <span
              className="pointer-events-none absolute z-40 flex size-6 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full bg-indigo-600 text-[10px] font-semibold text-white shadow-md ring-2 ring-white motion-safe:animate-pin-pop"
              style={{ left: pin.x, top: pin.y, animationDelay: "0s" }}
            >
              2
            </span>
          )}

          <div className="relative z-10 mt-4 rounded-xl bg-zinc-900 px-4 py-2.5 text-zinc-300 mh:mt-2.5 mh:px-3.5 mh:py-2">
            <div className="flex items-center justify-between">
              <List className="size-3.5" />
              <span className="text-[10px] font-medium tabular-nums">14 / 65</span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  tabIndex={-1}
                  className="relative cursor-none"
                  onClick={(event) => {
                    event.stopPropagation()
                    setSidebarOpen((open) => !open)
                  }}
                >
                  <MessageSquare className="size-3.5" />
                  <span className="absolute -right-1.5 -top-1.5 flex size-3 items-center justify-center rounded-full bg-[#e5484d] text-[7px] font-bold text-white">
                    {pin ? 2 : 1}
                  </span>
                </button>
                <Settings className="size-3.5" />
              </span>
            </div>
          </div>

          {sidebarOpen && (
            <div
              onClick={(event) => event.stopPropagation()}
              className="absolute bottom-[5rem] right-0 top-0 z-40 mh:bottom-[4.5rem] flex w-[46%] max-w-60 flex-col gap-2.5 rounded-bl-xl border-b border-l border-zinc-200/80 bg-white/95 p-3 shadow-xl backdrop-blur-sm motion-safe:animate-in motion-safe:slide-in-from-right-4 motion-safe:fade-in-0 motion-safe:duration-200"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-800">
                  <Trans>Comments on this page</Trans>
                </span>
                <button
                  type="button"
                  tabIndex={-1}
                  className="cursor-none rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-700"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="size-3.5" />
                </button>
              </div>

              <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-200/80 bg-white p-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="flex size-4 items-center justify-center rounded-full bg-[#ffb224] text-[8px] font-semibold text-white">
                    M
                  </span>
                  <span className="text-[10px] font-semibold text-zinc-800">
                    <Trans>Maria</Trans>
                  </span>
                  <span className="text-[9px] text-zinc-400">
                    <Trans>just now</Trans>
                  </span>
                  {showResolved && (
                    <span className="ml-auto flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-medium text-emerald-700">
                      <Check className="size-2.5" aria-hidden="true" />
                      <Trans>Resolved</Trans>
                    </span>
                  )}
                </div>
                <p className="text-left text-[10px] leading-4 text-zinc-600">
                  <Trans>Could this title be simpler for 2nd grade?</Trans>
                </p>
              </div>

              {pin && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 p-2.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
                  <div className="flex items-center gap-1.5">
                    <span className="flex size-4 items-center justify-center rounded-full bg-indigo-600 text-[8px] font-semibold text-white">
                      <Trans>Y</Trans>
                    </span>
                    <span className="text-[10px] font-semibold text-zinc-800">
                      <Trans>You</Trans>
                    </span>
                    <span className="text-[9px] text-zinc-400">
                      <Trans>just now</Trans>
                    </span>
                  </div>
                  <p className="text-left text-[10px] italic leading-4 text-zinc-400">
                    <Trans>Your first comment goes here…</Trans>
                  </p>
                </div>
              )}
            </div>
          )}

          {pointer && (
            <div
              className="pointer-events-none absolute z-50"
              style={{ left: pointer.x, top: pointer.y }}
            >
              <CursorGlyph color="#4f46e5" />
              <span className="ml-3 inline-block rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-medium leading-4 text-white shadow-sm">
                <Trans>You</Trans>
              </span>
              {!pin && (
                <span className="ml-1.5 mt-1 block w-max rounded-full border border-zinc-200 bg-white/95 px-2 py-0.5 text-[10px] leading-4 text-zinc-500 shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
                  <Trans>Click to pin a comment</Trans>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        role="tablist"
        aria-label={t`Story chapters`}
        className="mt-2 flex items-center justify-center gap-2"
      >
        {STORY_ACTS.map((act, index) => (
          <button
            key={act.id}
            type="button"
            role="tab"
            aria-selected={index === activeIndex}
            aria-label={i18n._(act.captionMsg)}
            onClick={() => jumpToAct(index)}
            className={cn(
              "h-1.5 rounded-full motion-safe:transition-all motion-safe:duration-300",
              index === activeIndex
                ? "w-6 bg-indigo-600"
                : "w-1.5 bg-zinc-300 hover:bg-zinc-400",
            )}
          />
        ))}
      </div>
    </div>
  )
}
