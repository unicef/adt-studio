import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { readableTextColor } from "@/features/comments/lib/color"
import { isFollowable, pageLabelFor } from "@/features/comments/lib/follow"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import { pagesAtom, tocAtom } from "@/features/navigation/state/nav.atoms"
import {
  followSentToAtom,
  followedNameAtom,
} from "@/features/comments/state/follow.atoms"
import { otherPeersAtom, presenceVisibleAtom } from "@/features/comments/state/presence.atoms"
import type { RoomPeer } from "@/features/comments/lib/room-protocol"

const MAX_FACES = 4

function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "?"
}

function Avatar({ peer, size }: { peer: RoomPeer; size: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: peer.color, color: readableTextColor(peer.color) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold leading-none ring-2 ring-popover ${
        size === "sm" ? "h-5 w-5 text-[0.625rem]" : "h-7 w-7 text-xs"
      }`}
    >
      {initialOf(peer.name)}
    </span>
  )
}

/**
 * Who else is reading, and where.
 *
 * The collapsed state is the avatar stack that was already here; opening it answers the two
 * questions the stack could not — *which page are they on* and *can I go with them*. It appears
 * only when somebody else is in the room: presence must never be a permanent badge that says
 * nobody is there.
 *
 * Following is page-level on purpose. Scroll-following would need a new frame on every scroll
 * event and buys little in a book whose pages are short — where somebody *is* answers "show me
 * what you mean" almost as well, at no cost to the protocol.
 */
export function PresenceRoster() {
  const { t } = useCommentsText()
  const visible = useAtomValue(presenceVisibleAtom)
  const peers = useAtomValue(otherPeersAtom)
  const pages = useAtomValue(pagesAtom)
  const toc = useAtomValue(tocAtom)
  const following = useAtomValue(followedNameAtom)
  const setFollowing = useSetAtom(followedNameAtom)
  const setSentTo = useSetAtom(followSentToAtom)
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false)
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [open])

  /** An empty room closes the panel rather than leaving a list of nobody on screen. */
  useEffect(() => {
    if (!visible) setOpen(false)
  }, [visible])

  if (!visible) return null

  const faces = peers.slice(0, MAX_FACES)
  const overflow = peers.length - faces.length
  const countLabel =
    peers.length === 1
      ? t("comments-presence-one-label")
      : t("comments-presence-count-label", { count: String(peers.length) })

  const labels = {
    unknown: t("comments-presence-unknown-page-label"),
    page: (number: number) => t("comments-presence-page-label", { number: String(number) }),
  }

  function follow(peer: RoomPeer): void {
    setFollowing(peer.name)
    setSentTo(null)
    setOpen(false)
  }

  function stop(): void {
    setFollowing(null)
    setSentTo(null)
  }

  return (
    <div
      ref={panelRef}
      className="fixed bottom-[calc(var(--dock-height,5rem)+1rem)] right-4 z-40 flex flex-col items-end gap-2"
    >
      {open ? (
        <div
          role="dialog"
          aria-label={t("comments-presence-title-label")}
          className="w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-popover/95 shadow-lg ring-1 ring-border backdrop-blur-md duration-200 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 motion-reduce:animate-none"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-xs font-semibold text-popover-foreground">
              {t("comments-presence-title-label")}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("comments-presence-close-label")}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <ul className="flex max-h-64 list-none flex-col overflow-y-auto p-0">
            {peers.map((peer) => {
              const followable = isFollowable(peer)
              const isFollowed = following === peer.name
              return (
                <li
                  key={peer.id}
                  className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/50"
                >
                  <Avatar peer={peer} size="md" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-medium text-popover-foreground">
                      {peer.name}
                    </span>
                    <span className="truncate text-[0.6875rem] text-muted-foreground">
                      {pageLabelFor(peer, pages, toc, labels)}
                    </span>
                  </span>
                  {followable ? (
                    <button
                      type="button"
                      onClick={() => (isFollowed ? stop() : follow(peer))}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium transition-colors ${
                        isFollowed
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground hover:bg-muted/70"
                      }`}
                    >
                      {isFollowed ? t("comments-following-label") : t("comments-follow-label")}
                    </button>
                  ) : (
                    <span
                      title={t("comments-presence-anonymous-hint-label")}
                      className="shrink-0 text-[0.6875rem] text-muted-foreground/70"
                    >
                      —
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`${countLabel} — ${t("comments-presence-open-label")}`}
        className="flex items-center gap-2 rounded-full bg-popover/95 py-1 pl-1.5 pr-3 shadow-md ring-1 ring-border backdrop-blur-md transition-colors duration-300 animate-in fade-in-0 slide-in-from-bottom-2 hover:bg-popover motion-reduce:animate-none"
      >
        <span className="flex items-center">
          {faces.map((peer, index) => (
            <span key={peer.id} className={index === 0 ? "" : "-ml-1.5"}>
              <Avatar peer={peer} size="sm" />
            </span>
          ))}
          {overflow > 0 ? (
            <span className="-ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[0.625rem] font-bold leading-none text-muted-foreground ring-2 ring-popover">
              {`+${overflow}`}
            </span>
          ) : null}
        </span>
        <span className="text-xs font-medium text-popover-foreground">{countLabel}</span>
      </button>
    </div>
  )
}
