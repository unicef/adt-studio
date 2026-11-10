/**
 * Mark the `<style>` nodes the page shipped in its `<head>` as page-scoped, so
 * an in-place page swap (`page-swap.ts`) knows which ones to replace.
 *
 * The claim runs as a side effect of evaluating this module, and the module
 * imports nothing, so that it can be the very first thing the bundle
 * evaluates. That timing is the whole point: libraries append their own
 * `<style>` to `<head>` at import time (sonner does), and a claim that ran any
 * later — from `mount()`, say — would tag those as page-scoped too, and the
 * first swap would delete the toast stylesheet along with the page's own.
 * `boot.tsx` and `activities-entry.tsx` import this module before anything
 * else; `page-head.test.ts` pins that order.
 *
 * Vite's dev-server styles carry `data-vite-dev-id` and are runtime-owned.
 */
export const PAGE_HEAD_ATTR = "data-adt-page-head"

export function claimPageHeadNodes(): void {
  if (typeof document === "undefined") return
  for (const el of Array.from(document.head.querySelectorAll("style:not([data-vite-dev-id])"))) {
    el.setAttribute(PAGE_HEAD_ATTR, "")
  }
}

claimPageHeadNodes()
