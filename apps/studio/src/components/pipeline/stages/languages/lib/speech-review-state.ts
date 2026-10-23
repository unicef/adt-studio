import type { TTSResponse } from "@/api/client"
import type { StageState } from "@/hooks/use-book-run"

/** Speech is optional. Missing output matters after a run, not while waiting
 * for the first one. Current audio or failures retain that evidence after a
 * text edit resets stage status. Delete all speech publishes empty versions,
 * so the existence of version history alone must not enable the indicators. */
export function shouldShowMissingSpeech(state: StageState, tts?: TTSResponse): boolean {
  if (state === "running" || state === "queued" || tts?.live) return false
  return state === "done" || state === "error" ||
    Object.values(tts?.languages ?? {}).some((language) => language.entries.length > 0 || (language.failed?.length ?? 0) > 0)
}
