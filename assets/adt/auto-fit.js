/**
 * Auto-fit for fixed-layout text entries.
 *
 * Walks every `[data-adt-fit]` element and shrinks its inner
 * `<span style="font-size:..">` runs until `scrollWidth <= clientWidth`
 * and `scrollHeight <= clientHeight`. Two strategies in sequence:
 *
 * 1. Letter-spacing tightening (small, ≤ -0.02em). Handles the
 *    millimetre-scale browser-vs-mupdf glyph metric drift without
 *    visibly cramming characters.
 * 2. Font-size shrink (98% → 50% in 2% steps). The dominant strategy —
 *    a borderline 14%-too-wide title hits 86% font cleanly instead of
 *    being crammed at full size.
 *
 * `data-adt-fs` and `data-adt-fit-ls` cache originals so re-runs
 * (translation swap, content update) restart from a clean baseline.
 *
 * Briefly forces `overflow:visible` while measuring because some
 * browsers cap `scrollHeight` on `overflow:hidden` boxes, which would
 * let `fits()` falsely return true.
 *
 * Loaded by:
 *   - Renderer (packages/pipeline/src/fixed-layout-rendering.ts) into
 *     each fixed-layout page's HTML.
 *   - Studio storyboard preview (apps/studio/.../BookPreviewFrame.tsx)
 *     into the iframe shell, since DOMPurify strips per-page <script>
 *     tags before innerHTML injection.
 *
 * Exposes `window.__adtRunAutoFit()` so callers that swap content
 * (e.g. studio's `injectContent`) can trigger another pass after the
 * new DOM is in place. Idempotent re-entry is safe.
 */
(function () {
  function targets(el) {
    var t = []
    if (el.style.fontSize) t.push(el)
    var inner = el.querySelectorAll("span")
    for (var i = 0; i < inner.length; i++) t.push(inner[i])
    return t
  }

  function fit(el) {
    var ts = targets(el)
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i]
      if (!t.dataset.adtFs) t.dataset.adtFs = parseFloat(getComputedStyle(t).fontSize)
      t.style.fontSize = t.dataset.adtFs + "px"
    }
    var origLs
    if (el.dataset.adtFitLs !== undefined) {
      origLs = parseFloat(el.dataset.adtFitLs)
    } else {
      var ls = getComputedStyle(el).letterSpacing
      origLs = ls === "normal" ? 0 : parseFloat(ls) || 0
      el.dataset.adtFitLs = origLs
    }
    el.style.letterSpacing = origLs ? origLs + "px" : "normal"
    // Browsers report `scrollHeight` including each line's natural glyph
    // extent — for a typical serif at line-height = font-size, that's
    // ~1.2× per line (ascent + descent + lineGap). mupdf's geometric
    // block bottom is the baseline of the last line, so a tight
    // `bottom - top` undershoots the rendered extent by ~0.2× line-height
    // per line. Tolerate that overhead, scaled by the estimated line count
    // (clientHeight / line-height). One genuine extra wrapped line still
    // overshoots tolerance by ~0.75× line-height, so true overflow is caught.
    var lineHeightStr = getComputedStyle(el).lineHeight
    var lineHeight = lineHeightStr === "normal"
      ? parseFloat(getComputedStyle(el).fontSize) * 1.2
      : parseFloat(lineHeightStr)
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) lineHeight = 16
    function fits() {
      var nLines = Math.max(1, Math.round(el.clientHeight / lineHeight))
      var heightTolerance = nLines * lineHeight * 0.25
      return (
        el.scrollWidth <= el.clientWidth + 0.5 &&
        el.scrollHeight <= el.clientHeight + heightTolerance
      )
    }
    if (fits()) return
    var refFs = 0
    for (var ri = 0; ri < ts.length; ri++) {
      var v = parseFloat(ts[ri].dataset.adtFs)
      if (v > refFs) refFs = v
    }
    if (!refFs) refFs = parseFloat(getComputedStyle(el).fontSize)
    // Step 1: small letter-spacing tightening (-0.02em max).
    for (var k = 1; k <= 4; k++) {
      el.style.letterSpacing = origLs - refFs * 0.005 * k + "px"
      if (fits()) return
    }
    // Step 2: font-size shrink, dominant strategy (98% → 50%).
    for (var s = 98; s >= 50; s -= 2) {
      var scale = s / 100
      for (var m = 0; m < ts.length; m++) {
        ts[m].style.fontSize = parseFloat(ts[m].dataset.adtFs) * scale + "px"
      }
      el.style.letterSpacing = (origLs - refFs * 0.02) * scale + "px"
      if (fits()) return
    }
    // Reached the floor without fitting — restore originals. Content
    // that won't fit even at 50% is usually a browser font-fallback
    // issue, not a translation-length issue. A barely-overflowing line
    // at original size is more readable than a 5.75 px line that fits;
    // the renderer keeps `overflow: visible` on text entries so the
    // spill is shown, not clipped.
    for (var rs = 0; rs < ts.length; rs++) {
      ts[rs].style.fontSize = ts[rs].dataset.adtFs + "px"
    }
    el.style.letterSpacing = origLs ? origLs + "px" : "normal"
  }

  window.__adtRunAutoFit = function () {
    var els = document.querySelectorAll("[data-adt-fit]")
    for (var i = 0; i < els.length; i++) fit(els[i])
  }

  // Run schedule:
  //   1. As soon as the DOM is ready (initial pass against whatever
  //      font the browser has at parse time — typically a system
  //      fallback while declared @font-face faces are still fetching).
  //   2. After `document.fonts.ready` resolves, then double-rAF so the
  //      browser paints the swapped font BEFORE we measure. Single rAF
  //      fires *before* the next paint, which is enough to reflow
  //      layout but can still return pre-swap metrics in some browsers.
  //   3. Whenever the FontFaceSet finishes another batch of loads
  //      (`loadingdone`) — handles fonts that finish after the initial
  //      `fonts.ready` resolves (e.g. faces declared in stylesheets that
  //      parsed late, or fonts referenced by content injected after
  //      first paint). Without this listener, `fonts.ready` resolves
  //      once and never re-fires, so any later swap leaves us measuring
  //      against the pre-swap fallback.
  //
  // Each invocation is idempotent (caches originals on `data-adt-fs`
  // / `data-adt-fit-ls`, resets to those before re-evaluating), so
  // multiple runs converge to the same final result.
  function runAfterPaint() {
    requestAnimationFrame(function () {
      requestAnimationFrame(window.__adtRunAutoFit)
    })
  }
  function scheduleRuns() {
    window.__adtRunAutoFit()
    if (document.fonts) {
      if (document.fonts.ready) {
        document.fonts.ready.then(runAfterPaint)
      }
      if (document.fonts.addEventListener) {
        document.fonts.addEventListener("loadingdone", runAfterPaint)
      }
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleRuns)
  } else {
    scheduleRuns()
  }
})()
