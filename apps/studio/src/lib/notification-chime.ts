let context: AudioContext | null = null

export function playNotificationChime() {
  try {
    context ??= new AudioContext()
    if (context.state === "suspended") void context.resume()

    const start = context.currentTime
    const gain = context.createGain()
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.1, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45)
    gain.connect(context.destination)

    for (const [index, frequency] of [880, 1318.5].entries()) {
      const oscillator = context.createOscillator()
      oscillator.type = "sine"
      oscillator.frequency.value = frequency
      oscillator.connect(gain)
      oscillator.start(start + index * 0.09)
      oscillator.stop(start + 0.5)
    }
  } catch {
    /* ignore */
  }
}
