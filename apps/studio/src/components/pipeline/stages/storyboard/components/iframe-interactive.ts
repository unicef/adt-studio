// Interactive editing script + styles injected into the BookPreviewFrame
// iframe. The script is gated by `body[data-editable="true"]`, so toggling
// editability does not require an iframe reload.
//
// A second, mutually exclusive gate — `body[data-link-mode="true"]` — powers
// the activity editor's page↔panel linking: clicks resolve to an anchor and
// are reported to the parent instead of opening an inline editor, and every
// default action is suppressed so clicking a blank in the page never types
// into the preview.

export const INTERACTIVE_SCRIPT = `<script>
(function() {
  var selected = null;
  var editing = null;
  var savedDisplayHtml = null;
  var savedOriginalText = null;
  var containerIdCounter = 0;
  var hoveredLink = null;

  function isEditable() { return document.body.dataset.editable === 'true'; }
  function isLinkMode() { return document.body.dataset.linkMode === 'true'; }

  // The page's answer controls, cached for the duration of a link-mode
  // session. Invalidated whenever the body is rebuilt (a panel edit re-injects
  // the HTML) or link mode is re-entered.
  var answerControlCache = null;
  function answerControls() {
    if (!answerControlCache) {
      answerControlCache = Array.prototype.slice.call(
        document.querySelectorAll('[data-activity-item]')
      );
    }
    return answerControlCache;
  }
  function invalidateAnswerControls() { answerControlCache = null; }

  // Answer controls are usually sr-only — the visible affordance is a styled
  // sibling box. Outlining the control itself would draw nothing, so climb to
  // the first ancestor that has a real box.
  function visibleTarget(el) {
    var node = el;
    for (var d = 0; d < 4 && node; d++) {
      var r = node.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) return node;
      node = node.parentElement;
    }
    return el;
  }

  // Nearest addressable ancestor, resolved by intent rather than raw proximity:
  //   • text or an image with actual content wins — the user clicked words or
  //     a picture and means to edit them (this keeps a sentence with an inline
  //     blank editable as text);
  //   • otherwise the enclosing region owning exactly ONE answer control is
  //     that answer, which is how clicking an empty checkbox box or an
  //     option's letter selects the answer instead of a decorative span.
  // Requiring exactly one control stops the walk from swallowing a whole
  // question list once it reaches a shared container.
  function findAnchor(target) {
    var el = target;
    var answerRegion = null;
    while (el && el !== document.body) {
      if (el.nodeType === 1) {
        var itemId = el.getAttribute('data-activity-item');
        if (itemId) return { el: visibleTarget(el), kind: 'answer', id: itemId };
        var dataId = el.getAttribute('data-id');
        if (dataId) {
          if (el.tagName === 'IMG') return { el: el, kind: 'image', id: dataId };
          if ((el.textContent || '').trim()) return { el: el, kind: 'text', id: dataId };
        }
        if (!answerRegion) {
          // Counted against a cached document-wide list rather than
          // re-querying each ancestor's subtree: the walk runs on every
          // mousemove, and scanning subtrees per level made the cost the sum
          // of those subtrees — the whole page once the walk reached a
          // top-level container.
          var owned = answerControls().filter(function(input) { return el.contains(input); });
          if (owned.length === 1) {
            answerRegion = {
              el: el,
              kind: 'answer',
              id: owned[0].getAttribute('data-activity-item')
            };
          }
        }
      }
      el = el.parentElement;
    }
    return answerRegion;
  }

  function setHoveredLink(el) {
    if (hoveredLink === el) return;
    if (hoveredLink) hoveredLink.removeAttribute('data-adt-link-hover');
    hoveredLink = el;
    if (hoveredLink) hoveredLink.setAttribute('data-adt-link-hover', 'true');
  }

  // Walk up from target; preventDefault if any ancestor is a tag whose default
  // action would steal the click (navigate the iframe, submit a form, focus
  // an input, etc.) so the editor can always select the element instead.
  function suppressNativeAction(e) {
    var el = e.target;
    while (el && el !== document.body) {
      var t = el.tagName;
      if (t === 'A' || t === 'BUTTON' || t === 'INPUT' || t === 'SELECT' ||
          t === 'TEXTAREA' || t === 'LABEL' || t === 'FORM' || t === 'SUMMARY') {
        e.preventDefault();
        return;
      }
      el = el.parentElement;
    }
  }

  function findContainer(target) {
    var el = target;
    while (el && el !== document.body && el.id !== 'content') {
      if (el.nodeType === 1) return el;
      el = el.parentElement;
    }
    return null;
  }

  /** Ensure the element has a data-id; assign one if missing. */
  function ensureDataId(el) {
    var id = el.getAttribute('data-id');
    if (id) return id;
    id = '_el' + (++containerIdCounter);
    el.setAttribute('data-id', id);
    return id;
  }

  function getRect(el) {
    var r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom };
  }

  function clearSelection() {
    if (selected) {
      selected.removeAttribute('data-adt-selected');
    }
    selected = null;
  }

  function selectElement(el) {
    clearSelection();
    selected = el;
    el.setAttribute('data-adt-selected', 'true');
    var isImg = el.tagName === 'IMG';
    parent.postMessage({
      type: isImg ? 'select-image' : 'select',
      dataId: el.getAttribute('data-id'),
      tagName: el.tagName.toLowerCase(),
      rect: getRect(el)
    }, '*');
  }

  function startEditing(el) {
    if (editing === el) return;
    if (el.tagName === 'IMG') return;
    editing = el;
    // Save the current MathML display before swapping to LaTeX
    savedDisplayHtml = el.innerHTML;
    var dataId = el.getAttribute('data-id');
    if (window.__origTexts && window.__origTexts[dataId] != null) {
      el.innerHTML = window.__origTexts[dataId];
    }
    // Capture original text AFTER the LaTeX swap so the comparison
    // in finishEditing compares LaTeX-to-LaTeX, not MathML-to-LaTeX
    savedOriginalText = el.textContent || '';
    el.contentEditable = 'true';
    el.setAttribute('data-adt-editing', 'true');
    el.focus();
    parent.postMessage({ type: 'editing', dataId: dataId }, '*');
  }

  function finishEditing() {
    if (!editing) return;
    var el = editing;
    var restoreHtml = savedDisplayHtml;
    var origText = savedOriginalText;
    editing = null;
    savedDisplayHtml = null;
    savedOriginalText = null;
    el.contentEditable = 'false';
    el.removeAttribute('data-adt-editing');
    var newText = el.textContent || '';
    var dataId = el.getAttribute('data-id');
    // If nothing changed, restore the saved MathML display so math content
    // re-renders (startEditing had swapped it to LaTeX source).
    if (newText === origText) {
      if (restoreHtml != null) el.innerHTML = restoreHtml;
      return;
    }
    // Text was edited: leave the new content in place and let the parent's
    // re-render replace it. Restoring the pre-edit HTML here would cause a
    // visible flash of the old text before the parent's update propagates.
    var wrapper = document.getElementById('content');
    var fullHtml;
    if (wrapper) {
      var cls = (wrapper.getAttribute('class') || '').trim();
      fullHtml = cls ? wrapper.outerHTML : wrapper.innerHTML;
    } else {
      fullHtml = document.body.innerHTML;
    }
    parent.postMessage({
      type: 'text-changed',
      dataId: dataId,
      newText: newText,
      // The element's edited innerHTML — contentEditable preserves any existing
      // styled child spans (e.g. fixed-layout colour runs) as the user types
      // within them. The parent splices this into the original LaTeX-form HTML
      // so non-edited siblings keep LaTeX (not MathML).
      editedInnerHtml: el.innerHTML,
      fullHtml: fullHtml
    }, '*');
  }

  // ── Link mode ───────────────────────────────────────────────────────────
  // Entering link mode must tear down any inline edit already in flight —
  // contentEditable and the selection outline are set on the element itself,
  // so flipping the body flag alone would leave the page typeable underneath
  // the activity panel.
  // Runs on both edges. Leaving link mode has to clear the hover stamp too:
  // the outline it drives is not scoped to link mode, so a pointer resting on
  // an element when the panel closes would strand a dashed outline on the
  // page until the next mousemove inside the frame.
  new MutationObserver(function() {
    invalidateAnswerControls();
    setHoveredLink(null);
    if (!isLinkMode()) return;
    if (editing) finishEditing();
    clearSelection();
  }).observe(document.body, { attributes: true, attributeFilter: ['data-link-mode'] });

  // A panel edit re-injects the body, detaching every cached control.
  new MutationObserver(invalidateAnswerControls)
    .observe(document.body, { childList: true, subtree: true });

  // Capture phase so the page's own controls (inputs, labels, radios) never
  // see the event: in link mode the page is a map, not a form.
  document.addEventListener('mousedown', function(e) {
    if (!isLinkMode()) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  document.addEventListener('click', function(e) {
    if (!isLinkMode()) return;
    e.preventDefault();
    e.stopPropagation();
    var a = findAnchor(e.target);
    parent.postMessage(
      a ? { type: 'link-select', kind: a.kind, id: a.id } : { type: 'link-select' },
      '*'
    );
  }, true);

  // Hover outlines what a click would pick and reports it up, so the editor
  // can preview the pairing. The parent decides whether to act on it — it
  // ignores hover entirely while something is selected.
  var lastHoverKey = null;
  function reportHover(a) {
    var key = a ? a.kind + ':' + a.id : '';
    if (key === lastHoverKey) return;
    lastHoverKey = key;
    parent.postMessage(
      a ? { type: 'link-hover', kind: a.kind, id: a.id } : { type: 'link-hover' },
      '*'
    );
  }

  document.addEventListener('mousemove', function(e) {
    if (!isLinkMode()) { setHoveredLink(null); reportHover(null); return; }
    var a = findAnchor(e.target);
    setHoveredLink(a ? a.el : null);
    reportHover(a);
  });

  document.documentElement.addEventListener('mouseleave', function() {
    setHoveredLink(null);
    reportHover(null);
  });

  // Enter edit mode on mousedown (before the browser's default selection
  // behavior) so native drag-to-select works within the contentEditable
  // element. Handling this on 'click' was too late: the selection created
  // during mousedown/drag was wiped when startEditing swapped innerHTML.
  document.addEventListener('mousedown', function(e) {
    if (!isEditable()) return;
    suppressNativeAction(e);
    var el = findContainer(e.target);
    if (!el) return;
    if (el.tagName === 'IMG') return;
    if (!el.hasAttribute('data-id')) return;
    if (editing === el) return;
    if (editing && editing !== el) finishEditing();
    selectElement(el);
    startEditing(el);
  });

  document.addEventListener('click', function(e) {
    if (!isEditable()) return;
    suppressNativeAction(e);
    var el = findContainer(e.target);
    if (!el) {
      if (editing) finishEditing();
      clearSelection();
      parent.postMessage({ type: 'deselect' }, '*');
      return;
    }
    if (editing === el) return;
    if (editing && editing !== el) finishEditing();
    var hadDataId = el.hasAttribute('data-id');
    if (hadDataId) {
      selectElement(el);
      if (el.tagName !== 'IMG') startEditing(el);
    } else {
      var cId = ensureDataId(el);
      clearSelection();
      selected = el;
      el.setAttribute('data-adt-selected', 'true');
      parent.postMessage({
        type: 'select-container',
        dataId: cId,
        tagName: el.tagName.toLowerCase(),
        rect: getRect(el)
      }, '*');
    }
  });

  document.addEventListener('keydown', function(e) {
    if (!isEditable()) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        parent.dispatchEvent(new KeyboardEvent('keydown', { key: e.key }));
      }
      return;
    }
    if (editing) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        finishEditing();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        // Restore MathML display on cancel
        if (savedDisplayHtml != null) {
          editing.innerHTML = savedDisplayHtml;
          savedDisplayHtml = null;
        }
        editing.contentEditable = 'false';
        editing.removeAttribute('data-adt-editing');
        editing = null;
      }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      parent.dispatchEvent(new KeyboardEvent('keydown', { key: e.key }));
    }
  });
})();
<\/script>`

export const INTERACTIVE_STYLES = `body[data-editable="true"] *:hover:not(:has(*:hover)) {
      outline: 1px dashed rgb(124, 58, 237);
      outline-offset: 2px;
      cursor: pointer;
    }
    body[data-editable="true"] img[data-id] { position: relative; z-index: 1; }
    [data-adt-selected] { outline: 2px solid rgb(124, 58, 237) !important; outline-offset: 2px !important; }
    [data-adt-editing] { outline: 2px solid rgb(91, 33, 182) !important; outline-offset: 2px !important; }
    body[data-link-mode="true"] [data-id],
    body[data-link-mode="true"] [data-activity-item] { cursor: pointer; }
    /* Preview — dashed. Either the pointer is over it in the page
       (data-adt-link-hover, stamped locally for zero latency) or over its
       field in the editor (data-adt-preview, driven by the parent).
       Both are scoped to link mode so a stamp that outlives it cannot paint
       over the ordinary layout editor. */
    body[data-link-mode="true"] [data-adt-link-hover],
    body[data-link-mode="true"] [data-adt-preview] {
      outline: 2px dashed rgba(124, 58, 237, 0.6) !important;
      outline-offset: 3px !important;
      border-radius: 3px;
    }
    /* Selection — solid and filled. */
    [data-adt-linked] {
      outline: 2px solid rgb(124, 58, 237) !important;
      outline-offset: 3px !important;
      background-color: rgba(124, 58, 237, 0.1) !important;
      border-radius: 3px;
      transition: outline-color 200ms ease-out, background-color 200ms ease-out;
    }
    @media (prefers-reduced-motion: reduce) {
      [data-adt-linked] { transition: none; }
    }`
