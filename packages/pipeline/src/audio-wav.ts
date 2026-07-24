/**
 * Minimal PCM WAV reader/slicer. Pure — no filesystem, no native deps.
 *
 * Used by the page-batched TTS path: Gemini returns one continuous WAV for a
 * whole page (24 kHz mono 16-bit PCM), which we cut into per-sentence WAV files
 * at word-onset boundaries so the rest of the pipeline (per-entry word
 * timestamps, EPUB SMIL, web reader) keeps seeing one file per text entry.
 *
 * Only uncompressed integer PCM (`audioFormat === 1`) is supported — that's
 * what the Gemini TTS integration always emits. Anything else throws.
 */

export interface WavInfo {
  audioFormat: number
  channels: number
  sampleRate: number
  bitsPerSample: number
  /** Byte offset of the first PCM sample (start of the `data` chunk body). */
  dataOffset: number
  /** Length of the `data` chunk body in bytes. */
  dataLength: number
}

const RIFF = 0x52494646 // "RIFF"
const WAVE = 0x57415645 // "WAVE"

/** Parse the `fmt ` and `data` chunks of a canonical RIFF/WAVE buffer. */
export function parseWavHeader(buf: Buffer): WavInfo {
  if (buf.length < 12 || buf.readUInt32BE(0) !== RIFF || buf.readUInt32BE(8) !== WAVE) {
    throw new Error("Not a RIFF/WAVE buffer")
  }

  let audioFormat = 0
  let channels = 0
  let sampleRate = 0
  let bitsPerSample = 0
  let dataOffset = -1
  let dataLength = 0

  // Walk chunks: 4-byte ascii id + 4-byte little-endian size + body (padded to
  // even length). Start right after the 12-byte RIFF/WAVE preamble.
  let pos = 12
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4)
    const size = buf.readUInt32LE(pos + 4)
    const body = pos + 8
    if (id === "fmt ") {
      audioFormat = buf.readUInt16LE(body)
      channels = buf.readUInt16LE(body + 2)
      sampleRate = buf.readUInt32LE(body + 4)
      bitsPerSample = buf.readUInt16LE(body + 14)
    } else if (id === "data") {
      dataOffset = body
      // Clamp to the actual buffer — some encoders write a placeholder size.
      dataLength = Math.min(size, buf.length - body)
      break
    }
    pos = body + size + (size % 2) // chunks are word-aligned
  }

  if (audioFormat !== 1) {
    throw new Error(`Unsupported WAV encoding (audioFormat=${audioFormat}); expected PCM (1)`)
  }
  if (dataOffset < 0 || channels === 0 || sampleRate === 0 || bitsPerSample === 0) {
    throw new Error("Malformed WAV: missing fmt/data chunk")
  }

  return { audioFormat, channels, sampleRate, bitsPerSample, dataOffset, dataLength }
}

/** Total playable duration of a PCM WAV, in seconds. */
export function wavDurationSeconds(buf: Buffer): number {
  const info = parseWavHeader(buf)
  const bytesPerFrame = info.channels * (info.bitsPerSample / 8)
  if (bytesPerFrame === 0) return 0
  return info.dataLength / bytesPerFrame / info.sampleRate
}

function buildPcmWavHeader(info: WavInfo, dataSize: number): Buffer {
  const header = Buffer.alloc(44)
  const { channels, sampleRate, bitsPerSample } = info
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write("data", 36)
  header.writeUInt32LE(dataSize, 40)
  return header
}

/**
 * Apply a linear fade-in over the first `fadeFrames` frames and a fade-out over
 * the last `fadeFrames` frames, in place (16-bit PCM). A few milliseconds is
 * enough to force zero-amplitude edges, so cutting mid-waveform can't produce a
 * click when slices are played back-to-back. No-op unless 16-bit.
 */
function applyEdgeFades16(pcm: Buffer, channels: number, fadeFrames: number): void {
  const totalFrames = Math.floor(pcm.length / (channels * 2))
  const f = Math.min(fadeFrames, Math.floor(totalFrames / 2))
  if (f <= 0) return
  for (let i = 0; i < f; i++) {
    const gain = i / f
    for (let c = 0; c < channels; c++) {
      const inOff = (i * channels + c) * 2
      pcm.writeInt16LE(Math.round(pcm.readInt16LE(inOff) * gain), inOff)
      const outOff = ((totalFrames - 1 - i) * channels + c) * 2
      pcm.writeInt16LE(Math.round(pcm.readInt16LE(outOff) * gain), outOff)
    }
  }
}

/**
 * Cut `[startSec, endSec)` out of a PCM WAV and return a fresh, canonical WAV
 * (44-byte header + PCM). Bounds are clamped to the file and snapped to whole
 * sample frames so the result never contains a partial frame. An empty or
 * inverted range yields a valid zero-length-audio WAV.
 *
 * `fadeMs` fades the slice edges to zero to avoid boundary clicks when slices
 * play back-to-back (only applied for 16-bit PCM; 0 disables it).
 */
export function sliceWav(buf: Buffer, startSec: number, endSec: number, fadeMs = 0): Buffer {
  const info = parseWavHeader(buf)
  const bytesPerFrame = info.channels * (info.bitsPerSample / 8)
  const totalFrames = Math.floor(info.dataLength / bytesPerFrame)

  const clampFrame = (sec: number): number => {
    const frame = Math.round(sec * info.sampleRate)
    return Math.max(0, Math.min(totalFrames, frame))
  }

  const startFrame = clampFrame(startSec)
  const endFrame = Math.max(startFrame, clampFrame(endSec))

  const startByte = info.dataOffset + startFrame * bytesPerFrame
  const endByte = info.dataOffset + endFrame * bytesPerFrame
  let pcm = buf.subarray(startByte, endByte)

  if (fadeMs > 0 && pcm.length > 0 && info.bitsPerSample === 16) {
    pcm = Buffer.from(pcm) // copy: fades mutate, must not touch the source buffer
    applyEdgeFades16(pcm, info.channels, Math.round((fadeMs / 1000) * info.sampleRate))
  }

  return Buffer.concat([buildPcmWavHeader(info, pcm.length), pcm])
}

/**
 * Find a clean cut point near `targetSec` by locating the quietest short window
 * in `[targetSec - backWindowSec, targetSec]` — i.e. the pause just before a
 * word onset. Cutting there keeps a sentence's leading attack intact and lands
 * the boundary in near-silence. Returns `targetSec` unchanged for non-16-bit
 * audio or a degenerate window.
 */
export function findQuietCutSeconds(buf: Buffer, targetSec: number, backWindowSec: number): number {
  const info = parseWavHeader(buf)
  if (info.bitsPerSample !== 16) return targetSec
  const { sampleRate, channels, dataOffset, dataLength } = info
  const bytesPerFrame = channels * 2
  const totalFrames = Math.floor(dataLength / bytesPerFrame)

  const targetFrame = Math.max(0, Math.min(totalFrames, Math.round(targetSec * sampleRate)))
  const startFrame = Math.max(0, targetFrame - Math.round(backWindowSec * sampleRate))
  const win = Math.max(1, Math.round(0.005 * sampleRate)) // 5ms energy window
  if (targetFrame - startFrame < win) return targetSec

  let bestFrame = targetFrame
  let bestEnergy = Infinity
  const step = Math.max(1, Math.floor(win / 2))
  for (let s = startFrame; s + win <= targetFrame; s += step) {
    let energy = 0
    for (let i = 0; i < win; i++) {
      energy += Math.abs(buf.readInt16LE(dataOffset + (s + i) * bytesPerFrame)) // channel 0
    }
    if (energy < bestEnergy) {
      bestEnergy = energy
      bestFrame = s + Math.floor(win / 2)
    }
  }
  return bestFrame / sampleRate
}
