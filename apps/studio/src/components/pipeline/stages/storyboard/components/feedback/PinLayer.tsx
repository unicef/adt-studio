import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Avatar } from "./CommentThread"
import { clusterPins, type PinCluster } from "./storyboard-pins"
import { isPlaced, type SectionComments } from "./use-section-comments"

// eslint-disable-next-line lingui/no-unlocalized-strings -- a media query, not user text
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

/**
 * The pins, drawn over the preview. Pins that would cover each other become one marker with a
 * count; the open comment's element gets an outline, so the author sees *what* was meant, not
 * just where the dot is. Opening a comment from elsewhere scrolls its pin into view.
 */
export function PinLayer({
  comments,
  containerRef,
}: {
  comments: SectionComments
  containerRef: RefObject<HTMLElement | null>
}) {
  const { t } = useLingui()
  const clusters = useMemo(() => clusterPins(comments.placed), [comments.placed])
  const [openCluster, setOpenCluster] = useState<string | null>(null)
  const selectedId = comments.selected?.thread.root.id ?? null
  const selectedPin = comments.selected && isPlaced(comments.selected) ? comments.selected : null

  /** Bring the open comment's pin into view once, each time a different one opens. */
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedPin || scrolledFor.current === selectedPin.thread.root.id) return
    const container = containerRef.current
    const scroller = container ? scrollParent(container) : null
    if (!container || !scroller) return
    scrolledFor.current = selectedPin.thread.root.id
    const top = container.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    const target = top + selectedPin.y - scroller.clientHeight / 3
    const visible = top + selectedPin.y > scroller.scrollTop + 40 && top + selectedPin.y < scroller.scrollTop + scroller.clientHeight - 120
    if (!visible) scroller.scrollTo({ top: Math.max(0, target), behavior: window.matchMedia(REDUCED_MOTION).matches ? "auto" : "smooth" })
  }, [containerRef, selectedPin])
  useEffect(() => {
    if (selectedId === null) scrolledFor.current = null
  }, [selectedId])

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {selectedPin ? (
        <span
          key={selectedPin.thread.root.id}
          aria-hidden="true"
          style={{
            left: selectedPin.box.left - 4,
            top: selectedPin.box.top - 4,
            width: selectedPin.box.width + 8,
            height: selectedPin.box.height + 8,
          }}
          className="absolute rounded-md ring-2 ring-brand-500 motion-safe:animate-[feedback-pin-flash_1.8s_ease-out_forwards] motion-reduce:opacity-40"
        />
      ) : null}

      {clusters.map((cluster) =>
        cluster.pins.length === 1 ? (
          <Pin key={cluster.id} comments={comments} pin={cluster.pins[0]} selected={cluster.pins[0].thread.root.id === selectedId} />
        ) : (
          <Cluster
            key={cluster.id}
            cluster={cluster}
            comments={comments}
            selectedId={selectedId}
            open={openCluster === cluster.id}
            onToggle={() => setOpenCluster((current) => (current === cluster.id ? null : cluster.id))}
            label={t`${cluster.pins.length} comments here`}
          />
        ),
      )}
    </div>
  )
}

function Pin({ comments, pin, selected }: { comments: SectionComments; pin: SectionComments["placed"][number]; selected: boolean }) {
  const { t } = useLingui()
  return (
    <button
      type="button"
      data-testid={`storyboard-pin-${pin.thread.root.id}`}
      aria-label={t`Comment by ${pin.thread.root.author_name}`}
      aria-pressed={selected}
      onClick={() => comments.select(selected ? null : pin.thread.root.id)}
      style={{ left: pin.x, top: pin.y, backgroundColor: pin.thread.root.author_color }}
      className={cn(
        "pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none font-bold text-white shadow-md ring-2 ring-white",
        "transition-[transform,width,height] duration-150 hover:scale-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 motion-reduce:transition-none",
        selected ? "z-10 size-8 text-xs ring-4 ring-brand-200" : "size-6 text-[11px]",
        pin.thread.resolved && !selected && "opacity-50 saturate-50",
      )}
    >
      {pin.label}
    </button>
  )
}

function Cluster({
  cluster,
  comments,
  selectedId,
  open,
  onToggle,
  label,
}: {
  cluster: PinCluster
  comments: SectionComments
  selectedId: string | null
  open: boolean
  onToggle: () => void
  label: string
}) {
  const holdsSelected = cluster.pins.some((pin) => pin.thread.root.id === selectedId)
  const first = cluster.pins[0]
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={onToggle}
        style={{ left: cluster.x, top: cluster.y, backgroundColor: first.thread.root.author_color }}
        className={cn(
          "pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none font-bold text-white shadow-md ring-2 ring-white",
          "transition-[transform,width,height] duration-150 hover:scale-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 motion-reduce:transition-none",
          holdsSelected ? "z-10 size-8 text-xs ring-4 ring-brand-200" : "size-7 text-[11px]",
        )}
      >
        {first.label}
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold tabular-nums text-background ring-2 ring-white">
          {cluster.pins.length}
        </span>
      </button>
      {open ? (
        <ul
          style={{ left: cluster.x + 18, top: cluster.y - 18 }}
          className="pointer-events-auto absolute z-30 flex w-60 list-none flex-col gap-0.5 rounded-xl border bg-popover p-1 shadow-xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95"
        >
          {cluster.pins.map((pin) => (
            <li key={pin.thread.root.id}>
              <button
                type="button"
                onClick={() => {
                  comments.select(pin.thread.root.id)
                  onToggle()
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-muted motion-reduce:transition-none",
                  pin.thread.root.id === selectedId && "bg-brand-50 dark:bg-brand-500/10",
                )}
              >
                <Avatar name={pin.thread.root.author_name} color={pin.thread.root.author_color} small />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">{pin.thread.root.author_name}</span>
                  <span className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">{pin.thread.root.body}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

/** The nearest ancestor that scrolls — the preview column, which owns the page's scroll. */
export function scrollParent(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement
  while (node) {
    const overflow = window.getComputedStyle(node).overflowY
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}
