import { BASE_URL } from "@/api/client"
import { AiImageDialog } from "./AiImageDialog"
import { ImageCropDialog, pageBoundsToCropRect } from "./ImageCropDialog"
import { ReplaceFromBookDialog } from "./ReplaceFromBookDialog"
import { SegmentPreviewDialog } from "./SegmentPreviewDialog"
import type { SectionElementActions } from "./useSectionElementActions"

export function SectionElementDialogs({ actions }: { actions: SectionElementActions }) {
  const dialogs = actions.dialogs
  const { bookLabel } = dialogs
  const cropBounds = dialogs.recropPageSrc && dialogs.cropTarget
    ? dialogs.imagesMeta.find((meta) => meta.imageId === dialogs.cropTarget)?.bounds
    : undefined
  return (
    <>
      <input ref={dialogs.fileInputRef} type="file" accept="image/*" className="hidden" onChange={dialogs.uploadReplacement} />

      {dialogs.cropTarget && (
        <ImageCropDialog
          imageSrc={dialogs.recropPageSrc ?? `${BASE_URL}/books/${bookLabel}/images/${dialogs.cropTarget}`}
          initialRect={cropBounds ? pageBoundsToCropRect(cropBounds) : undefined}
          onApply={dialogs.applyCrop}
          onClose={dialogs.closeCrop}
        />
      )}

      {dialogs.replaceFromBookTarget && (
        <ReplaceFromBookDialog
          bookLabel={bookLabel}
          currentImageId={dialogs.replaceFromBookTarget}
          onSelect={dialogs.selectFromBook}
          onClose={dialogs.closeReplaceFromBook}
        />
      )}

      {dialogs.aiImageDialogTarget && (
        <AiImageDialog
          currentImageSrc={`${BASE_URL}/books/${bookLabel}/images/${dialogs.aiImageDialogTarget}`}
          imageId={dialogs.aiImageDialogTarget}
          bookLabel={bookLabel}
          onSubmit={dialogs.submitAiImage}
          onClose={dialogs.closeAiImage}
        />
      )}

      {dialogs.segmentPreview && (
        <SegmentPreviewDialog
          imageSrc={dialogs.segmentPreview.imageSrc}
          imageWidth={dialogs.segmentPreview.imageWidth}
          imageHeight={dialogs.segmentPreview.imageHeight}
          regions={dialogs.segmentPreview.regions}
          onApply={dialogs.applySegments}
          onClose={dialogs.closeSegment}
        />
      )}
    </>
  )
}
