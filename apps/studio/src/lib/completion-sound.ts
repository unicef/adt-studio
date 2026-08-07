/**
 * Pleasant completion chime using the Web Audio API.
 * No external sound files — synthesized on-the-fly.
 */

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

/** Ascending two-note chime (C5 → E5) — success. */
const COMPLETION_NOTES = [
  { freq: 523.25, start: 0, duration: 0.12 },
  { freq: 659.25, start: 0.1, duration: 0.18 },
]

/** Descending two-note tone (E5 → C5) — error. */
const ERROR_NOTES = [
  { freq: 659.25, start: 0, duration: 0.14 },
  { freq: 523.25, start: 0.12, duration: 0.22 },
]

function scheduleChime(
  ctx: AudioContext,
  notes: ReadonlyArray<{ freq: number; start: number; duration: number }>,
): void {
  const now = ctx.currentTime
  const volume = 0.15

  for (const note of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = "sine"
    osc.frequency.setValueAtTime(note.freq, now + note.start)

    // Soft attack and decay envelope
    gain.gain.setValueAtTime(0, now + note.start)
    gain.gain.linearRampToValueAtTime(volume, now + note.start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.duration)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now + note.start)
    osc.stop(now + note.start + note.duration + 0.01)
  }
}

/**
 * Play `notes`, waiting for the AudioContext to resume first when needed.
 *
 * When the AudioContext is suspended (browser autoplay policy: no user
 * gesture yet), we must wait for `resume()` to complete before scheduling —
 * otherwise the oscillators schedule against `ctx.currentTime === 0` and the
 * notes fire in the past, producing no audible sound. This was the root cause
 * of "task finished but no chime" reports on first task after page load.
 */
function play(
  notes: ReadonlyArray<{ freq: number; start: number; duration: number }>,
): void {
  try {
    const ctx = getAudioContext()

    if (ctx.state === "suspended") {
      ctx.resume().then(
        () => scheduleChime(ctx, notes),
        () => {
          // Resume rejected (no user gesture yet); next call will retry.
        },
      )
      return
    }

    scheduleChime(ctx, notes)
  } catch {
    // Audio not available — silently ignore
  }
}

/**
 * Play a short, pleasant two-note chime (C5 → E5).
 * Non-blocking, safe to call rapidly (overlapping calls layer gracefully).
 */
export function playCompletionSound(): void {
  play(COMPLETION_NOTES)
}

/**
 * Play a short two-note descending tone (E5 → C5) to signal an error.
 * Same synthesis approach as the completion chime — no assets, no deps.
 */
export function playErrorSound(): void {
  play(ERROR_NOTES)
}
