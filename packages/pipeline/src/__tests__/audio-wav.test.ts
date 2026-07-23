import { describe, it, expect } from "vitest"
import { parseWavHeader, wavDurationSeconds, sliceWav, findQuietCutSeconds } from "../audio-wav.js"

/** Build a canonical PCM WAV whose sample N holds the value N (mono, 16-bit). */
function buildWav(numSamples: number, sampleRate: number): Buffer {
  const header = Buffer.alloc(44)
  const dataSize = numSamples * 2
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36)
  header.writeUInt32LE(dataSize, 40)
  const pcm = Buffer.alloc(dataSize)
  for (let i = 0; i < numSamples; i++) pcm.writeInt16LE(i, i * 2)
  return Buffer.concat([header, pcm])
}

describe("parseWavHeader / wavDurationSeconds", () => {
  it("parses a canonical PCM WAV", () => {
    const wav = buildWav(100, 100)
    const info = parseWavHeader(wav)
    expect(info).toMatchObject({ audioFormat: 1, channels: 1, sampleRate: 100, bitsPerSample: 16 })
    expect(info.dataLength).toBe(200)
    expect(wavDurationSeconds(wav)).toBeCloseTo(1.0, 5)
  })

  it("rejects non-RIFF and non-PCM input", () => {
    expect(() => parseWavHeader(Buffer.from("nope"))).toThrow(/RIFF/)
  })
})

describe("sliceWav", () => {
  it("cuts an inner range at exact sample frames", () => {
    const wav = buildWav(100, 100) // 1s @ 100Hz
    const slice = sliceWav(wav, 0.2, 0.5) // samples [20, 50)
    const info = parseWavHeader(slice)
    expect(info.dataLength).toBe(30 * 2)
    // First sample of the slice is original sample 20; last is 49.
    expect(slice.readInt16LE(44)).toBe(20)
    expect(slice.readInt16LE(44 + 29 * 2)).toBe(49)
  })

  it("clamps out-of-range bounds and preserves format", () => {
    const wav = buildWav(100, 24000)
    const slice = sliceWav(wav, -1, 999)
    const info = parseWavHeader(slice)
    expect(info.sampleRate).toBe(24000)
    expect(info.dataLength).toBe(200) // whole file
  })

  it("returns a valid empty-audio WAV for an inverted range", () => {
    const wav = buildWav(100, 100)
    const slice = sliceWav(wav, 0.8, 0.2)
    expect(parseWavHeader(slice).dataLength).toBe(0)
    expect(slice.length).toBe(44)
  })

  it("tiles the file with no lost or duplicated samples", () => {
    const wav = buildWav(90, 30) // 3s
    const a = sliceWav(wav, 0, 1)
    const b = sliceWav(wav, 1, 2)
    const c = sliceWav(wav, 2, 3)
    const total =
      parseWavHeader(a).dataLength + parseWavHeader(b).dataLength + parseWavHeader(c).dataLength
    expect(total).toBe(90 * 2)
    expect(b.readInt16LE(44)).toBe(30) // b starts at sample 30
  })

  it("fades slice edges to zero and never mutates the source buffer", () => {
    const wav = buildWav(2400, 24000) // 100ms, samples ramp 0..2399
    const before = Buffer.from(wav) // snapshot
    const slice = sliceWav(wav, 0, 0.1, 8) // 8ms fade
    // First and last samples are forced to zero by the fade.
    expect(slice.readInt16LE(44)).toBe(0)
    expect(slice.readInt16LE(slice.length - 2)).toBe(0)
    // A sample past the fade region keeps (roughly) its original value.
    const mid = parseWavHeader(slice)
    expect(Math.abs(slice.readInt16LE(mid.dataOffset + 1200 * 2))).toBeGreaterThan(0)
    // Source buffer untouched.
    expect(wav.equals(before)).toBe(true)
  })
})

describe("findQuietCutSeconds", () => {
  it("snaps a boundary to the quiet gap before a loud onset", () => {
    // 1s @ 1000Hz: silence [0,0.5), loud tone [0.5,1.0).
    const n = 1000
    const header = Buffer.alloc(44)
    const dataSize = n * 2
    header.write("RIFF", 0); header.writeUInt32LE(36 + dataSize, 4); header.write("WAVE", 8)
    header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20)
    header.writeUInt16LE(1, 22); header.writeUInt32LE(1000, 24); header.writeUInt32LE(2000, 28)
    header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36)
    header.writeUInt32LE(dataSize, 40)
    const pcm = Buffer.alloc(dataSize)
    for (let i = 500; i < n; i++) pcm.writeInt16LE(8000, i * 2) // loud second half
    const wav = Buffer.concat([header, pcm])

    // Target the onset at 0.5s; search back 0.2s → should land in the silence.
    const cut = findQuietCutSeconds(wav, 0.5, 0.2)
    expect(cut).toBeGreaterThanOrEqual(0.3)
    expect(cut).toBeLessThanOrEqual(0.5)
  })
})
