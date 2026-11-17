import { ViewportToggle } from "../../storyboard/components/style-editor/ViewportToggle"
import type { DeviceView } from "../../storyboard/components/style-editor/device-breakpoint"

interface HeaderControlsProps {
  device: DeviceView
  onDeviceChange: (next: DeviceView) => void
}

/**
 * Lives in the coloured step header: which device the preview shows. Centred
 * on the bar itself (StepHeaderBar is `relative`), so the title and any
 * header actions cannot push it off-centre.
 */
export function HeaderControls({ device, onDeviceChange }: HeaderControlsProps) {
  return (
    <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3">
      <ViewportToggle value={device} onChange={onDeviceChange} />
    </div>
  )
}
