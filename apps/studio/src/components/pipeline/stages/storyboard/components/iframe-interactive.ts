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
  var dragState = null;
  var rotateState = null;
  var resizeState = null;
  var marqueeState = null;
  var suppressNextClick = false;
  var undoStack = [];
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
    document.querySelectorAll('[data-adt-canvas-handle]').forEach(function(handle) { handle.remove(); });
    document.querySelectorAll('[data-adt-selected]').forEach(function(el) {
      el.removeAttribute('data-adt-selected');
    });
    selected = null;
  }

  function selectedElements() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-adt-selected]'));
  }

  function selectionBounds() {
    var items = selectedElements();
    if (!items.length) return null;
    var rects = items.map(function(el) { return el.getBoundingClientRect(); });
    var left = Math.min.apply(null, rects.map(function(r) { return r.left; }));
    var top = Math.min.apply(null, rects.map(function(r) { return r.top; }));
    var right = Math.max.apply(null, rects.map(function(r) { return r.right; }));
    var bottom = Math.max.apply(null, rects.map(function(r) { return r.bottom; }));
    return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top };
  }

  function ensureDragHandle(el) {
    var existing = document.querySelector('[data-adt-drag-handle]');
    if (existing) {
      positionCanvasHandles();
      return existing;
    }
    var handle = document.createElement('button');
    handle.type = 'button';
    handle.contentEditable = 'false';
    handle.setAttribute('data-adt-drag-handle', 'true');
    handle.setAttribute('data-adt-canvas-handle', 'true');
    var label = document.body.dataset.dragHandleLabel || 'Drag to move';
    handle.setAttribute('aria-label', label);
    handle.setAttribute('title', label);
    handle.textContent = '✥';
    document.body.appendChild(handle);
    positionCanvasHandles();
    return handle;
  }

  function ensureRotateHandle() {
    var existing = document.querySelector('[data-adt-rotate-handle]');
    if (existing) return existing;
    var handle = document.createElement('button');
    handle.type = 'button';
    handle.contentEditable = 'false';
    handle.setAttribute('data-adt-rotate-handle', 'true');
    handle.setAttribute('data-adt-canvas-handle', 'true');
    var label = document.body.dataset.rotateHandleLabel || 'Rotate';
    handle.setAttribute('aria-label', label);
    handle.setAttribute('title', label);
    handle.textContent = '↻';
    document.body.appendChild(handle);
    return handle;
  }

  function ensureResizeHandles() {
    document.querySelectorAll('[data-adt-resize-handle]').forEach(function(handle) { handle.remove(); });
    var items = selectedElements();
    if (items.length !== 1 || items[0].tagName !== 'IMG') return;
    var label = document.body.dataset.resizeHandleLabel || 'Resize image';
    ['nw', 'ne', 'se', 'sw'].forEach(function(corner) {
      var handle = document.createElement('button');
      handle.type = 'button';
      handle.contentEditable = 'false';
      handle.setAttribute('data-adt-resize-handle', corner);
      handle.setAttribute('data-adt-canvas-handle', 'true');
      handle.setAttribute('aria-label', label + ' (' + corner + ')');
      handle.setAttribute('title', label);
      document.body.appendChild(handle);
    });
  }

  function positionCanvasHandles() {
    var rect = selectionBounds();
    if (!rect) return;
    var move = document.querySelector('[data-adt-drag-handle]');
    var rotate = document.querySelector('[data-adt-rotate-handle]');
    if (move) {
      move.style.left = Math.max(0, rect.right - 14) + 'px';
      move.style.top = Math.max(0, rect.top - 14) + 'px';
    }
    if (rotate) {
      rotate.style.left = Math.max(0, rect.left - 18) + 'px';
      rotate.style.top = Math.max(0, rect.top - 14) + 'px';
    }
    document.querySelectorAll('[data-adt-resize-handle]').forEach(function(handle) {
      var corner = handle.getAttribute('data-adt-resize-handle');
      handle.style.left = ((corner.indexOf('e') >= 0 ? rect.right : rect.left) - 7) + 'px';
      handle.style.top = ((corner.indexOf('s') >= 0 ? rect.bottom : rect.top) - 7) + 'px';
    });
  }

  function ensureCanvasHandles(el) {
    ensureDragHandle(el);
    ensureRotateHandle();
    ensureResizeHandles();
    positionCanvasHandles();
  }

  function selectElement(el, additive) {
    if (!additive) clearSelection();
    if (additive && el.hasAttribute('data-adt-selected')) {
      el.removeAttribute('data-adt-selected');
      var remaining = selectedElements();
      selected = remaining.length ? remaining[remaining.length - 1] : null;
      if (!selected) clearSelection();
      else ensureCanvasHandles(selected);
      return;
    }
    selected = el;
    el.setAttribute('data-adt-selected', 'true');
    ensureCanvasHandles(el);
    var isImg = el.tagName === 'IMG';
    parent.postMessage({
      type: isImg ? 'select-image' : 'select',
      dataId: el.getAttribute('data-id'),
      tagName: el.tagName.toLowerCase(),
      rect: getRect(el),
      selectedDataIds: selectedElements().map(function(item) { return item.getAttribute('data-id'); })
    }, '*');
  }

  function deviceKey() {
    var value = document.body.dataset.deviceView || 'desktop';
    return value === 'mobile' || value === 'tablet' ? value : 'desktop';
  }

  function pushUndoSnapshot() {
    var wrapper = document.getElementById('content');
    var source = wrapper || document.body;
    var clone = source.cloneNode(true);
    clone.querySelectorAll('[data-adt-canvas-handle], [data-adt-marquee]').forEach(function(el) { el.remove(); });
    clone.querySelectorAll('[data-adt-selected], [data-adt-editing], [data-adt-dragging]').forEach(function(el) {
      el.removeAttribute('data-adt-selected');
      el.removeAttribute('data-adt-editing');
      el.removeAttribute('data-adt-dragging');
      el.removeAttribute('contenteditable');
    });
    undoStack.push(clone.innerHTML);
    if (undoStack.length > 50) undoStack.shift();
  }

  function undoCanvasChange() {
    var snapshot = undoStack.pop();
    if (snapshot == null) return;
    var wrapper = document.getElementById('content');
    (wrapper || document.body).innerHTML = snapshot;
    clearSelection();
    parent.postMessage({ type: 'elements-changed' }, '*');
    parent.postMessage({ type: 'deselect' }, '*');
  }

  window.__adtPushUndo = pushUndoSnapshot;

  function currentTranslate(el) {
    var key = deviceKey();
    var storedX = parseFloat(el.getAttribute('data-adt-x-' + key));
    var storedY = parseFloat(el.getAttribute('data-adt-y-' + key));
    if (Number.isFinite(storedX) || Number.isFinite(storedY)) {
      return { x: Number.isFinite(storedX) ? storedX : 0, y: Number.isFinite(storedY) ? storedY : 0 };
    }
    var hasScopedPosition = Array.prototype.some.call(el.attributes, function(attr) {
      return attr.name.indexOf('data-adt-x-') === 0 || attr.name.indexOf('data-adt-y-') === 0;
    });
    if (hasScopedPosition) return { x: 0, y: 0 };
    var raw = (el.style.translate || '').trim().split(/\\s+/);
    var x = parseFloat(raw[0]) || 0;
    var y = parseFloat(raw[1]) || 0;
    return { x: x, y: y };
  }

  function setTranslate(el, x, y) {
    var key = deviceKey();
    var roundedX = Math.round(x);
    var roundedY = Math.round(y);
    el.setAttribute('data-adt-x-' + key, String(roundedX));
    el.setAttribute('data-adt-y-' + key, String(roundedY));
    el.style.translate = roundedX + 'px ' + roundedY + 'px';
  }

  function applyDeviceTransforms() {
    document.querySelectorAll('[data-id]').forEach(function(el) {
      var position = currentTranslate(el);
      setTranslate(el, position.x, position.y);
      var angle = parseFloat(el.getAttribute('data-adt-angle-' + deviceKey()));
      if (Number.isFinite(angle)) el.style.rotate = Math.round(angle) + 'deg';
    });
    positionCanvasHandles();
  }

  function beginDrag(e) {
    var handle = e.target && e.target.closest && e.target.closest('[data-adt-drag-handle]');
    if (!handle || !isEditable() || !selected) return;
    if (dragState) return;
    e.preventDefault();
    e.stopPropagation();
    pushUndoSnapshot();
    if (editing) finishEditing();
    var items = selectedElements().map(function(el) {
      var start = currentTranslate(el);
      return { el: el, baseX: start.x, baseY: start.y };
    });
    dragState = {
      items: items,
      dataId: selected.getAttribute('data-id'),
      startX: e.clientX,
      startY: e.clientY
    };
    items.forEach(function(item) { item.el.setAttribute('data-adt-dragging', 'true'); });
    document.body.setAttribute('data-adt-dragging', 'true');
  }

  function moveDrag(e) {
    if (!dragState) return;
    e.preventDefault();
    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;
    dragState.items.forEach(function(item) {
      setTranslate(item.el, item.baseX + dx, item.baseY + dy);
    });
    positionCanvasHandles();
  }

  function endDrag(e) {
    if (!dragState) return;
    e.preventDefault();
    var moved = dragState;
    dragState = null;
    moved.items.forEach(function(item) { item.el.removeAttribute('data-adt-dragging'); });
    document.body.removeAttribute('data-adt-dragging');
    parent.postMessage({ type: 'element-moved', dataId: moved.dataId }, '*');
  }

  function currentRotate(el) {
    var stored = parseFloat(el.getAttribute('data-adt-angle-' + deviceKey()));
    if (Number.isFinite(stored)) return stored;
    return parseFloat((el.style.rotate || '').replace('deg', '')) || 0;
  }

  function setRotate(el, degrees) {
    var normalized = Math.round(((degrees % 360) + 360) % 360);
    el.setAttribute('data-adt-angle-' + deviceKey(), String(normalized));
    el.style.rotate = normalized + 'deg';
  }

  function pointerAngle(e, rect) {
    return Math.atan2(e.clientY - (rect.top + rect.height / 2), e.clientX - (rect.left + rect.width / 2)) * 180 / Math.PI;
  }

  function beginRotate(e) {
    var handle = e.target && e.target.closest && e.target.closest('[data-adt-rotate-handle]');
    if (!handle || !isEditable() || !selected || rotateState) return;
    e.preventDefault();
    e.stopPropagation();
    pushUndoSnapshot();
    var bounds = selectionBounds();
    rotateState = {
      startAngle: pointerAngle(e, bounds),
      bounds: bounds,
      dataId: selected.getAttribute('data-id'),
      items: selectedElements().map(function(el) { return { el: el, base: currentRotate(el) }; })
    };
    document.body.setAttribute('data-adt-rotating', 'true');
  }

  function moveRotate(e) {
    if (!rotateState) return;
    e.preventDefault();
    var delta = pointerAngle(e, rotateState.bounds) - rotateState.startAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    rotateState.items.forEach(function(item) {
      setRotate(item.el, item.base + delta);
    });
    positionCanvasHandles();
  }

  function endRotate(e) {
    if (!rotateState) return;
    e.preventDefault();
    var rotated = rotateState;
    rotateState = null;
    document.body.removeAttribute('data-adt-rotating');
    parent.postMessage({ type: 'element-moved', dataId: rotated.dataId }, '*');
  }

  function beginResize(e) {
    var handle = e.target && e.target.closest && e.target.closest('[data-adt-resize-handle]');
    if (!handle || !isEditable() || !selected || selected.tagName !== 'IMG' || resizeState) return;
    e.preventDefault();
    e.stopPropagation();
    pushUndoSnapshot();
    var rect = selected.getBoundingClientRect();
    resizeState = {
      el: selected,
      dataId: selected.getAttribute('data-id'),
      corner: handle.getAttribute('data-adt-resize-handle'),
      startX: e.clientX,
      startY: e.clientY,
      width: rect.width,
      height: rect.height,
      translate: currentTranslate(selected)
    };
    document.body.setAttribute('data-adt-resizing', 'true');
  }

  function applyResize(state, width, height) {
    width = Math.max(32, width);
    height = Math.max(32, height);
    state.el.style.width = Math.round(width) + 'px';
    state.el.style.height = Math.round(height) + 'px';
    state.el.style.maxWidth = 'none';
    var x = state.translate.x;
    var y = state.translate.y;
    if (state.corner.indexOf('w') >= 0) x += state.width - width;
    if (state.corner.indexOf('n') >= 0) y += state.height - height;
    setTranslate(state.el, x, y);
    positionCanvasHandles();
  }

  function moveResize(e) {
    if (!resizeState) return;
    e.preventDefault();
    var directionX = resizeState.corner.indexOf('e') >= 0 ? 1 : -1;
    var directionY = resizeState.corner.indexOf('s') >= 0 ? 1 : -1;
    var rawWidth = resizeState.width + (e.clientX - resizeState.startX) * directionX;
    var rawHeight = resizeState.height + (e.clientY - resizeState.startY) * directionY;
    if (!e.shiftKey) {
      var ratio = resizeState.width / resizeState.height;
      if (Math.abs(rawWidth - resizeState.width) >= Math.abs(rawHeight - resizeState.height)) rawHeight = rawWidth / ratio;
      else rawWidth = rawHeight * ratio;
    }
    applyResize(resizeState, rawWidth, rawHeight);
  }

  function endResize(e) {
    if (!resizeState) return;
    e.preventDefault();
    var resized = resizeState;
    resizeState = null;
    document.body.removeAttribute('data-adt-resizing');
    parent.postMessage({ type: 'element-moved', dataId: resized.dataId }, '*');
  }

  document.addEventListener('pointerdown', beginDrag, true);
  document.addEventListener('pointerdown', beginRotate, true);
  document.addEventListener('pointerdown', beginResize, true);
  document.addEventListener('pointermove', moveDrag, true);
  document.addEventListener('pointermove', moveRotate, true);
  document.addEventListener('pointermove', moveResize, true);
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointerup', endRotate, true);
  document.addEventListener('pointerup', endResize, true);
  document.addEventListener('pointercancel', endDrag, true);
  document.addEventListener('pointercancel', endRotate, true);
  document.addEventListener('pointercancel', endResize, true);

  function marqueeRect(state, e) {
    var left = Math.min(state.startX, e.clientX);
    var top = Math.min(state.startY, e.clientY);
    var right = Math.max(state.startX, e.clientX);
    var bottom = Math.max(state.startY, e.clientY);
    return { left: left, top: top, right: right, bottom: bottom };
  }

  function beginMarquee(e) {
    if (!isEditable() || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    if (e.target.closest && e.target.closest('[data-adt-canvas-handle]')) return;
    if (e.target.closest && e.target.closest('[data-id]')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    clearSelection();
    var box = document.createElement('div');
    box.setAttribute('data-adt-marquee', 'true');
    document.body.appendChild(box);
    marqueeState = { startX: e.clientX, startY: e.clientY, box: box, moved: false };
  }

  function moveMarquee(e) {
    if (!marqueeState) return;
    e.preventDefault();
    var rect = marqueeRect(marqueeState, e);
    marqueeState.moved = marqueeState.moved || rect.right - rect.left > 3 || rect.bottom - rect.top > 3;
    marqueeState.box.style.left = rect.left + 'px';
    marqueeState.box.style.top = rect.top + 'px';
    marqueeState.box.style.width = rect.right - rect.left + 'px';
    marqueeState.box.style.height = rect.bottom - rect.top + 'px';
  }

  function endMarquee(e) {
    if (!marqueeState) return;
    e.preventDefault();
    var state = marqueeState;
    marqueeState = null;
    var rect = marqueeRect(state, e);
    state.box.remove();
    suppressNextClick = state.moved;
    if (!state.moved) return;
    var matches = Array.prototype.slice.call(document.querySelectorAll('[data-id]')).filter(function(el) {
      if (el.closest('[data-adt-canvas-handle]')) return false;
      var r = el.getBoundingClientRect();
      return r.width > 3 && r.height > 3 && r.right >= rect.left && r.left <= rect.right && r.bottom >= rect.top && r.top <= rect.bottom;
    });
    matches.forEach(function(el) { el.setAttribute('data-adt-selected', 'true'); });
    selected = matches.length ? matches[matches.length - 1] : null;
    if (selected) {
      ensureCanvasHandles(selected);
      parent.postMessage({
        type: selected.tagName === 'IMG' ? 'select-image' : 'select',
        dataId: selected.getAttribute('data-id'),
        tagName: selected.tagName.toLowerCase(),
        rect: getRect(selected),
        selectedDataIds: selectedElements().map(function(item) { return item.getAttribute('data-id'); })
      }, '*');
    }
  }

  document.addEventListener('mousedown', beginMarquee, true);
  document.addEventListener('mousemove', moveMarquee, true);
  document.addEventListener('mouseup', endMarquee, true);

  function startEditing(el) {
    if (editing === el) return;
    if (el.tagName === 'IMG') return;
    pushUndoSnapshot();
    editing = el;
    // Save the current MathML display before swapping to LaTeX
    savedDisplayHtml = el.innerHTML;
    var dataId = el.getAttribute('data-id');
    if (window.__origTexts && window.__origTexts[dataId] != null) {
      el.innerHTML = window.__origTexts[dataId];
    }
    ensureDragHandle(el);
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

  new MutationObserver(applyDeviceTransforms)
    .observe(document.body, { attributes: true, attributeFilter: ['data-device-view'] });

  new MutationObserver(invalidateAnswerControls)
    .observe(document.body, { childList: true, subtree: true });

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
    if (e.target.closest && e.target.closest('[data-adt-canvas-handle]')) return;
    if (isActivityInteractiveTarget(e.target)) return;
    suppressNativeAction(e);
    var el = findContainer(e.target);
    if (!el) return;
    if ((e.metaKey || e.ctrlKey) && el.hasAttribute('data-id')) {
      e.preventDefault();
      e.stopPropagation();
      if (editing) finishEditing();
      selectElement(el, true);
      suppressNextClick = true;
      return;
    }
    if (el.tagName === 'IMG') return;
    if (!el.hasAttribute('data-id')) return;
    if (editing === el) return;
    if (editing && editing !== el) finishEditing();
    selectElement(el);
    startEditing(el);
  });

  document.addEventListener('click', function(e) {
    if (!isEditable()) return;
    if (suppressNextClick) {
      suppressNextClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.target.closest && e.target.closest('[data-adt-canvas-handle]')) return;
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
      selectElement(el, e.metaKey || e.ctrlKey);
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

  window.__adtRestoreSelection = function(ids) {
    clearSelection();
    (ids || []).forEach(function(id) {
      var el = document.querySelector('[data-id="' + CSS.escape(id) + '"]');
      if (el) {
        el.setAttribute('data-adt-selected', 'true');
        selected = el;
      }
    });
    if (selected) ensureCanvasHandles(selected);
  };

  document.addEventListener('keydown', function(e) {
    if (!isEditable()) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        parent.dispatchEvent(new KeyboardEvent('keydown', { key: e.key }));
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !editing) {
      e.preventDefault();
      undoCanvasChange();
      return;
    }
    var dragHandle = e.target && e.target.closest && e.target.closest('[data-adt-drag-handle]');
    var targetIsFormField = e.target && e.target.closest && e.target.closest('input, textarea, select');
    var targetIsOtherCanvasHandle = e.target && e.target.closest && e.target.closest('[data-adt-rotate-handle], [data-adt-resize-handle]');
    if ((dragHandle || (!targetIsFormField && !targetIsOtherCanvasHandle && selected)) && selected && (
      e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' || e.key === 'ArrowDown'
    )) {
      e.preventDefault();
      e.stopPropagation();
      var distance = e.shiftKey ? 10 : 1;
      selectedElements().forEach(function(el) {
        var current = currentTranslate(el);
        if (e.key === 'ArrowLeft') current.x -= distance;
        if (e.key === 'ArrowRight') current.x += distance;
        if (e.key === 'ArrowUp') current.y -= distance;
        if (e.key === 'ArrowDown') current.y += distance;
        setTranslate(el, current.x, current.y);
      });
      positionCanvasHandles();
      parent.postMessage({
        type: 'element-moved',
        dataId: selected.getAttribute('data-id')
      }, '*');
      return;
    }
    var rotateHandle = e.target && e.target.closest && e.target.closest('[data-adt-rotate-handle]');
    if (rotateHandle && selected && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      e.stopPropagation();
      var degrees = e.shiftKey ? 15 : 1;
      if (e.key === 'ArrowLeft') degrees = -degrees;
      selectedElements().forEach(function(el) {
        setRotate(el, currentRotate(el) + degrees);
      });
      positionCanvasHandles();
      parent.postMessage({ type: 'element-moved', dataId: selected.getAttribute('data-id') }, '*');
      return;
    }
    var resizeHandle = e.target && e.target.closest && e.target.closest('[data-adt-resize-handle]');
    if (resizeHandle && selected && selected.tagName === 'IMG' && (
      e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown'
    )) {
      e.preventDefault();
      e.stopPropagation();
      var rect = selected.getBoundingClientRect();
      var amount = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') amount = -amount;
      var ratio = rect.width / rect.height;
      var keyboardState = { el: selected, corner: 'se', width: rect.width, height: rect.height, translate: currentTranslate(selected) };
      applyResize(keyboardState, rect.width + amount, (rect.width + amount) / ratio);
      parent.postMessage({ type: 'element-moved', dataId: selected.getAttribute('data-id') }, '*');
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
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault();
      pushUndoSnapshot();
      var dataId = selected.getAttribute('data-id');
      selectedElements().forEach(function(el) { el.remove(); });
      clearSelection();
      parent.postMessage({ type: 'elements-changed', dataId: dataId }, '*');
      parent.postMessage({ type: 'deselect' }, '*');
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
    [data-adt-drag-handle] {
      position: fixed;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 2px solid white;
      border-radius: 9999px;
      color: white;
      background: rgb(124, 58, 237);
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.3);
      cursor: grab;
      font: 700 18px/1 sans-serif;
      touch-action: none;
      user-select: none;
    }
    [data-adt-rotate-handle] {
      position: fixed;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 2px solid white;
      border-radius: 9999px;
      color: white;
      background: rgb(14, 165, 233);
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.3);
      cursor: alias;
      font: 700 20px/1 sans-serif;
      touch-action: none;
      user-select: none;
    }
    [data-adt-resize-handle] {
      position: fixed;
      z-index: 2147483647;
      width: 14px;
      height: 14px;
      padding: 0;
      border: 2px solid white;
      border-radius: 3px;
      background: rgb(124, 58, 237);
      box-shadow: 0 1px 5px rgba(15, 23, 42, 0.4);
      touch-action: none;
    }
    [data-adt-resize-handle="nw"], [data-adt-resize-handle="se"] { cursor: nwse-resize; }
    [data-adt-resize-handle="ne"], [data-adt-resize-handle="sw"] { cursor: nesw-resize; }
    [data-adt-resize-handle]:focus-visible { outline: 3px solid rgb(250, 204, 21); outline-offset: 2px; }
    [data-adt-rotate-handle]:focus-visible { outline: 3px solid rgb(250, 204, 21); outline-offset: 2px; }
    [data-adt-marquee] {
      position: fixed;
      z-index: 2147483646;
      border: 1px solid rgb(124, 58, 237);
      background: rgba(124, 58, 237, 0.12);
      pointer-events: none;
    }
    [data-adt-drag-handle]:focus-visible { outline: 3px solid rgb(250, 204, 21); outline-offset: 2px; }
    body[data-adt-dragging="true"] [data-adt-drag-handle] { cursor: grabbing; }
    body[data-adt-rotating="true"] [data-adt-rotate-handle] { cursor: grabbing; }
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
