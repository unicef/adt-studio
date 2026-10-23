import type { ReactNode } from "react"

export function DetailPaneSide({ image, children }: { image: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-6">
      <div className="w-[40%] shrink-0 self-start lg:sticky lg:top-0">{image}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
    </div>
  )
}
