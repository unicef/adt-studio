/**
 * Matomo Analytics module for ADT educational platform
 * Handles initialization and tracking of user interactions
 */

// Configuration object for Matomo
const matomoConfig = {
  siteId: 1, // Replace with your actual site ID
  trackerUrl: "https://unisitetracker.unicef.io/matomo.php", // Replace with your Matomo URL
  srcUrl: "https://unisitetracker.unicef.io/matomo.js", // Replace with your Matomo JS URL
};

/**
 * Initialize Matomo Analytics
 * @param {Object} config - Optional configuration to override defaults
 */
export const initMatomo = (config = {}) => {
  // Merge default config with provided options
  const finalConfig = { ...matomoConfig, ...config };

  // Add Matomo tracking code
  window._paq = window._paq || [];

  // Track this page view
  window._paq.push(['trackPageView']);

  // Enable link tracking
  window._paq.push(['enableLinkTracking']);

  // Set up the tracker
  window._paq.push(['setTrackerUrl', finalConfig.trackerUrl]);
  window._paq.push(['setSiteId', finalConfig.siteId]);

  // Add the script to the page
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.async = true;
  script.defer = true;
  script.src = finalConfig.srcUrl;

  // Insert script at the end of the head element
  document.head.appendChild(script);
};

/**
 * Track a custom event
 * @param {string} category - Event category
 * @param {string} action - Event action
 * @param {string} name - Event name (optional)
 * @param {number} value - Event value (optional)
 */
export const trackEvent = (category, action, name = null, value = null) => {
  if (window._paq) {
    window._paq.push(['trackEvent', category, action, name, value]);
  } else {
    console.warn('Matomo not initialized. Unable to track event.');
  }
};

/**
 * Track activity completions
 * @param {string} activityId - ID of the completed activity
 * @param {string} activityType - Type of activity completed
 * @param {number} score - Score achieved (if applicable)
 */
export const trackActivityCompletion = (activityId, activityType, score = null) => {
  trackEvent(
    'Activity',
    'Completion',
    `${activityType}: ${activityId}`,
    score
  );
};

/**
 * Track navigation between pages
 * @param {string} fromPage - Origin page ID
 * @param {string} toPage - Destination page ID
 */
export const trackNavigation = (fromPage, toPage) => {
  trackEvent(
    'Navigation',
    'PageChange',
    `${fromPage} → ${toPage}`
  );
};

/**
 * Track time spent on activities
 * @param {string} activityId - ID of the activity
 * @param {number} seconds - Seconds spent on activity
 */
export const trackTimeSpent = (activityId, seconds) => {
  trackEvent(
    'Activity',
    'TimeSpent',
    activityId,
    Math.round(seconds)
  );
};

/**
 * Track form submissions
 * @param {string} formId - ID of the form
 * @param {boolean} isComplete - Whether all fields were filled
 */
export const trackFormSubmission = (formId, isComplete) => {
  trackEvent(
    'Form',
    'Submission',
    formId,
    isComplete ? 1 : 0
  );
};

/**
 * Track toggle events
 * @param {string} toggleName - Name of the toggle (e.g., "EasyReadMode", "ReadAloud", etc.)
 * @param {boolean} isActive - Whether the toggle is activated (true) or deactivated (false)
 */
export const trackToggleEvent = (toggleName, isActive) => {
  const action = isActive ? 'Activated' : 'Deactivated';
  trackEvent('Toggle', action, toggleName);
};