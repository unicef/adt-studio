import type { ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import {
  AlignCenterHorizontal,
  AlignHorizontalSpaceBetween,
  CaseSensitive,
  Layers,
  MessageSquare,
  MoveHorizontal,
  PanelBottom,
  PanelLeft,
  PanelLeftOpen,
  PanelRight,
  PanelRightOpen,
  PanelTop,
  Maximize2,
  Minimize2,
  Shapes,
  Tag,
} from "lucide-react"
import type { ReaderUiLayout } from "@adt/types"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn } from "@/lib/utils"
import type { ReaderUiDraft } from "../hooks/use-reader-ui-draft"
import { READER_STEP_ACCENT } from "../lib/accent"

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span> : null}
    </div>
  )
}

interface FieldProps {
  draft: ReaderUiDraft
}

function useSetter(draft: ReaderUiDraft) {
  return <K extends keyof ReaderUiLayout>(key: K) => (value: Required<ReaderUiLayout>[K]) =>
    draft.setLayout(key, value)
}

const icon = "h-3.5 w-3.5"

export function DockPositionField({ draft }: FieldProps) {
  const { t } = useLingui()
  const set = useSetter(draft)
  const position = draft.layout.dock_position
  const vertical = position === "left" || position === "right"
  return (
    <Field label={t`Dock position`} hint={vertical ? t`On phones a side rail falls back to a bottom bar.` : undefined}>
      <SegmentedControl
        color={READER_STEP_ACCENT}
        value={position}
        onValueChange={set("dock_position")}
        options={[
          { value: "bottom", label: t`Bottom`, icon: <PanelBottom className={icon} /> },
          { value: "top", label: t`Top`, icon: <PanelTop className={icon} /> },
          { value: "left", label: t`Left`, icon: <PanelLeft className={icon} /> },
          { value: "right", label: t`Right`, icon: <PanelRight className={icon} /> },
        ]}
      />
    </Field>
  )
}

export function DockSizeField({ draft }: FieldProps) {
  const { t } = useLingui()
  const set = useSetter(draft)
  const vertical = draft.layout.dock_position === "left" || draft.layout.dock_position === "right"
  return (
    <Field label={t`Dock size`}>
      <SegmentedControl
        color={READER_STEP_ACCENT}
        value={draft.layout.dock_width}
        onValueChange={set("dock_width")}
        options={[
          { value: "full", label: vertical ? t`Edge` : t`Full`, icon: <Maximize2 className={icon} /> },
          { value: "compact", label: t`Floating`, icon: <Minimize2 className={icon} /> },
        ]}
      />
    </Field>
  )
}

export function DockToolsField({ draft }: FieldProps) {
  const { t } = useLingui()
  const set = useSetter(draft)
  return (
    <Field label={t`Tools`}>
      <SegmentedControl
        color={READER_STEP_ACCENT}
        value={draft.layout.dock_align}
        onValueChange={set("dock_align")}
        options={[
          { value: "spread", label: t`Spread`, icon: <AlignHorizontalSpaceBetween className={icon} /> },
          { value: "center", label: t`Grouped`, icon: <AlignCenterHorizontal className={icon} /> },
        ]}
      />
    </Field>
  )
}

export function ButtonStyleField({ draft }: FieldProps) {
  const { t } = useLingui()
  const set = useSetter(draft)
  return (
    <Field label={t`Buttons`} hint={t`On phones buttons always show the icon only.`}>
      <SegmentedControl
        color={READER_STEP_ACCENT}
        value={draft.layout.button_style}
        onValueChange={set("button_style")}
        options={[
          { value: "icon", label: t`Icon`, icon: <Shapes className={icon} /> },
          { value: "icon-label", label: t`Icon + label`, icon: <Tag className={icon} /> },
          { value: "label", label: t`Label`, icon: <CaseSensitive className={icon} /> },
        ]}
      />
    </Field>
  )
}

export function PanelStyleField({ draft }: FieldProps) {
  const { t } = useLingui()
  const set = useSetter(draft)
  return (
    <Field
      label={t`Panels (contents, glossary, language, settings)`}
      hint={draft.layout.panel_style === "drawer" ? t`On phones panels always open as a bottom sheet.` : undefined}
    >
      <SegmentedControl
        color={READER_STEP_ACCENT}
        value={draft.layout.panel_style}
        onValueChange={set("panel_style")}
        options={[
          { value: "popover", label: t`Popover`, icon: <MessageSquare className={icon} /> },
          { value: "drawer", label: t`Side drawer`, icon: <PanelLeftOpen className={icon} /> },
        ]}
      />
    </Field>
  )
}

export function DrawerSideField({ draft }: FieldProps) {
  const { t } = useLingui()
  const set = useSetter(draft)
  return (
    <Field label={t`Drawer side`}>
      <SegmentedControl
        color={READER_STEP_ACCENT}
        value={draft.layout.panel_side}
        onValueChange={set("panel_side")}
        options={[
          { value: "left", label: t`Left`, icon: <PanelLeftOpen className={icon} /> },
          { value: "right", label: t`Right`, icon: <PanelRightOpen className={icon} /> },
        ]}
      />
    </Field>
  )
}

export function DrawerBehaviorField({ draft }: FieldProps) {
  const { t } = useLingui()
  const set = useSetter(draft)
  return (
    <Field label={t`When open`}>
      <SegmentedControl
        color={READER_STEP_ACCENT}
        value={draft.layout.panel_behavior}
        onValueChange={set("panel_behavior")}
        options={[
          { value: "overlay", label: t`Overlay`, icon: <Layers className={icon} /> },
          { value: "push", label: t`Push`, icon: <MoveHorizontal className={icon} /> },
        ]}
      />
    </Field>
  )
}

/** Every layout field in its usual arrangement. */
export function LayoutControls({ draft, className }: FieldProps & { className?: string }) {
  const drawer = draft.layout.panel_style === "drawer"
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <DockPositionField draft={draft} />
      <div className="grid grid-cols-2 gap-3">
        <DockSizeField draft={draft} />
        <DockToolsField draft={draft} />
      </div>
      <ButtonStyleField draft={draft} />
      <PanelStyleField draft={draft} />
      {drawer ? (
        <div className="grid grid-cols-2 gap-3">
          <DrawerSideField draft={draft} />
          <DrawerBehaviorField draft={draft} />
        </div>
      ) : null}
    </div>
  )
}
