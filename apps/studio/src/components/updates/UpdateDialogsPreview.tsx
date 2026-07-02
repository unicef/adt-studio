/* eslint-disable lingui/no-unlocalized-strings */
import { type ReactNode } from "react"
import type { UpdateStatus } from "@/hooks/use-update-status"
import { PostUpdateContent } from "./PostUpdateDialog"
import { UpdateStateSurface } from "./UpdateDialog"

const CURRENT = "0.7.4-beta.1"
const STABLE_VERSION = "0.7.3"
const BETA_VERSION = "0.7.4-beta.2"
const BETA_RELEASE_DATE = "2026-07-02T04:56:29Z"
const BETA_TOTAL_BYTES = 155_086_007
const BETA_RELEASE_NOTES = `## What's Changed
* Fix: tts starts just on second sentence after page change by @zignaggo in https://github.com/unicef/adt-studio/pull/499
* feat(studio): screen-reader support for pipeline status & navigation by @elasticsounds in https://github.com/unicef/adt-studio/pull/507
* feat(extract): warn when a page has no text layer but vision recovered text by @gbergengruen in https://github.com/unicef/adt-studio/pull/513
* chore: ignore .zed and untrack stale TTS cache fixtures by @gbergengruen in https://github.com/unicef/adt-studio/pull/486
* fix: render-strategy switching at storyboard + consistent step re-run progression by @gbergengruen in https://github.com/unicef/adt-studio/pull/475
* feat(studio): settings save & re-run via floating bar + leave-guard by @Eliezir in https://github.com/unicef/adt-studio/pull/519
* feat(epub): glossary support for EPUB 3 export by @lest in https://github.com/unicef/adt-studio/pull/512
* feat(extract): add Segment image tool to the Extract image viewer by @elasticsounds in https://github.com/unicef/adt-studio/pull/522
* feat(studio): crop modes + recrop-from-page overlay & native crop res by @elasticsounds in https://github.com/unicef/adt-studio/pull/523
* Feature: custom fonts by @zignaggo in https://github.com/unicef/adt-studio/pull/506
* fix(extract): disambiguate same-size images in shared resource dicts by @elasticsounds in https://github.com/unicef/adt-studio/pull/524
* fix(studio): small-window layout issues in onboarding & wizard by @Eliezir in https://github.com/unicef/adt-studio/pull/525
* fix: only one audio track at a time by @zignaggo in https://github.com/unicef/adt-studio/pull/527
* fix: sign videos loop by @zignaggo in https://github.com/unicef/adt-studio/pull/526
* docs: add NEES and Ceibal supporter logos, theme-aware OpenAI by @Eliezir in https://github.com/unicef/adt-studio/pull/529
* feat: split a book into page-range parts and merge them back (#503) by @gbergengruen in https://github.com/unicef/adt-studio/pull/514
* Chore: Update dependencies by @zignaggo in https://github.com/unicef/adt-studio/pull/521
* fix(release): drop pnpm cache from prepare job by @Eliezir in https://github.com/unicef/adt-studio/pull/532
* fix(desktop): keep electron-builder plist on xmldom 0.8 line by @Eliezir in https://github.com/unicef/adt-studio/pull/533

**Full Changelog**: https://github.com/unicef/adt-studio/compare/v0.7.4-beta.1...v0.7.4-beta.2`

export function UpdateDialogsPreview() {
  const states: Array<{
    label: string
    note?: string
    status: UpdateStatus
  }> = [
    { label: "checking", status: { phase: "checking" } },
    {
      label: "available",
      status: {
        phase: "available",
        version: BETA_VERSION,
        releaseDate: BETA_RELEASE_DATE,
        releaseNotes: BETA_RELEASE_NOTES,
        totalBytes: BETA_TOTAL_BYTES,
      },
    },
    {
      label: "downloading",
      note: "cancelable",
      status: {
        phase: "downloading",
        version: BETA_VERSION,
        percent: 42,
        bytesPerSecond: 5_200_000,
        transferred: Math.round(BETA_TOTAL_BYTES * 0.42),
        total: BETA_TOTAL_BYTES,
      },
    },
    {
      label: "downloaded",
      status: {
        phase: "downloaded",
        version: BETA_VERSION,
        releaseNotes: BETA_RELEASE_NOTES,
      },
    },
    {
      label: "installing",
      status: { phase: "installing", version: BETA_VERSION },
    },
    { label: "not-available", status: { phase: "not-available" } },
    {
      label: "error",
      status: {
        phase: "error",
        message: "Example: net::ERR_INTERNET_DISCONNECTED",
      },
    },
  ]

  return (
    <div className="min-h-dvh bg-muted/40 p-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold">Update dialogs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Static previews for every update state, using the latest beta release
          data for the update flow and beta post-update dialog.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-8 lg:grid-cols-2">
        {states.map(({ label, note, status }) => (
          <Cell key={label} label={label} note={note}>
            <UpdateStateSurface status={status} currentVersion={CURRENT} />
          </Cell>
        ))}

        <Cell label="what's-new-stable" note="fallback banner">
          <PostUpdateContent version={STABLE_VERSION} />
        </Cell>

        <Cell label="what's-new-beta" note="latest beta release">
          <PostUpdateContent
            version={BETA_VERSION}
            releaseNotes={BETA_RELEASE_NOTES}
          />
        </Cell>
      </div>
    </div>
  )
}

function Cell({
  label,
  note,
  children,
}: {
  label: string
  note?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2" data-dialog-preview-card={label}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {note && (
          <span className="text-[10px] font-medium text-muted-foreground">
            {note}
          </span>
        )}
      </div>
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-lg border bg-background shadow-lg"
        data-dialog-preview-content
      >
        {children}
      </div>
    </div>
  )
}
