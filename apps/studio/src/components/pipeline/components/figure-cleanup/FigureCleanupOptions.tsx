import { Trans } from "@lingui/react/macro"
import { DEFAULT_IMAGE_GENERATION_MODEL_ID, DEFAULT_GOOGLE_IMAGE_MODEL, type ImageCleanupRequest } from "@adt/types"

export function FigureCleanupOptions({ removeBackground, inputSource, onInputSource, modelId, defaultModel, onModel, prompt, onPrompt, disabled }: {
  removeBackground: boolean
  inputSource: NonNullable<ImageCleanupRequest["inputSource"]>
  onInputSource: (source: NonNullable<ImageCleanupRequest["inputSource"]>) => void
  modelId: string
  defaultModel: string
  onModel: (model: string) => void
  prompt: string
  onPrompt: (prompt: string) => void
  disabled: boolean
}) {
  const googleModel = `google:${DEFAULT_GOOGLE_IMAGE_MODEL}`
  if (removeBackground) return <div className="space-y-4">
    <label className="block space-y-2 text-sm font-medium">
      <span><Trans>Image to process</Trans></span>
      <select value={inputSource} onChange={(event) => onInputSource(event.target.value === "current-image" ? "current-image" : "page-region")}
        disabled={disabled} className="w-full rounded-md border bg-background p-2 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        <option value="current-image"><Trans>Current image</Trans></option>
        <option value="page-region"><Trans>Selected page region</Trans></option>
      </select>
    </label>
    <p className="text-sm text-muted-foreground"><Trans>Replicate isolates the foreground and returns a transparent PNG. Review labels and thin lines before accepting.</Trans></p>
    <a href="/settings/providers#settings-provider-replicate" target="_blank" rel="noreferrer" className="block text-sm text-primary underline">
      <Trans>Configure Replicate API token</Trans>
    </a>
  </div>
  return <div className="space-y-4">
    <label className="block space-y-2 text-sm font-medium">
      <span><Trans>Image model</Trans></span>
      <select value={modelId} onChange={(event) => onModel(event.target.value)} disabled={disabled}
        className="w-full rounded-md border bg-background p-2 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        <option value={DEFAULT_IMAGE_GENERATION_MODEL_ID}><Trans>GPT Image 2.5 Flare (OpenAI)</Trans></option>
        <option value={googleModel}><Trans>Nano Banana (Google)</Trans></option>
        {defaultModel !== DEFAULT_IMAGE_GENERATION_MODEL_ID && defaultModel !== googleModel && <option value={defaultModel}>{defaultModel}</option>}
      </select>
    </label>
    <label className="block space-y-2 text-sm font-medium">
      <span><Trans>Cleanup instructions</Trans></span>
      <textarea value={prompt} onChange={(event) => onPrompt(event.target.value)} disabled={disabled} maxLength={4000}
        className="min-h-56 w-full resize-y rounded-md border bg-background p-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" />
    </label>
    <p className="text-xs text-muted-foreground"><Trans>The model receives the selected page region. Your current image is kept until you accept a result.</Trans></p>
  </div>
}
