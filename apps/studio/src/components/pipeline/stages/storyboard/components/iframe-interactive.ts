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
  var ACTIVITY_INTERACTIVE_SELECTOR = [
    '.activity-option',
    '.activity-underline-option',
    '[data-activity-item]',
    '[data-activity-category]',
    '.fitb-sentence input',
    '.fitb-sentence textarea',
    'input[type="radio"]',
    'input[type="checkbox"]',
    'textarea',
    'select',
    'button'
  ].join(',');

  function isEditable() { return document.body.dataset.editable === 'true'; }
  function isLinkMode() { return document.body.dataset.linkMode === 'true'; }

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

  function visibleTarget(el) {
    var node = el;
    for (var d = 0; d < 4 && node; d++) {
      var r = node.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) return node;
      node = node.parentElement;
    }
    return el;
  }

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

  function isActivityInteractiveTarget(target) {
    if (!target) return false;
    var el = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    return !!(el && el.closest && el.closest(ACTIVITY_INTERACTIVE_SELECTOR));
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

  new MutationObserver(function() {
    invalidateAnswerControls();
    setHoveredLink(null);
    if (!isLinkMode()) return;
    if (editing) finishEditing();
    clearSelection();
  }).observe(document.body, { attributes: true, attributeFilter: ['data-link-mode'] });

  new MutationObserver(invalidateAnswerControls)
    .observe(document.body, { childList: true, subtree: true });

  // Accessible word-bank cloze interaction. Rendering HTML declares reusable
  // chips with data-word-bank-chip and inline fields with
  // data-word-bank-target; the iframe owns behaviour because persisted HTML
  // is intentionally sanitized and cannot carry event handlers or scripts.
  var selectedWordBankValue = '';

  function wordBankStatus() {
    return document.querySelector('[data-word-bank-status], #pg021-word-bank-status');
  }

  function wordBankElement(target, attribute) {
    var node = target;
    while (node && node !== document.body) {
      if (node.nodeType === 1 && node.hasAttribute(attribute)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function announceWordBank(message) {
    var status = wordBankStatus();
    if (status) status.textContent = message;
  }

  function selectWordBankChip(chip) {
    selectedWordBankValue = chip.getAttribute('data-word-bank-chip') || '';
    document.querySelectorAll('[data-word-bank-chip]').forEach(function(item) {
      item.setAttribute('aria-pressed', item === chip ? 'true' : 'false');
    });
    announceWordBank(selectedWordBankValue + ' selected. Move to a blank and press Enter.');
  }

  function placeWordBankValue(target, value) {
    if (!value || !target) return;
    target.value = value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.classList.add('bg-emerald-50', 'border-emerald-600');
    announceWordBank(value + ' placed in ' + (target.getAttribute('aria-label') || 'blank') + '.');
  }

  document.addEventListener('click', function(e) {
    if (isLinkMode()) return;
    var chip = wordBankElement(e.target, 'data-word-bank-chip');
    if (chip) selectWordBankChip(chip);
  });

  document.addEventListener('dragstart', function(e) {
    if (isLinkMode()) return;
    var chip = wordBankElement(e.target, 'data-word-bank-chip');
    if (!chip) return;
    selectWordBankChip(chip);
    if (e.dataTransfer) e.dataTransfer.setData('text/plain', selectedWordBankValue);
  });

  document.addEventListener('dragover', function(e) {
    var target = wordBankElement(e.target, 'data-word-bank-target');
    if (target && !isLinkMode()) e.preventDefault();
  });

  document.addEventListener('drop', function(e) {
    if (isLinkMode()) return;
    var target = wordBankElement(e.target, 'data-word-bank-target');
    if (!target) return;
    e.preventDefault();
    var value = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
    placeWordBankValue(target, value || selectedWordBankValue);
  });

  document.addEventListener('keydown', function(e) {
    if (isLinkMode() || e.key !== 'Enter' || !selectedWordBankValue) return;
    var target = wordBankElement(e.target, 'data-word-bank-target');
    if (!target) return;
    e.preventDefault();
    placeWordBankValue(target, selectedWordBankValue);
  });

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
    if (isActivityInteractiveTarget(e.target)) return;
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
    if (isActivityInteractiveTarget(e.target)) {
      // Activity controls are never selected or edited, but an edit in
      // progress on some OTHER element still has to be committed here:
      // finishEditing is what posts 'text-changed' to the parent, and there
      // is no blur/focusout fallback. Without this, typing into a heading and
      // then clicking a token in the activity below silently drops the edit.
      if (editing) finishEditing();
      return;
    }
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
    body[data-link-mode="true"] [data-adt-link-hover],
    body[data-link-mode="true"] [data-adt-preview] {
      outline: 2px dashed rgba(124, 58, 237, 0.6) !important;
      outline-offset: 3px !important;
      border-radius: 3px;
    }
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
