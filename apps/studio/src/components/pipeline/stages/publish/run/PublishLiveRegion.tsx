import type { PublishAnnouncement } from "./progress/usePublishAnnouncer"

/**
 * The one thing on this screen that talks.
 *
 * Exactly one live region per run, present from mount so its first message is heard — a region
 * that appears at the same moment as its text is frequently announced by nothing at all.
 *
 * Politeness is switched rather than a second region being mounted. Two regions would mean two
 * elements claiming to speak for the same run, and the terminal failure is precisely the moment
 * where a newly mounted one is least likely to be read out.
 */
export function PublishLiveRegion({ message, assertive }: PublishAnnouncement) {
  return (
    <div
      data-testid="publish-live-region"
      role="status"
      aria-live={assertive ? "assertive" : "polite"}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  )
}
