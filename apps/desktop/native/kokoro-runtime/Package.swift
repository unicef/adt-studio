// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "ADTKokoroRuntime",
  platforms: [.macOS(.v15)],
  products: [.executable(name: "adt-kokoro-runtime", targets: ["ADTKokoroRuntime"])],
  dependencies: [
    .package(url: "https://github.com/ml-explore/mlx-swift", exact: "0.30.2"),
    .package(url: "https://github.com/mlalma/MLXUtilsLibrary.git", exact: "0.0.6"),
  ],
  targets: [
    .target(
      name: "ADTKokoroEngine",
      dependencies: [
        .product(name: "MLX", package: "mlx-swift"),
        .product(name: "MLXNN", package: "mlx-swift"),
        .product(name: "MLXRandom", package: "mlx-swift"),
        .product(name: "MLXFFT", package: "mlx-swift"),
        .product(name: "MLXUtilsLibrary", package: "MLXUtilsLibrary"),
      ],
      path: "Vendor/KokoroSwift"
    ),
    .executableTarget(
      name: "ADTKokoroRuntime",
      dependencies: [
        "ADTKokoroEngine",
        .product(name: "MLX", package: "mlx-swift"),
        .product(name: "MLXRandom", package: "mlx-swift"),
      ]
    ),
  ]
)
