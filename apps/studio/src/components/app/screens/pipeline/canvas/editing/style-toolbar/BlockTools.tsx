import { useLingui } from "@lingui/react/macro"
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  PaintBucket,
  Scaling,
  SquareDashed,
  Radius,
} from "lucide-react"
import {
  backgroundColorClassMap,
  borderRadiusClassMap,
  heightClassMap,
  paddingClassMap,
  widthClassMap,
} from "@/components/pipeline/stages/storyboard/components/style-editor/class-maps"
import { edit, readValue, selfAlignClassMap, type SelfAlign } from "./classEdits"
import { Choice, ColorSwatches, toHex } from "./fields"
import { ColorBar, ICON_WIDTH, PopoverSection, PopoverTool, type StyleTarget, type ToolbarItem } from "./parts"
import { deleteItem } from "./TextTools"
import { CORNER_PX, IMAGE_WIDTH, PADDING_PX, keyFor, uniformBox, uniformValue, type ImageSize, type Step } from "./toolbarModel"
import { usePagePalette } from "./usePagePalette"

const SELF_ALIGN_ICONS = {
  left: AlignHorizontalJustifyStart,
  center: AlignHorizontalJustifyCenter,
  right: AlignHorizontalJustifyEnd,
} as const

export function useImageTools(target: StyleTarget): ToolbarItem[] {
  const { t } = useLingui()
  const { classes, device, apply } = target
  const width = readValue(classes, device, widthClassMap)
  const sizeKey = width?.unit === "%" ? keyFor(IMAGE_WIDTH, width.value) : null
  const alignKey = readValue(classes, device, selfAlignClassMap)
  const AlignIcon = SELF_ALIGN_ICONS[alignKey ?? "center"]
  const corner = keyFor(CORNER_PX, uniformValue(readValue(classes, device, borderRadiusClassMap)) ?? 0)

  return [
    {
      key: "size",
      label: t`Image size`,
      width: ICON_WIDTH,
      group: "image",
      priority: 1,
      node: (
        <PopoverTool label={t`Image size`} trigger={<Scaling aria-hidden className="size-3.5" />}>
          <PopoverSection title={sizeKey ? t`Image size` : t`Image size, set by the layout now`}>
            <Choice<ImageSize>
              label={t`Image size`}
              value={sizeKey}
              className="w-60"
              onChange={(key) =>
                apply([edit(widthClassMap, { value: IMAGE_WIDTH[key], unit: "%" }), edit(heightClassMap, { value: "auto", unit: "auto" })])
              }
              options={[
                { value: "small", label: t`Small` },
                { value: "medium", label: t`Medium` },
                { value: "large", label: t`Large` },
                { value: "full", label: t`Full` },
              ]}
            />
          </PopoverSection>
        </PopoverTool>
      ),
    },
    {
      key: "align",
      label: t`Image alignment`,
      width: ICON_WIDTH,
      group: "image",
      priority: 2,
      node: (
        <PopoverTool label={t`Image alignment`} trigger={<AlignIcon aria-hidden className="size-3.5" />} contentClassName="p-1.5">
          <Choice<SelfAlign>
            label={t`Image alignment`}
            value={alignKey}
            className="w-32"
            onChange={(key) => apply([edit(selfAlignClassMap, key)])}
            options={[
              { value: "left", label: <AlignHorizontalJustifyStart aria-hidden className="size-3.5" />, title: t`Left` },
              { value: "center", label: <AlignHorizontalJustifyCenter aria-hidden className="size-3.5" />, title: t`Centre` },
              { value: "right", label: <AlignHorizontalJustifyEnd aria-hidden className="size-3.5" />, title: t`Right` },
            ]}
          />
        </PopoverTool>
      ),
    },
    {
      key: "corners",
      label: t`Corners`,
      width: ICON_WIDTH,
      group: "image",
      priority: 3,
      node: (
        <PopoverTool label={t`Corners`} trigger={<Radius aria-hidden className="size-3.5" />} contentClassName="p-1.5">
          <Choice<Step>
            label={t`Corners`}
            value={corner}
            className="w-44"
            onChange={(key) => apply([edit(borderRadiusClassMap, uniformBox(CORNER_PX[key]))])}
            options={(Object.keys(CORNER_PX) as Step[]).map((key) => ({
              value: key,
              title: key === "none" ? t`Square` : key === "small" ? t`Slightly rounded` : key === "medium" ? t`Rounded` : t`Very rounded`,
              label: (
                <span aria-hidden className="block size-4 border-[1.5px] border-current" style={{ borderRadius: Math.min(CORNER_PX[key] / 3, 8) }} />
              ),
            }))}
          />
        </PopoverTool>
      ),
    },
    deleteItem(t`Delete image`, target.remove),
  ]
}

export function useContainerTools(target: StyleTarget): ToolbarItem[] {
  const { t } = useLingui()
  const palette = usePagePalette(target.label, target.pageId)
  const { classes, device, apply } = target
  const background = readValue(classes, device, backgroundColorClassMap) ?? ""
  const padding = keyFor(PADDING_PX, uniformValue(readValue(classes, device, paddingClassMap)))

  return [
    {
      key: "background",
      label: t`Background colour`,
      width: ICON_WIDTH,
      group: "box",
      priority: 1,
      node: (
        <PopoverTool
          label={t`Background colour`}
          trigger={<ColorBar icon={<PaintBucket aria-hidden className="size-3.5" />} color={toHex(background)} />}
          contentClassName="w-64"
        >
          <ColorSwatches
            label={t`Background colour`}
            value={background}
            palette={palette}
            onChange={(value) => apply([edit(backgroundColorClassMap, value)])}
          />
        </PopoverTool>
      ),
    },
    {
      key: "padding",
      label: t`Padding`,
      width: ICON_WIDTH,
      group: "box",
      priority: 2,
      node: (
        <PopoverTool label={t`Padding`} trigger={<SquareDashed aria-hidden className="size-3.5" />}>
          <PopoverSection title={t`Space inside`}>
            <Choice<Step>
              label={t`Padding`}
              value={padding}
              className="w-56"
              onChange={(key) => apply([edit(paddingClassMap, uniformBox(PADDING_PX[key]))])}
              options={[
                { value: "none", label: t`None` },
                { value: "small", label: t`S` },
                { value: "medium", label: t`M` },
                { value: "large", label: t`L` },
              ]}
            />
          </PopoverSection>
        </PopoverTool>
      ),
    },
    deleteItem(t`Delete container`, target.remove),
  ]
}
