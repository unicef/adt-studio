/**
 * Super Simple Browser Zoom
 * A minimal implementation that only uses the browser's native zoom API
 */

// Set zoom level using the simplest possible approach
export function setZoom(level) {
  try {
    // The simplest approach - just set zoom directly
    document.body.style.zoom = level;

    // Store the setting
    localStorage.setItem('simpleZoomLevel', level);

    return true;
  } catch (err) {
    console.error('Error setting zoom:', err);
    return false;
  }
}

// Reset zoom to normal (100%)
export function resetZoom() {
  try {
    document.body.style.zoom = 1;
    localStorage.removeItem('simpleZoomLevel');
    return true;
  } catch (err) {
    console.error('Error resetting zoom:', err);
    return false;
  }
}

// Apply stored zoom level if it exists
export function applyStoredZoom() {
  try {
    const level = localStorage.getItem('simpleZoomLevel');
    if (level) {
      setZoom(parseFloat(level));
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error applying stored zoom:', err);
    return false;
  }
}

// Update the detection function to be more reliable and log its findings
export function needsZoomAdjustment() {
  const isWindows = navigator.userAgent.indexOf('Win') !== -1;
  const hasHighDpi = window.devicePixelRatio > 1.2;
  const needsAdjustment = isWindows && hasHighDpi;

  return needsAdjustment;
}

// Create UI elements for zoom control
export function createZoomUI() {
  // Check if a zoom button already exists
  if (document.getElementById('simple-zoom-button')) {
    return;
  }

  // Create buttons container
  const container = document.createElement('div');
  container.id = 'simple-zoom-controls';
  container.className = 'fixed bottom-4 right-4 flex flex-col gap-2 z-[9999]';

  // Create zoom to 67% button (compensates for 150% scaling)
  const zoomButton = document.createElement('button');
  zoomButton.id = 'simple-zoom-button';
  zoomButton.className = 'bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow-lg';
  zoomButton.textContent = 'Zoom to 67%';
  zoomButton.onclick = () => {
    setZoom(0.67);
    //createResetButton();
    zoomButton.remove();
  };

  // Add to page
  container.appendChild(zoomButton);
  document.body.appendChild(container);
}

// Create reset button
/*
function createResetButton() {
  // Remove existing reset button if it exists
  const existing = document.getElementById('simple-zoom-reset');
  if (existing) {
    existing.remove();
  }

  // Get or create container
  let container = document.getElementById('simple-zoom-controls');
  if (!container) {
    container = document.createElement('div');
    container.id = 'simple-zoom-controls';
    container.className = 'fixed bottom-4 right-4 flex flex-col gap-2 z-[9999]';
    document.body.appendChild(container);
  }

  // Create reset button
  const resetButton = document.createElement('button');
  resetButton.id = 'simple-zoom-reset';
  resetButton.className = 'bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded shadow-lg';
  resetButton.textContent = 'Reset Zoom';
  resetButton.onclick = () => {
    resetZoom();
    resetButton.remove();
    createZoomUI();

    // Show confirmation and reload page for best results
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-20 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-[9999]';
    toast.textContent = 'Zoom Reset - Reloading Page...';
    document.body.appendChild(toast);

    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  // Add to container
  container.appendChild(resetButton);
} */

// Initialize on page load
export function initSimpleZoom() {
  applyStoredZoom();

  // If zoom is applied, show reset button
  if (localStorage.getItem('simpleZoomLevel')) {
    //createResetButton();
  }
  // Otherwise, if we detect Windows high DPI, show zoom button
  else if (needsZoomAdjustment()) {
    createZoomUI();
  }
}