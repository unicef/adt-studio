import Foundation
import ADTKokoroEngine
import MLX
import MLXRandom

private let runtimeVersion = "1"
private let sampleRate = 24_000

private struct Request: Decodable {
  let id: String
  let phonemes: String
  let voice: String
  let speed: Float
  let outputWav: String

  enum CodingKeys: String, CodingKey {
    case id, phonemes, voice, speed
    case outputWav = "output_wav"
  }
}

private struct Response: Encodable {
  let id: String?
  let status: String?
  let samples: Int?
  let elapsedMs: Int?
  let error: String?

  enum CodingKeys: String, CodingKey {
    case id, status, samples, error
    case elapsedMs = "elapsed_ms"
  }
}

private func writeResponse(_ response: Response) {
  let encoder = JSONEncoder()
  guard let data = try? encoder.encode(response) else { return }
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([0x0A]))
}

private func appendLittleEndian<T: FixedWidthInteger>(_ value: T, to data: inout Data) {
  var littleEndian = value.littleEndian
  withUnsafeBytes(of: &littleEndian) { data.append(contentsOf: $0) }
}

private func writePCM16Wav(samples: [Float], to url: URL) throws {
  let dataBytes = UInt32(samples.count * MemoryLayout<Int16>.size)
  var wav = Data(capacity: 44 + Int(dataBytes))
  wav.append(contentsOf: "RIFF".utf8)
  appendLittleEndian(UInt32(36) + dataBytes, to: &wav)
  wav.append(contentsOf: "WAVEfmt ".utf8)
  appendLittleEndian(UInt32(16), to: &wav)
  appendLittleEndian(UInt16(1), to: &wav)
  appendLittleEndian(UInt16(1), to: &wav)
  appendLittleEndian(UInt32(sampleRate), to: &wav)
  appendLittleEndian(UInt32(sampleRate * 2), to: &wav)
  appendLittleEndian(UInt16(2), to: &wav)
  appendLittleEndian(UInt16(16), to: &wav)
  wav.append(contentsOf: "data".utf8)
  appendLittleEndian(dataBytes, to: &wav)
  for sample in samples {
    let finite = sample.isFinite ? max(-1, min(1, sample)) : 0
    let scaled = finite < 0 ? finite * 32_768 : finite * 32_767
    appendLittleEndian(Int16(scaled), to: &wav)
  }
  try wav.write(to: url, options: .atomic)
}

@main
private struct ADTKokoroRuntime {
  static func main() throws {
    let arguments = CommandLine.arguments
    if arguments.contains("--version") {
      print("adt-kokoro-runtime \(runtimeVersion)")
      return
    }
    guard
      let modelFlag = arguments.firstIndex(of: "--model-dir"),
      modelFlag + 1 < arguments.count
    else {
      throw CocoaError(.fileNoSuchFile)
    }

    let modelDirectory = URL(fileURLWithPath: arguments[modelFlag + 1], isDirectory: true)
    let mlxDirectory = modelDirectory.appendingPathComponent("mlx", isDirectory: true)
    let engine = try Device.withDefaultDevice(.gpu) {
      try KokoroTTS(
        modelPath: mlxDirectory.appendingPathComponent("kokoro-v1_0.safetensors"),
        configPath: mlxDirectory.appendingPathComponent("config.json"),
        g2p: nil
      )
    }
    let voiceStore = VoiceStore(voicesDirectory: mlxDirectory.appendingPathComponent("voices", isDirectory: true))
    writeResponse(Response(id: nil, status: "ready", samples: nil, elapsedMs: nil, error: nil))

    while let line = readLine() {
      var requestId: String?
      do {
        let request = try JSONDecoder().decode(Request.self, from: Data(line.utf8))
        requestId = request.id
        let startedAt = ContinuousClock.now
        let samples = try Device.withDefaultDevice(.gpu) {
          MLXRandom.seed(0)
          let voice = try voiceStore.loadVoice(named: request.voice)
          return try engine.generateAudioFromPhonemes(
            voice: voice,
            phonemes: request.phonemes,
            speed: request.speed
          )
        }
        try writePCM16Wav(samples: samples, to: URL(fileURLWithPath: request.outputWav))
        let elapsed = startedAt.duration(to: .now)
        let elapsedMs = Int(elapsed.components.seconds * 1_000)
          + Int(elapsed.components.attoseconds / 1_000_000_000_000_000)
        writeResponse(Response(id: request.id, status: nil, samples: samples.count, elapsedMs: elapsedMs, error: nil))
      } catch {
        writeResponse(Response(id: requestId, status: nil, samples: nil, elapsedMs: nil, error: String(describing: error)))
      }
    }
  }
}
