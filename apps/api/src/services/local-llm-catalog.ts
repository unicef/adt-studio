const GiB = 1024 ** 3

export interface LocalLlmFile {
  name: string
  bytes: number
  sha256: string
}

export interface LocalLlmModel {
  id: `local:${string}`
  alias: string
  label: string
  repository: string
  revision: string
  license: "Apache-2.0"
  model: LocalLlmFile
  mmproj: LocalLlmFile
  minimumMemoryBytes: number
}

export const LOCAL_GEMMA_MODELS: readonly LocalLlmModel[] = [
  {
    id: "local:gemma4-e2b",
    alias: "gemma4-e2b",
    label: "Gemma 4 E2B",
    repository: "ggml-org/gemma-4-E2B-it-GGUF",
    revision: "b4243c156154b6dca9324415f8c7ccc098b4aed1",
    license: "Apache-2.0",
    model: {
      name: "gemma-4-E2B-it-Q4_0.gguf",
      bytes: 2_841_481_184,
      sha256: "8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52",
    },
    mmproj: {
      name: "mmproj-gemma-4-E2B-it-Q8_0.gguf",
      bytes: 557_368_064,
      sha256: "9406f99c16d68cda4f1f0552192dcc99021ea1fc6d2fd50b1dc3ccf30d04b292",
    },
    minimumMemoryBytes: 8 * GiB,
  },
  {
    id: "local:gemma4-e4b",
    alias: "gemma4-e4b",
    label: "Gemma 4 E4B",
    repository: "ggml-org/gemma-4-E4B-it-GGUF",
    revision: "b8093469224f83f5c38f691eb906c380e9e63114",
    license: "Apache-2.0",
    model: {
      name: "gemma-4-E4B-it-Q4_0.gguf",
      bytes: 4_590_807_392,
      sha256: "a555b900214b477d8880e7832e0b8925e139b0159640036b09fe472b6f2097f2",
    },
    mmproj: {
      name: "mmproj-gemma-4-E4B-it-Q8_0.gguf",
      bytes: 559_874_816,
      sha256: "197f49a93027f9843772bd24a6a9e0be2a32a788de5a3def330e9c585d86edd1",
    },
    minimumMemoryBytes: 12 * GiB,
  },
  {
    id: "local:gemma4-12b",
    alias: "gemma4-12b",
    label: "Gemma 4 12B",
    repository: "ggml-org/gemma-4-12B-it-GGUF",
    revision: "7e0fbb8205d1f4857f4606a38a65023aaeb5f544",
    license: "Apache-2.0",
    model: {
      name: "gemma-4-12B-it-Q4_0.gguf",
      bytes: 7_219_673_216,
      sha256: "3712b9bd32cae83a22f67ee7a4466d8d7a4f21646ac8a07d19bf9418e8767a70",
    },
    mmproj: {
      name: "mmproj-gemma-4-12B-it-Q8_0.gguf",
      bytes: 158_987_616,
      sha256: "59e62255435dda870e2d1de97cc031330b31a898bac12b38a182cecff9cd3738",
    },
    minimumMemoryBytes: 20 * GiB,
  },
  {
    id: "local:gemma4-26b",
    alias: "gemma4-26b",
    label: "Gemma 4 26B A4B",
    repository: "ggml-org/gemma-4-26B-A4B-it-GGUF",
    revision: "bb4531cda34d1ea09d9814959ed4d5833cf2a4c8",
    license: "Apache-2.0",
    model: {
      name: "gemma-4-26B-A4B-it-Q4_0.gguf",
      bytes: 14_618_145_824,
      sha256: "d208665ab1cd3a69f7a9a4bc59430e8448c8093d9b06334f566ac59d6d504a03",
    },
    mmproj: {
      name: "mmproj-gemma-4-26B-A4B-it-Q8_0.gguf",
      bytes: 806_408_320,
      sha256: "cc4e855736da450bf1e162d8cccfe0ad685727d0c9e04ef7dd8d884f3121039b",
    },
    minimumMemoryBytes: 48 * GiB,
  },
] as const

export function localLlmDownloadBytes(model: LocalLlmModel): number {
  return model.model.bytes + model.mmproj.bytes
}

export function findLocalLlmModel(idOrAlias: string): LocalLlmModel | undefined {
  const alias = idOrAlias.startsWith("local:") ? idOrAlias.slice("local:".length) : idOrAlias
  return LOCAL_GEMMA_MODELS.find((model) => model.alias === alias)
}

export function recommendLocalGemma(totalMemoryBytes: number): LocalLlmModel {
  return LOCAL_GEMMA_MODELS.filter(
    (model) => totalMemoryBytes >= model.minimumMemoryBytes,
  ).at(-1) ?? LOCAL_GEMMA_MODELS[0]
}
