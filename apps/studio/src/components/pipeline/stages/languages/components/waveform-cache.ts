/**
 * Decoded waveform bars, cached per audio URL.
 *
 * Decoding is expensive and was previously redone on every mount: scrolling a
 * virtualized clip list re-downloaded and re-decoded the same files, and each
 * decode built its own `AudioContext`. Browsers only allow a handful of live
 * AudioContexts, so past that point decoding queues behind them and the cost
 * per clip grows an order of magnitude. Measured over one scroll down-and-back
 * through a 300-clip book: 158 contexts, 158 fetches for 50 distinct files, and
 * ~9s of cumulative decode time.
 *
 * Three things fix that: one shared context, a result cache keyed by URL, and a
 * single in-flight promise per URL so concurrent mounts share one decode.
 */

export const WAVEFORM_BARS = 120

/** Bars per clip are tiny (120 floats); the cap only bounds a very long session. */
const CACHE_LIMIT = 512

/** Samples averaged per bar. The RMS of a slice barely moves past a few dozen
 *  samples, so this caps the loop instead of walking every sample in the file. */
const SAMPLES_PER_BAR = 64

const cache = new Map<string, number[]>()
const inFlight = new Map<string, Promise<number[]>>()

let sharedContext: AudioContext | null = null

function audioContext(): AudioContext {
  sharedContext ??= new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  return sharedContext
}

function remember(url: string, bars: number[]) {
  cache.delete(url)
  cache.set(url, bars)
  if (cache.size > CACHE_LIMIT) {
    // Map keeps insertion order, so the first key is the least recently stored.
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

function toBars(channel: Float32Array, bars: number): number[] {
  const step = Math.max(1, Math.floor(channel.length / bars))
  const stride = Math.max(1, Math.floor(step / SAMPLES_PER_BAR))
  const amps = new Array<number>(bars)
  let max = 0.001
  for (let i = 0; i < bars; i++) {
    const start = i * step
    let sum = 0
    let count = 0
    for (let j = 0; j < step; j += stride) {
      const value = channel[start + j]
      sum += value * value
      count++
    }
    const amp = count > 0 ? Math.sqrt(sum / count) : 0
    amps[i] = amp
    if (amp > max) max = amp
  }
  for (let i = 0; i < bars; i++) amps[i] /= max
  return amps
}

/** A flat line, so a clip that fails to decode still renders a usable player. */
export function flatWaveform(bars = WAVEFORM_BARS): number[] {
  return new Array<number>(bars).fill(0.3)
}

/** Already-decoded bars for this URL, if any — lets a remount paint instantly. */
export function peekWaveform(url: string): number[] | undefined {
  return cache.get(url)
}

async function decode(url: string, bars: number): Promise<number[]> {
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()
  const decoded = await audioContext().decodeAudioData(buffer)
  return toBars(decoded.getChannelData(0), bars)
}

export function loadWaveform(url: string, bars = WAVEFORM_BARS): Promise<number[]> {
  const cached = cache.get(url)
  if (cached) return Promise.resolve(cached)

  const pending = inFlight.get(url)
  if (pending) return pending

  const request = decode(url, bars)
    .then((result) => {
      remember(url, result)
      return result
    })
    // A failure is not cached: it is usually transient, and the flat fallback
    // would otherwise stick to that clip for the rest of the session.
    .catch(() => flatWaveform(bars))
    .finally(() => {
      inFlight.delete(url)
    })

  inFlight.set(url, request)
  return request
}
