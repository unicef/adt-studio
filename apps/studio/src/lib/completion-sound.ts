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

/**
 * Play a short, pleasant two-note chime (C5 → E5).
 * Non-blocking, safe to call rapidly (overlapping calls layer gracefully).
 */
export function playCompletionSound(): void {
  try {
    const ctx = getAudioContext()

    // Resume if suspended (browsers require user gesture first)
    if (ctx.state === "suspended") {
      void ctx.resume()
    }

    const now = ctx.currentTime
    const volume = 0.15

    // Two-note ascending chime: C5 (523 Hz) → E5 (659 Hz)
    const notes = [
      { freq: 523.25, start: 0, duration: 0.12 },
      { freq: 659.25, start: 0.1, duration: 0.18 },
    ]

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
  } catch {
    // Audio not available — silently ignore
  }
}
