import { useLingui } from "@lingui/react/macro"

export function StyleValues({ values, computed }: { values: Record<string, string>; computed: Record<string, string> }) {
  const { t } = useLingui()
  return <dl className="space-y-1 font-mono text-[11px]">
    {Object.entries(values).map(([property, value]) => <div key={property} className="flex flex-wrap items-baseline justify-between gap-x-2" data-style-property={property}>
      <dt className="text-muted-foreground">{property}</dt>
      <dd className="min-w-0 break-words text-right">
        <span>{value}</span>
        {value.includes("%") && /^-?[\d.]+px$/.test(computed[property] ?? "") && <span className="ml-2 text-[10px] text-muted-foreground" title={t`Rendered size`} data-rendered-value={property}>
          {" "}{Math.round(parseFloat(computed[property]))}px
        </span>}
      </dd>
    </div>)}
  </dl>
}
