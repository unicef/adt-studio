import { useAtom } from "jotai"
import { SettingsSection } from "@/features/settings/components/SettingsSection"
import { SegmentedRow } from "@/features/settings/components/SegmentedRow"
import { ToggleRow } from "@/features/settings/components/ToggleRow"
import { useCommentsContext } from "@/features/comments/hooks/useCommentsContext"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import { commentsHiddenAtom } from "@/features/comments/state/comments.atoms"
import { announceToScreenReader } from "@/shared/lib/aria-live"
import { useIsMobile } from "@/shared/hooks/use-is-mobile"
import { devicePreviewAtom, type DevicePreview } from "@/shared/state/ui.atoms"

/**
 * The two settings that only exist for a book being reviewed through a share link.
 *
 * The whole section is absent from a downloaded book, an EPUB or a plain web export: without a
 * publication there are no comments to hide and nobody to preview a layout for.
 *
 * Device preview is desktop-only. On a phone the answer to "what does this look like on a
 * phone" is already on screen, and letterboxing a reader inside their own device would be a
 * strange thing to offer them.
 */
export function ReviewingSection() {
  const context = useCommentsContext()
  const { t } = useCommentsText()
  const isMobile = useIsMobile()
  const [hidden, setHidden] = useAtom(commentsHiddenAtom)
  const [preview, setPreview] = useAtom(devicePreviewAtom)

  if (!context) return null

  return (
    <SettingsSection title={t("comments-label")}>
      <ToggleRow
        label={t("comments-hidden-setting-label")}
        checked={!(hidden as boolean)}
        onChange={(next) => {
          setHidden(!next)
          /** Turning them off takes away the pins, the cursors and the roster at once, which
           *  from behind a screen reader is a page that went quiet for no stated reason. */
          if (!next) announceToScreenReader(t("comments-hidden-toast-label"))
        }}
      />
      {isMobile ? null : (
        <SegmentedRow<DevicePreview>
          label={t("comments-device-preview-label")}
          value={preview as DevicePreview}
          onChange={setPreview}
          options={[
            { value: "full", label: t("comments-device-full-label") },
            { value: "tablet", label: t("comments-device-tablet-label") },
            { value: "phone", label: t("comments-device-phone-label") },
          ]}
        />
      )}
    </SettingsSection>
  )
}
