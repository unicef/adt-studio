import { useLingui } from "@lingui/react/macro"
import type { RoomPeer } from "@adt/types"
import { readableTextColor } from "./lib/threads"

/** Three faces and a "+n": the panel header is 360px wide and already carries a count badge. */
const MAX_FACES = 3

function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "?"
}

/**
 * Who is reading the published book right now, in the feedback panel's header.
 *
 * Absent when nobody is — presence that says "0 people" is noise, and this header is the one
 * place the author looks to decide whether feedback is still arriving. It is also the accessible
 * face of presence: the reviewer cursors on the frame are decorative, so the names and the count
 * are announced here.
 */
export function PresenceChip({ peers }: { peers: RoomPeer[] }) {
  const { t } = useLingui()
  if (peers.length === 0) return null

  const faces = peers.slice(0, MAX_FACES)
  const overflow = peers.length - faces.length
  const names = peers.map((peer) => peer.name).join(", ")
  const label = peers.length === 1 ? t`1 reader here` : t`${peers.length} readers here`

  return (
    <span
      role="status"
      aria-live="polite"
      title={names}
      className="flex items-center gap-1.5 rounded-full bg-muted/60 py-0.5 pl-0.5 pr-2 duration-300 animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none"
    >
      <span className="flex items-center">
        {faces.map((peer, index) => (
          <span
            key={peer.id}
            style={{ backgroundColor: peer.color, color: readableTextColor(peer.color) }}
            className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold leading-none ring-2 ring-background duration-300 animate-in zoom-in-50 motion-reduce:animate-none ${
              index === 0 ? "" : "-ml-1"
            }`}
          >
            {initialOf(peer.name)}
          </span>
        ))}
        {overflow > 0 ? (
          <span className="-ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground/70 px-0.5 text-[9px] font-bold leading-none text-background ring-2 ring-background">
            {`+${overflow}`}
          </span>
        ) : null}
      </span>
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:animate-none" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
    </span>
  )
}
