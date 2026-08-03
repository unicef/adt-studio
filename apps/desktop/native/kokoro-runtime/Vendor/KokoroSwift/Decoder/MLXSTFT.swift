import Foundation
import MLX

private func periodicHannWindow(length: Int) -> [Float] {
  guard length > 0 else { return [] }
  return (0 ..< length).map { index in
    Float(0.5 - 0.5 * cos((2.0 * Double.pi * Double(index)) / Double(length)))
  }
}

final class MLXSTFT {
  let filterLength: Int
  let hopLength: Int
  let winLength: Int
  let nFFT: Int
  let bins: Int
  let forwardBasis: MLXArray
  let window: MLXArray
  let cosMatT: MLXArray
  let sinMatT: MLXArray

  init(filterLength: Int = 800, hopLength: Int = 200, winLength: Int = 800, window _: String = "hann") {
    self.filterLength = filterLength
    self.hopLength = hopLength
    self.winLength = winLength
    nFFT = filterLength
    bins = nFFT / 2 + 1

    let windowValues = periodicHannWindow(length: winLength)
    window = MLXArray(windowValues)

    let t = (0 ..< nFFT).map(Float.init)
    let freqs = (0 ..< bins).map(Float.init)
    var fourierReal: [Float] = []
    var fourierImag: [Float] = []
    var cosValues: [Float] = []
    var sinValues: [Float] = []

    for frequency in freqs {
      let scale: Float = (frequency > 0 && Int(frequency) < bins - 1) ? 2.0 : 1.0
      for time in t {
        let angle = 2.0 * Float.pi * frequency * time / Float(nFFT)
        let win = windowValues[Int(time)]
        fourierReal.append(cos(angle) * win)
        fourierImag.append(-sin(angle) * win)
        cosValues.append(cos(angle) * scale / Float(nFFT))
        sinValues.append(sin(angle) * scale / Float(nFFT))
      }
    }

    let basis = fourierReal + fourierImag
    forwardBasis = MLXArray(basis).reshaped([bins * 2, nFFT, 1])
    cosMatT = MLXArray(cosValues).reshaped([bins, nFFT]).transposed(1, 0).expandedDimensions(axis: 0)
    sinMatT = MLXArray(sinValues).reshaped([bins, nFFT]).transposed(1, 0).expandedDimensions(axis: 0)
  }

  func transform(inputData: MLXArray) -> (MLXArray, MLXArray) {
    var x = inputData
    if x.ndim == 1 {
      x = x.expandedDimensions(axis: 0)
    }

    let pad = nFFT / 2
    if pad > 0 {
      x = MLX.concatenated([
        MLXArray.zeros([x.shape[0], pad]),
        x,
        MLXArray.zeros([x.shape[0], pad]),
      ], axis: 1)
    }

    x = x.expandedDimensions(axis: 2)
    var out = MLX.conv1d(x, forwardBasis, stride: hopLength, padding: 0)
    out = out.transposed(0, 2, 1)
    let real = out[0..., 0 ..< bins, 0...]
    let imag = out[0..., bins..., 0...]
    let magnitude = MLX.sqrt(real * real + imag * imag)
    let phase = MLX.atan2(imag, real)
    return (magnitude, phase)
  }

  func inverse(magnitude: MLXArray, phase: MLXArray) -> MLXArray {
    let real = magnitude * MLX.cos(phase)
    let imag = magnitude * MLX.sin(phase)
    var frames = MLX.matmul(cosMatT, real) - MLX.matmul(sinMatT, imag)
    frames = frames * window.reshaped([1, nFFT, 1])

    let batch = frames.shape[0]
    let numFrames = real.shape[real.ndim - 1]
    let totalLength = nFFT + (numFrames - 1) * hopLength

    var output = MLXArray.zeros([batch, totalLength])
    for frame in 0 ..< numFrames {
      let start = frame * hopLength
      let end = start + nFFT
      output[0..., start ..< end] = output[0..., start ..< end] + frames[0..., 0..., frame]
    }

    let winSq = window * window
    var winSqSum = MLXArray.zeros([totalLength])
    for frame in 0 ..< numFrames {
      let start = frame * hopLength
      let end = start + nFFT
      winSqSum[start ..< end] = winSqSum[start ..< end] + winSq
    }

    output = output / MLX.maximum(winSqSum.expandedDimensions(axis: 0), MLXArray(1e-8))

    let pad = nFFT / 2
    if pad > 0 {
      output = output[0..., pad ..< totalLength - pad]
    }
    return output.expandedDimensions(axis: 1)
  }
}
