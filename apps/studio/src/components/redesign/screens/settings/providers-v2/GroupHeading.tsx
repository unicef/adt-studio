export function GroupHeading({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-2.5">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      {hint && <div className="mt-0.5 text-[12.5px] text-muted-foreground/80">{hint}</div>}
    </div>
  )
}
