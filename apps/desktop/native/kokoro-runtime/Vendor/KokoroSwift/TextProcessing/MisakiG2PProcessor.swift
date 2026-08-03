import Foundation
import MLXUtilsLibrary

final class MisakiG2PProcessor: G2PProcessor {
  func setLanguage(_ language: Language) throws {
    switch language {
    case .enUS, .enGB:
      return
    default:
      throw G2PProcessorError.unsupportedLanguage
    }
  }

  func process(input _: String) throws -> (String, [MToken]?) {
    throw G2PProcessorError.processorNotInitialized
  }
}
