export interface ImageReference {
  data: Buffer
  mimeType?: string
  name?: string
}

export interface ImageGenerateRequest {
  prompt: string
  /** `WxH`, validated against the backend's declared sizes. */
  size?: string
  /** Preferred width / height; adapters select a supported size without resizing inputs. */
  aspectRatio?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export interface ImageEditRequest extends ImageGenerateRequest {
  referenceImages: ImageReference[]
}

export interface ImageResult {
  base64: string
  mimeType: string
}

export interface ImageBackend {
  generate(request: ImageGenerateRequest): Promise<ImageResult>
  /** Only present when the backend declares the `edit` capability. */
  edit?(request: ImageEditRequest): Promise<ImageResult>
}
