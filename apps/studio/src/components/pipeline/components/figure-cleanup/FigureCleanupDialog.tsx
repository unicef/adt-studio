import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Sparkles } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { ImageCleanupRegion, ImageCleanupCandidate } from "@adt/types"
import { DEFAULT_IMAGE_GENERATION_MODEL_ID, DEFAULT_GOOGLE_IMAGE_MODEL } from "@adt/types"
import { api, BASE_URL } from "@/api/client"
import { usePageImage } from "@/hooks/use-pages"
import { useActiveConfig } from "@/hooks/use-debug"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FigureRegionPicker } from "./FigureRegionPicker"

export function FigureCleanupDialog({ bookLabel, pageId, imageId, expectedVersion, bounds, onClose }: {
  bookLabel: string
  pageId: string
  imageId: string
  expectedVersion: number | null
  bounds?: ImageCleanupRegion
  onClose: () => void
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const pageImage = usePageImage(bookLabel, pageId)
  const config = useActiveConfig(bookLabel)
  const [selectedModel, setSelectedModel] = useState<string>()
  const configuredModel = config.data?.merged.default_image_generation_model
  const defaultModel = typeof configuredModel === "string" ? configuredModel : DEFAULT_IMAGE_GENERATION_MODEL_ID
  const requestModel = selectedModel ?? defaultModel
  const googleModel = `google:${DEFAULT_GOOGLE_IMAGE_MODEL}`
  const [region, setRegion] = useState<ImageCleanupRegion>(() => bounds
    ? { x: Math.max(0, Math.round(bounds.x * 2)), y: Math.max(0, Math.round(bounds.y * 2)), width: Math.max(16, Math.round(bounds.width * 2)), height: Math.max(16, Math.round(bounds.height * 2)) }
    : { x: 0, y: 0, width: 100, height: 100 })
  const [prompt, setPrompt] = useState(t`Extract the complete figure from this crop of the original PDF page. Remove surrounding page background, unrelated text, and fragments of neighboring figures. Preserve the figure's shapes, colors, proportions, and all labels and text belonging to it exactly. Do not redraw, invent, translate, or repair missing content. Keep the entire figure without clipping. Use a transparent background if supported; otherwise use a plain white background. Return only the isolated figure.`)
  const [candidate, setCandidate] = useState<ImageCleanupCandidate | null>(null)
  const [validRegion, setValidRegion] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  const generate = useMutation({
    mutationFn: async () => {
      controller.current = new AbortController()
      return api.cleanExtractedImage(bookLabel, pageId, { sourceImageId: imageId, region, prompt, expectedVersion, modelId: requestModel },
        AbortSignal.any([controller.current.signal, AbortSignal.timeout(200_000)]))
    },
    onSuccess: setCandidate,
  })
  const accept = useMutation({
    mutationFn: () => api.acceptImageCleanup(bookLabel, pageId, candidate!.imageId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel] }),
        queryClient.invalidateQueries({ queryKey: ["debug", "versions", bookLabel, "image-filtering", pageId] }),
        queryClient.invalidateQueries({ queryKey: ["debug", "versions", bookLabel, "page-sectioning"] }),
        queryClient.invalidateQueries({ queryKey: ["debug", "versions", bookLabel, "web-rendering"] }),
      ])
      onClose()
    },
  })
  const busy = generate.isPending || accept.isPending
  const error = generate.error ?? accept.error
  const modelId = candidate?.modelId ?? requestModel
  const imageUrl = (id: string) => `${BASE_URL}/books/${bookLabel}/images/${id}`

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !accept.isPending) onClose() }}>
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto" onInteractOutside={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          // ExtractView listens for these on window to navigate between pages.
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.stopPropagation()
        }}>
        <div className="space-y-2 pr-8">
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-5 text-violet-500" /><Trans>Clean up figure</Trans></DialogTitle>
          <DialogDescription><Trans>Experimental · Select the correct figure on the page, clean it with AI, then compare before accepting.</Trans></DialogDescription>
        </div>
        {candidate ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { id: imageId, label: t`Current image` },
                { id: candidate.cropImageId, label: t`Selected page region` },
                { id: candidate.imageId, label: t`Cleaned candidate` },
              ].map((item) => (
                <figure key={item.id} className="space-y-2">
                  <figcaption className="text-sm font-medium">{item.label}</figcaption>
                  <a href={imageUrl(item.id)} target="_blank" rel="noreferrer" className="flex h-72 items-center justify-center rounded-lg border bg-muted/30 p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                    <img src={imageUrl(item.id)} alt={item.label} className="max-h-full max-w-full object-contain" />
                  </a>
                </figure>
              ))}
            </div>
            <p className="text-sm text-muted-foreground"><Trans>Check labels, fine details, and edges against the page crop. Click an image to inspect it at full size. AI can change content; transparency depends on the image model.</Trans></p>
            <p className="text-sm text-muted-foreground"><Trans>Accepting updates this image in Extract and wherever it appears in Storyboard. Each changed page gets a new version, preserving its layout and text. Earlier versions remain available in history.</Trans></p>
          </>
        ) : (
          <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
            {pageImage.data ? <FigureRegionPicker imageSrc={`data:image/png;base64,${pageImage.data.imageBase64}`} region={region} onChange={setRegion} onValidityChange={setValidRegion} disabled={busy} />
              : <p role="status">{pageImage.isError ? t`Could not load the original page.` : t`Loading page…`}</p>}
            <div className="space-y-4">
              <figure className="space-y-2">
                <figcaption className="text-sm font-medium"><Trans>Current image</Trans></figcaption>
                <img src={imageUrl(imageId)} alt={t`Current image`} className="max-h-32 max-w-full rounded border object-contain" />
              </figure>
              <label className="block space-y-2 text-sm font-medium">
                <span><Trans>Image model</Trans></span>
                <select value={requestModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={busy || config.isLoading}
                  className="w-full rounded-md border bg-background p-2 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                  <option value={DEFAULT_IMAGE_GENERATION_MODEL_ID}><Trans>GPT Image 2.5 Flare (OpenAI)</Trans></option>
                  <option value={googleModel}><Trans>Nano Banana (Google)</Trans></option>
                  {defaultModel !== DEFAULT_IMAGE_GENERATION_MODEL_ID && defaultModel !== googleModel && <option value={defaultModel}>{defaultModel}</option>}
                </select>
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span><Trans>Cleanup instructions</Trans></span>
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={busy} maxLength={4000}
                  className="min-h-56 w-full resize-y rounded-md border bg-background p-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" />
              </label>
              <p className="text-xs text-muted-foreground"><Trans>The model receives the selected page region. Your current image is kept until you accept a result.</Trans></p>
            </div>
          </div>
        )}
        {modelId && <p className="text-xs text-muted-foreground"><Trans>Image model: {modelId}</Trans></p>}
        {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <span role="status" className="mr-auto text-sm text-muted-foreground">
            {generate.isPending && <Trans>Cleaning the selected figure…</Trans>}
            {candidate?.cached && <Trans>Reused a cached result.</Trans>}
          </span>
          <Button variant="outline" disabled={accept.isPending} onClick={onClose}><Trans>Cancel</Trans></Button>
          {candidate ? <>
            <Button variant="outline" disabled={busy} onClick={() => { setCandidate(null); generate.reset(); accept.reset() }}><Trans>Adjust and retry</Trans></Button>
            <Button disabled={busy} onClick={() => accept.mutate()}>{accept.isPending && <Loader2 className="size-4 animate-spin" />}<Trans>Accept cleaned figure</Trans></Button>
          </> : <Button disabled={busy || config.isLoading || !pageImage.data || !prompt.trim() || !validRegion} onClick={() => generate.mutate()}>
            {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}<Trans>Clean selected region</Trans>
          </Button>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
