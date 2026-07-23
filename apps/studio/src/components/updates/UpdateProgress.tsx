export function IndeterminateBar() {
  return (
    <div
      aria-hidden
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary motion-safe:animate-indeterminate" />
    </div>
  )
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-150"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
