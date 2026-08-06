import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useRef } from "react"
import { currentSectionIdAtom, pagesAtom } from "@/features/navigation/state/nav.atoms"
import { findFollowed, followOutcome } from "@/features/comments/lib/follow"
import { followedNameAtom } from "@/features/comments/state/follow.atoms"
import { otherPeersAtom } from "@/features/comments/state/presence.atoms"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import { announceToScreenReader } from "@/shared/lib/aria-live"

/**
 * Keeps this reader on the page the followed peer is reading, until they say stop.
 *
 * The only automatic ending is a peer who has been gone longer than a page turn takes — a page
 * turn *is* a disappearance in this runtime, so the grace period is what stops the follow
 * ending every time it does its job. Navigating by hand does not end it: the reader gets pulled
 * back on the next presence frame, which is what "following" means and what the banner and the
 * ring are on screen to make obvious.
 */
export function useFollowPeer(enabled: boolean): void {
  const { t } = useCommentsText()
  const peers = useAtomValue(otherPeersAtom)
  const pages = useAtomValue(pagesAtom)
  const sectionId = useAtomValue(currentSectionIdAtom)
  const name = useAtomValue(followedNameAtom)
  const setName = useSetAtom(followedNameAtom)

  /** Set the moment the followed peer leaves the roster, cleared when they come back. */
  const missingSinceRef = useRef<number | null>(null)
  /** One navigation per document: `location.href` does not take effect synchronously, and a
   *  second assignment while the first is in flight can land on the wrong page. */
  const navigatedRef = useRef(false)

  const stop = (announce?: string): void => {
    setName(null)
    missingSinceRef.current = null
    /** The banner is the only sign a follow was running; when it ends on its own, something has
     *  to say so, or the reader is left wondering why the pages stopped turning. */
    if (announce !== undefined) announceToScreenReader(announce)
  }

  useEffect(() => {
    if (!enabled || name === null || navigatedRef.current) return

    const followed = findFollowed(peers, name)
    if (followed === null) {
      if (missingSinceRef.current === null) missingSinceRef.current = Date.now()
    } else {
      missingSinceRef.current = null
    }

    const outcome = followOutcome({
      followed,
      missingSinceMs: missingSinceRef.current,
      now: Date.now(),
      currentSectionId: sectionId ?? null,
      pages,
      name,
    })

    if (outcome.kind === "lost") {
      stop(t("comments-following-lost-label", { name }))
      return
    }
    if (outcome.kind !== "navigate") return

    navigatedRef.current = true
    window.location.href = outcome.href
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, name, pages, peers, sectionId])

  /** A peer who vanishes while nothing else changes would otherwise sit in limbo until the next
   *  presence frame, which for a reader who closed their laptop never comes. */
  useEffect(() => {
    if (!enabled || name === null) return
    const timer = window.setInterval(() => {
      const since = missingSinceRef.current
      if (since === null) return
      const outcome = followOutcome({
        followed: null,
        missingSinceMs: since,
        now: Date.now(),
        currentSectionId: sectionId ?? null,
        pages,
        name,
      })
      if (outcome.kind === "lost") stop(t("comments-following-lost-label", { name }))
    }, 2000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, name, pages, sectionId])
}
