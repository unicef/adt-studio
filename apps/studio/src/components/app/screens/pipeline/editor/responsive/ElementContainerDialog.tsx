import { useLingui } from "@lingui/react/macro"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { useElementContainer } from "./useElementContainer"

export function ElementContainerDialog({ container }: { container: ReturnType<typeof useElementContainer> }) {
  const { t } = useLingui()
  return <Dialog open={container.open} onOpenChange={open => { if (!open) container.close() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{container.canWrap
          ? container.image ? t`Give this image its own container?` : t`Give this component room to resize?`
          : container.image ? t`Move this image with its parent` : t`Select a parent to change this layout`}</DialogTitle>
        <DialogDescription>{container.canWrap
          ? container.slot
            ? t`Add a container that uses the available space in this row or column. Keep the component together and start at its current width, then use the corner handles to resize it inside that space. This can redistribute space between neighbouring items. Undo restores the original layout.`
            : container.image
              ? t`Add a full-width container around this image. Its size and image details stay the same. Resize or align it inside the container. Where the surrounding layout allows it, drag vertically to move the whole block. Undo removes the container.`
              : t`Add a full-width container around the selected component, keeping its content and decoration together. Use the corner handles to resize it inside the container. Undo removes the container.`
          : container.image
            ? t`This image belongs to text or a constrained layout. Adding a container here could change the surrounding content. Select its parent to move the content together, or use the Styles panel.`
            : t`This component has locked content or a layout that cannot safely be wrapped. Select its parent or use the Styles panel.`}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={container.close}>{t`Cancel`}</Button>
        {container.canWrap ? <Button onClick={container.wrap}>{t`Wrap in container`}</Button>
          : container.canSelectParent && <Button onClick={container.selectParent}>{t`Select parent`}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
