// @vitest-environment jsdom
import React from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { StoryboardThumbnailProvider, useStoryboardPreviewReady, useStoryboardThumbnail } from "./storyboard-thumbnails"
afterEach(cleanup)
const flush = () => act(async () => { await Promise.resolve() })
function Preview({ empty = false, capture }: { empty?: boolean; capture?: (ready: () => void) => void }) {
  const ready = useStoryboardPreviewReady(empty)
  capture?.(ready)
  return <button onClick={ready}>Paint</button>
}
function Thumb({ url, priority = 2 }: { url: string; priority?: number }) {
  const job = useStoryboardThumbnail(url, priority)
  return job.enabled ? <img src={url} alt={url} onLoad={job.finish} onError={job.finish} /> : <span>{url} waiting</span>
}
it("keeps navigation usable while thumbnails wait, advances after errors, and retains completed images", async () => {
  render(<StoryboardThumbnailProvider scopeKey="book/page1" waitForPreview><Preview /><Thumb url="one" /><Thumb url="two" /><Thumb url="three" /></StoryboardThumbnailProvider>)
  await flush(); expect(screen.queryAllByRole("img")).toHaveLength(0)
  fireEvent.click(screen.getByText("Paint")); await flush()
  expect(screen.getAllByRole("img")).toHaveLength(2)
  fireEvent.error(screen.getByAltText("one")); await flush()
  expect(screen.getAllByRole("img")).toHaveLength(3)
})
it("rejects readiness from an obsolete selection and never reuses admission for another URL", async () => {
  let oldReady = () => {}
  const view = render(<StoryboardThumbnailProvider scopeKey="book/a" waitForPreview><Preview capture={r => { oldReady = r }} /><Thumb url="old" /></StoryboardThumbnailProvider>)
  fireEvent.click(screen.getByText("Paint")); await flush()
  expect(screen.getByAltText("old")).toBeTruthy()
  view.rerender(<StoryboardThumbnailProvider scopeKey="other/a" waitForPreview><Preview /><Thumb url="new" /></StoryboardThumbnailProvider>)
  await flush(); act(oldReady); await flush()
  expect(screen.queryAllByRole("img")).toHaveLength(0)
  fireEvent.click(screen.getByText("Paint")); await flush()
  expect(screen.getByAltText("new")).toBeTruthy()
  expect(screen.queryByAltText("old")).toBeNull()
})
it("cancels queued rows on unmount and releases alternate views", async () => {
  const view = render(<StoryboardThumbnailProvider scopeKey="page" waitForPreview><Preview /><Thumb url="unmounted" /></StoryboardThumbnailProvider>)
  await flush()
  view.rerender(<StoryboardThumbnailProvider scopeKey="page" waitForPreview><Preview empty /><Thumb url="replacement" /></StoryboardThumbnailProvider>)
  await flush()
  expect(screen.getByAltText("replacement")).toBeTruthy()
  expect(screen.queryByAltText("unmounted")).toBeNull()
})
