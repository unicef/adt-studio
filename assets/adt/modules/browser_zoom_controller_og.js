/**
 * BrowserZoomController - A cross-browser solution for controlling page zoom
 * 
 * This utility provides a consistent way to control page zoom across different browsers:
 * - Uses native browser zoom for Chrome, Safari, and Edge
 * - Uses CSS transforms for Firefox and other browsers
 * - Manages viewport and layout adjustments for consistent appearance
 */

class BrowserZoomController {
  constructor() {
    this.defaultZoom = 1;
    this.currentZoom = 1;
    this.isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    this.isChromium = !!window.chrome;
    this.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    // Create container for Firefox and other browsers that need CSS transform
    if (!this.isChromium && !this.isSafari) {
      this.setupTransformContainer();
    }

    // Initialize meta viewport tag to ensure correct scaling on mobile
    this.setupViewport();
  }

  /**
   * Sets up the viewport meta tag for proper scaling
   */
  setupViewport() {
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.getElementsByTagName('head')[0].appendChild(viewport);
    }
    viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0';
  }

  /**
   * Sets up the container for CSS transform-based zooming
   */
  setupTransformContainer() {
    // Check if container already exists
    if (document.getElementById('zoom-container')) {
      return;
    }

    // Save original body content
    const bodyContent = document.body.innerHTML;

    // Create container
    const container = document.createElement('div');
    container.id = 'zoom-container';

    // Apply styles to maintain original appearance
    container.style.minHeight = '100vh';
    container.style.width = '100%';
    container.style.transformOrigin = 'top left';

    // Move body content to container
    document.body.innerHTML = '';
    container.innerHTML = bodyContent;
    document.body.appendChild(container);

    // Set body styles for proper layout
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.width = '100vw';
    document.body.style.height = '100vh';

    this.container = container;
  }

  /**
   * Set zoom level across browsers
   * @param {number} zoomLevel - Zoom factor (0.5 = 50%, 1 = 100%, 2 = 200%)
   */
  setZoom(zoomLevel) {
    if (typeof zoomLevel !== 'number' || zoomLevel <= 0) {
      console.error('Invalid zoom level. Must be a positive number.');
      return;
    }

    this.currentZoom = zoomLevel;

    // For Chrome, Safari, and Edge - use native browser zoom
    if (this.isChromium || this.isSafari) {
      document.body.style.zoom = zoomLevel;
      return;
    }

    // For Firefox and others - use CSS transform
    if (this.container) {
      // Apply transform
      this.container.style.transform = `scale(${zoomLevel})`;

      // Adjust scrollable area to account for scaling
      document.body.style.width = `${100 / zoomLevel}vw`;
      document.body.style.height = `${100 / zoomLevel}vh`;

      // Fix scrollbars and overflow issues
      if (zoomLevel < 1) {
        // When zooming out, we need to handle overflow
        document.body.style.overflow = 'hidden';
        this.container.style.width = `${100 / zoomLevel}%`;
      } else {
        // When zooming in, allow overflow with scrollbars
        document.body.style.overflow = 'auto';
        this.container.style.width = '100%';
      }
    }
  }

  /**
   * Reset zoom to default level (100%)
   */
  resetZoom() {
    this.setZoom(this.defaultZoom);
  }

  /**
   * Zoom in by the specified increment
   * @param {number} increment - Amount to increase zoom (default: 0.1)
   */
  zoomIn(increment = 0.1) {
    this.setZoom(this.currentZoom + increment);
  }

  /**
   * Zoom out by the specified decrement
   * @param {number} decrement - Amount to decrease zoom (default: 0.1)
   */
  zoomOut(decrement = 0.1) {
    const newZoom = this.currentZoom - decrement;
    if (newZoom > 0) {
      this.setZoom(newZoom);
    }
  }

  /**
   * Get current zoom level
   * @returns {number} Current zoom level
   */
  getCurrentZoom() {
    return this.currentZoom;
  }
}

// Usage example:
// const zoomController = new BrowserZoomController();
// zoomController.setZoom(0.75); // Set to 75%
// zoomController.zoomOut(0.1);  // Zoom out by 10%
// zoomController.zoomIn(0.1);   // Zoom in by 10%
// zoomController.resetZoom();   // Reset to 100%