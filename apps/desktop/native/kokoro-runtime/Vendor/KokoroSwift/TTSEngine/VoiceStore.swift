import Foundation
import MLX

public final class VoiceStore {
  private let voicesDirectory: URL
  private var cache: [String: MLXArray] = [:]

  public init(voicesDirectory: URL) {
    self.voicesDirectory = voicesDirectory
  }

  public func loadVoice(named voice: String) throws -> MLXArray {
    if let cached = cache[voice] {
      return cached
    }
    let voiceURL = voicesDirectory.appendingPathComponent("\(voice).safetensors")
    return try loadVoice(from: voiceURL, cacheKey: voice)
  }

  public func loadVoice(from voiceURL: URL, cacheKey: String? = nil) throws -> MLXArray {
    let tensors = try MLX.loadArrays(url: voiceURL)
    guard let voice = tensors["voice"] ?? tensors.values.first else {
      throw CocoaError(.fileReadCorruptFile)
    }
    if let cacheKey {
      cache[cacheKey] = voice
    }
    return voice
  }
}
