/**
 * Browser Zoom Controller
 * 
 * This module provides a cross-browser solution for zooming web content
 * that properly maintains layout relationships and positioning.
 * 
 * Features:
 * - Detects browser environment and uses optimal zooming method
 * - Maintains proper layout for fixed elements at different zoom levels
 * - Preserves bottom interface elements' positioning
 * - Handles sidebar positioning during zoom
 * - Persists zoom settings across page navigation
 */

// Track current zoom state
let currentZoom = 1;

/**
 * Check if running on Windows with high DPI scaling
 * @returns {boolean} True if high DPI Windows environment detected
 */
export function isHighDpiWindows() {
  const isWindows = navigator.userAgent.indexOf('Win') !== -1;
  const hasHighDpi = window.devicePixelRatio > 1.3;
  return isWindows && hasHighDpi;
}

/**
 * Determine if running in Chrome, Edge, or Safari
 * @returns {boolean} True for browsers that support the zoom property
 */
function isChromiumOrSafari() {
  const isChrome = !!window.chrome;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  return isChrome || isSafari;
}

/**
 * Set zoom level using the most appropriate method for the current browser
 * @param {number} zoomLevel - Zoom factor (0.5 = 50%, 1 = 100%, 2 = 200%)
 */
export function setNativeZoom(zoomLevel) {
  // Validate zoom level
  //   if (typeof zoomLevel !== 'number' || zoomLevel <= 0) {
  //     console.error('Invalid zoom level. Must be a positive number.');
  //     return;
  //   }

  // Force zoom via direct style application (most reliable approach)
  document.body.style.zoom = zoomLevel;

  // Store current zoom for reference
  currentZoom = zoomLevel;

  // Save zoom level for persistence
  localStorage.setItem('pageZoomLevel', zoomLevel.toString());

  // For Chrome/Safari/Edge, use the native zoom property
  if (isChromiumOrSafari()) {
    document.body.style.zoom = zoomLevel;
    adjustInterfaceForNativeZoom(zoomLevel);
    return;
  }

  // For Firefox and others, use CSS transform with additional adjustments
  applyTransformZoom(zoomLevel);
}

/**
 * Apply transform-based zoom for Firefox and other browsers
 * @param {number} zoomLevel - Zoom factor
 */
function applyTransformZoom(zoomLevel) {
  const html = document.documentElement;
  const body = document.body;
  const contentContainer = document.querySelector('.container.content');
  const interfaceContainer = document.getElementById('interface-container');
  const navContainer = document.getElementById('nav-container');
  const sidebar = document.getElementById('sidebar');

  // Calculate inverse zoom for compensating dimensions
  const inverseZoom = 1 / zoomLevel;

  // Apply zoom to body
  if (body) {
    body.style.transform = `scale(${zoomLevel})`;
    body.style.transformOrigin = 'top center';
    body.style.width = `${inverseZoom * 100}%`;
    body.style.minHeight = `${inverseZoom * 100}vh`;
    body.style.overflow = 'hidden';
  }

  // Adjust main content container
  if (contentContainer) {
    // Reset any previous transform that might be set directly on the container
    contentContainer.style.transform = 'none';

    // Adjust dimensions to fill the viewport at scaled size
    contentContainer.style.minHeight = `calc(${inverseZoom * 100}vh - ${inverseZoom * 100}px)`;
    contentContainer.style.width = '100%';
    contentContainer.style.maxWidth = 'none';
  }

  // Ensure interface elements stay correctly positioned
  if (interfaceContainer) {
    interfaceContainer.style.position = 'fixed';
    interfaceContainer.style.bottom = '0';
    interfaceContainer.style.left = '0';
    interfaceContainer.style.width = `${inverseZoom * 100}%`;
    interfaceContainer.style.transform = `scale(${zoomLevel})`;
    interfaceContainer.style.transformOrigin = 'bottom left';
    interfaceContainer.style.zIndex = '9999';
  }

  // Adjust navigation container
  if (navContainer) {
    navContainer.style.position = 'fixed';
    navContainer.style.transform = `scale(${zoomLevel})`;
    navContainer.style.transformOrigin = 'top left';
    navContainer.style.zIndex = '9999';
  }

  // Adjust sidebar positioning if it's open
  if (sidebar && sidebar.getAttribute('aria-expanded') === 'true') {
    sidebar.style.transform = `scale(${zoomLevel})`;
    sidebar.style.transformOrigin = 'top right';
    sidebar.style.right = '0';
  }

  // Dispatch custom event for other components that might need to adjust
  window.dispatchEvent(new CustomEvent('zoomchange', { detail: { zoomLevel } }));
}

/**
 * Make adjustments for bottom interface when using native zoom
 * @param {number} zoomLevel - Zoom factor
 */
function adjustInterfaceForNativeZoom(zoomLevel) {
  const bottomInterface = document.querySelector('.fixed.bottom-0');
  const sidebar = document.getElementById('sidebar');

  if (bottomInterface) {
    // Ensure bottom interface stays at the bottom with native zoom
    bottomInterface.style.bottom = '0';
  }

  if (sidebar && sidebar.getAttribute('aria-expanded') === 'true') {
    // Ensure sidebar stays properly positioned
    sidebar.style.right = '0';
  }

  // Dispatch custom event for other components that might need to adjust
  window.dispatchEvent(new CustomEvent('zoomchange', { detail: { zoomLevel } }));
}

/**
 * Reset zoom to 100%
 */
export function resetZoom() {
  setNativeZoom(1);

  // Clean up any additional styles that were set
  const contentContainer = document.querySelector('.container.content');
  const interfaceContainer = document.getElementById('interface-container');
  const navContainer = document.getElementById('nav-container');
  const sidebar = document.getElementById('sidebar');

  // Reset body styles
  document.body.style.transform = '';
  document.body.style.width = '';
  document.body.style.minHeight = '';
  document.body.style.overflow = '';

  // Reset content container
  if (contentContainer) {
    contentContainer.style.minHeight = '';
    contentContainer.style.width = '';
    contentContainer.style.maxWidth = '';
  }

  // Reset interface container
  if (interfaceContainer) {
    interfaceContainer.style.position = '';
    interfaceContainer.style.transform = '';
    interfaceContainer.style.width = '';
  }

  // Reset navigation container
  if (navContainer) {
    navContainer.style.position = '';
    navContainer.style.transform = '';
  }

  // Reset sidebar
  if (sidebar) {
    sidebar.style.transform = '';
    sidebar.style.right = '';
  }

  // Remove zoom level from storage
  localStorage.removeItem('pageZoomLevel');
}

/**
 * Get the current zoom level
 * @returns {number} Current zoom level
 */
export function getCurrentZoom() {
  return currentZoom;
}

/**
 * Apply any previously stored zoom level
 */
export function applyStoredZoom() {
  const storedZoom = localStorage.getItem('pageZoomLevel');
  if (storedZoom && !isNaN(parseFloat(storedZoom))) {
    setNativeZoom(parseFloat(storedZoom));
    return true;
  }
  return false;
}

/**
 * Initialize zoom controller - call this on page load
 */
export function initializeZoomController() {
  // Apply any stored zoom level
  const zoomApplied = applyStoredZoom();

  // Listen for resize events to maintain zoom layout
  window.addEventListener('resize', () => {
    if (currentZoom !== 1) {
      // Reapply current zoom after resize to maintain proper layout
      setNativeZoom(currentZoom);
    }
  });

  // Add event listener for "z" key to toggle zoom for testing
  document.addEventListener('keydown', (e) => {
    // Alt+Z for zoom to 75%
    if (e.altKey && e.key === 'z') {
      setNativeZoom(currentZoom === 0.75 ? 1 : 0.75);
    }
  });

  return zoomApplied;
}

// Add a direct test function that can be called from console
export function testZoomNow() {
  try {
    document.body.style.zoom = 0.75;
    return true;
  } catch (err) {
    console.error('Error applying zoom:', err);
    return false;
  }
}

/**
 * Create floating zoom controls UI
 */
export function createZoomControls() {
  // Remove existing controls if any
  const existingControls = document.getElementById('zoom-controls');
  if (existingControls) {
    existingControls.remove();
  }

  // Create controls container
  const controls = document.createElement('div');
  controls.id = 'zoom-controls';
  controls.className = 'fixed bottom-20 left-4 bg-white rounded-lg shadow-lg p-2 z-50 flex items-center space-x-2 border border-gray-200';

  // Add zoom out button
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.className = 'p-2 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';
  zoomOutBtn.innerHTML = '<i class="fas fa-search-minus"></i>';
  zoomOutBtn.setAttribute('aria-label', 'Zoom out');
  zoomOutBtn.addEventListener('click', () => {
    setNativeZoom(0.75);
  });

  // Add reset button
  const resetBtn = document.createElement('button');
  resetBtn.className = 'p-2 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';
  resetBtn.innerHTML = '<i class="fas fa-undo"></i>';
  resetBtn.setAttribute('aria-label', 'Reset zoom');
  resetBtn.addEventListener('click', resetZoom);

  // Add zoom in button
  const zoomInBtn = document.createElement('button');
  zoomInBtn.className = 'p-2 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';
  zoomInBtn.innerHTML = '<i class="fas fa-search-plus"></i>';
  zoomInBtn.setAttribute('aria-label', 'Zoom in');
  zoomInBtn.addEventListener('click', () => {
    setNativeZoom(1.25);
  });

  // Add zoom level display
  const zoomLevel = document.createElement('span');
  zoomLevel.id = 'zoom-level-display';
  zoomLevel.className = 'text-sm font-medium text-gray-700 px-2';
  zoomLevel.textContent = '100%';

  // Update zoom level display when zoom changes
  window.addEventListener('zoomchange', (e) => {
    const level = e.detail.zoomLevel;
    zoomLevel.textContent = `${Math.round(level * 100)}%`;
  });

  // Assemble controls
  controls.appendChild(zoomOutBtn);
  controls.appendChild(resetBtn);
  controls.appendChild(zoomInBtn);
  controls.appendChild(zoomLevel);

  // Add to document
  document.body.appendChild(controls);

  return controls;
}