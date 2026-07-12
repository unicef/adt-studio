export interface SpeechPlaybackController {
  pauseForFeedback: () => boolean
  resumeAfterFeedback: () => Promise<void>
}

let controller: SpeechPlaybackController | null = null

export function registerSpeechPlaybackController(
  nextController: SpeechPlaybackController,
): () => void {
  controller = nextController
  return () => {
    if (controller === nextController) controller = null
  }
}

export function pauseSpeechForFeedback(): boolean {
  return controller?.pauseForFeedback() ?? false
}

export function resumeSpeechAfterFeedback(): Promise<void> {
  return controller?.resumeAfterFeedback() ?? Promise.resolve()
}