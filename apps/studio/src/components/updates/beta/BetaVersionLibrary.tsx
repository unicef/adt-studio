import { useLingui } from "@lingui/react/macro"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { AvailableRelease } from "@/hooks/use-update-status"
import { cn, formatBytes } from "@/lib/utils"
import { ReleaseCover } from "./ReleaseCover"
import { ReleaseDirectionBadge } from "./ReleaseDirectionBadge"
import { formatVersion } from "../release-banner-utils"

interface BetaVersionLibraryProps {
  releases: readonly AvailableRelease[]
  initialActiveVersion?: string
  disabled: boolean
  onOpen: (version: string) => void
  onCardRef?: (version: string, node: HTMLButtonElement | null) => void
}

export function BetaVersionLibrary({
  releases,
  initialActiveVersion,
  disabled,
  onOpen,
  onCardRef,
}: BetaVersionLibraryProps) {
  const { t } = useLingui()
  const [activeVersion, setActiveVersion] = useState(
    initialActiveVersion ?? releases[0]?.version,
  )
  const cards = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    if (
      activeVersion &&
      releases.some((release) => release.version === activeVersion)
    ) {
      return
    }
    setActiveVersion(initialActiveVersion ?? releases[0]?.version)
  }, [activeVersion, initialActiveVersion, releases])

  const focusCard = (index: number) => {
    const release = releases[index]
    if (!release) return
    setActiveVersion(release.version)
    requestAnimationFrame(() => cards.current.get(release.version)?.focus())
  }

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
    release: AvailableRelease,
  ) => {
    if (disabled) return
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault()
      focusCard((index + 1) % releases.length)
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault()
      focusCard((index - 1 + releases.length) % releases.length)
    } else if (event.key === "Home") {
      event.preventDefault()
      focusCard(0)
    } else if (event.key === "End") {
      event.preventDefault()
      focusCard(releases.length - 1)
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onOpen(release.version)
    }
  }

  return (
    <div
      role="list"
      aria-label={t`Beta release library`}
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {releases.map((release, index) => {
        const title = release.title ?? formatVersion(release.version)
        return (
          <div key={release.version} role="listitem" className="min-w-0">
            <button
              ref={(node) => {
                if (node) cards.current.set(release.version, node)
                else cards.current.delete(release.version)
                onCardRef?.(release.version, node)
              }}
              type="button"
              aria-label={t`Open details for ${title}`}
              disabled={disabled}
              tabIndex={release.version === activeVersion ? 0 : -1}
              onClick={() => onOpen(release.version)}
              onKeyDown={(event) => handleKeyDown(event, index, release)}
              className="h-full w-full cursor-pointer rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              <Card
                className={cn(
                  "flex h-full flex-col overflow-hidden shadow-none",
                  "hover:bg-accent/20",
                )}
              >
                <CardContent className="p-0">
                  <ReleaseCover release={release} compact />
                </CardContent>
                <CardHeader className="gap-1 space-y-0 p-3 pb-2">
                  <CardTitle className="line-clamp-2 text-sm leading-5">
                    {title}
                  </CardTitle>
                  <CardDescription className="font-mono text-[11px] tabular-nums">
                    {formatVersion(release.version)}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="mt-auto flex-wrap gap-2 p-3 pt-0">
                  <ReleaseDirectionBadge direction={release.direction} />
                  {release.totalBytes != null && (
                    <span
                      className="ml-auto font-mono text-xs tabular-nums text-accent-foreground"
                    >
                      {formatBytes(release.totalBytes)}
                    </span>
                  )}
                </CardFooter>
              </Card>
            </button>
          </div>
        )
      })}
    </div>
  )
}
