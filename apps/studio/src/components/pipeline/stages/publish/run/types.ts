import type { BookPublishRunController } from "@/hooks/use-book-publication"

/**
 * What the run screen is told about the run it is drawing.
 *
 * `onCancel` is the way out — in production it is `run.reset`, which aborts the stream and returns
 * the author to the form. `onBackground` is the future "keep working" handoff to a background
 * strip; it is optional because the strip requires the run controller to live at the app shell
 * (navigating away from this page today aborts the run), and until that move happens the control
 * is simply not offered.
 */
export interface PublishRunScreenProps {
  title: string
  /** The version readers stay on while an update runs. Null on a first publish, where there is
   *  nothing for them to stay on. */
  fromVersion: number | null
  run: BookPublishRunController
  elapsedMs: number
  onCancel: () => void
  onBackground?: () => void
}

/**
 * A run the author stopped is not a run that failed, but the controller has no fourth status for
 * it: `error` with nothing to explain is that shape. The distinction matters to the copy — a
 * failure offers "Try again", a stop offers "Publish again" and never apologises for something the
 * author chose.
 */
export function isAuthorStopped(status: string, failure: unknown): boolean {
  return status === "error" && failure === null
}
