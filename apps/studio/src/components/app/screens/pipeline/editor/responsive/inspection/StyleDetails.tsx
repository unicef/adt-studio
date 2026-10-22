import { useLingui } from "@lingui/react/macro"

export function StyleDetails({ computed }: { computed: Record<string, string> }) {
  const { t } = useLingui()
  return <div className="text-[11px]">
    <dl className="space-y-1 font-mono text-[10px]">{Object.entries(computed).map(([property, value]) => <div key={property} className="flex justify-between gap-2">
      <dt className="break-all text-muted-foreground">{property}</dt><dd className="break-all text-right" data-computed-property={property}>{value}</dd>
    </div>)}</dl>
    {!Object.keys(computed).length && <p className="text-muted-foreground">{t`None`}</p>}
  </div>
}
