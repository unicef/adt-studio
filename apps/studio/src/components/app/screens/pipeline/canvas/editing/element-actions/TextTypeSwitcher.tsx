import { Trans, useLingui } from "@lingui/react/macro"
import { Type } from "lucide-react"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { HEADER_BUTTON, HEADER_BUTTON_LABELLED, HEADER_MENU_OPEN, HeaderButtonTile } from "@/components/app/screens/pipeline/steps/shared/headerButton"

function humanizeRole(key: string): string {
  return key
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function TextTypeSwitcher({
  dataId,
  textType,
  textTypes,
  onChange,
}: {
  dataId: string
  textType: string | undefined
  textTypes: Record<string, string>
  onChange: (dataId: string, role: string) => void
}) {
  const { t } = useLingui()
  return (
    <section className="flex flex-col gap-2 border-b pt-3 pb-4">
      <span className="text-[12px] font-medium text-muted-foreground">
        <Trans>Text type</Trans>
      </span>
      <Select value={textType ?? ""} onValueChange={(value) => onChange(dataId, value)}>
        <SelectTrigger aria-label={t`Text type`} className={cn(HEADER_BUTTON, HEADER_BUTTON_LABELLED, HEADER_MENU_OPEN, "w-full justify-start text-[12.5px] [&>svg:last-child]:ml-auto")}>
          <HeaderButtonTile icon={Type} />
          <SelectValue placeholder={t`Choose a type`} />
        </SelectTrigger>
        <SelectContent>
          {Object.keys(textTypes).map((key) => (
            <SelectItem key={key} value={key}>
              {humanizeRole(key)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </section>
  )
}
