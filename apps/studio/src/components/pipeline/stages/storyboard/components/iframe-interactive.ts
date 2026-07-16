// Interactive editing script + styles injected into the BookPreviewFrame
// iframe. The script is gated by `body[data-editable="true"]`, so toggling
// editability does not require an iframe reload.

export const INTERACTIVE_SCRIPT = `<script>
(function() {
  var selected = null;
  var editing = null;
  var savedDisplayHtml = null;
  var savedOriginalText = null;
  var containerIdCounter = 0;

  function isEditable() { return document.body.dataset.editable === 'true'; }

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

  // Container tags are styled, not text-edited — selecting them must not make
  // them contentEditable (a blank <div> group carries a real data-id but is a
  // container, so it would otherwise wrongly enter text-edit mode).
  var CONTAINER_TAGS = { DIV: 1, SECTION: 1, FIGURE: 1, UL: 1, OL: 1, TABLE: 1, TR: 1, TBODY: 1, THEAD: 1 };

  function startEditing(el) {
    if (editing === el) return;
    if (el.tagName === 'IMG') return;
    if (CONTAINER_TAGS[el.tagName]) return;
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
    /* Empty blanks (freshly added text/div) collapse to zero size and can't be
       hovered/clicked — give them a hittable box and a placeholder in edit mode
       so they're selectable. Cleared automatically once they gain content. */
    body[data-editable="true"] [data-id]:empty {
      display: block;
      min-height: 1.5rem;
      min-width: 2rem;
      outline: 1px dashed rgba(124, 58, 237, 0.5);
      outline-offset: 2px;
    }
    body[data-editable="true"] [data-id]:empty::before {
      content: attr(data-adt-placeholder);
      color: rgba(124, 58, 237, 0.6);
      font-size: 0.75rem;
      font-style: italic;
    }
    [data-adt-selected] { outline: 2px solid rgb(124, 58, 237) !important; outline-offset: 2px !important; }
    [data-adt-editing] { outline: 2px solid rgb(91, 33, 182) !important; outline-offset: 2px !important; }`
