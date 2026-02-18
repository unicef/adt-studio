import { initializeAdminPopup } from "./modules/admin_popup.js";
import {
  changeAudioSpeed,
  initializeAudioSpeed,
  playNextAudio,
  playPreviousAudio,
  togglePlayPause,
  toggleReadAloud,
  initializeTtsQuickToggle,
} from "./modules/audio.js";
import { initializeWordByWordHighlighter } from "./modules/tts_highlighter.js";
import { getCookie, eraseCookie, setCookie } from "./modules/cookies.js";
import {
  handleInitializationError,
  showMainContent,
} from "./modules/error_utils.js";
import {
  initializeLanguageDropdown,
  cacheInterfaceElements,
  getCachedInterface,
  getCachedNavigation,
  initializePlayBar,
  initializeSidebar,
  loadEasyReadMode,
  restoreInterfaceElements,
  switchLanguage,
  toggleEasyReadMode,
  toggleSyllablesMode,
  toggleGlossaryMode,
  highlightGlossaryTerms,
  togglePlayBarSettings,
  toggleSidebar,
  updatePageNumber,
  formatNavigationItems,
  initializeNavigation,
  toggleStateMode,
  loadStateMode,
  toggleSignLanguageMode,
  loadSignLanguageMode,
  adjustLayout,
  initializeSignLanguage
  //checkWindowsScaling
  //adjustPageScale
} from "./modules/interface.js";
import { initializeZoomController, testZoomNow } from "./modules/browser_zoom_controller.js";
import {
  handleKeyboardShortcuts,
  handleNavigation,
  nextPage,
  toggleNav,
  previousPage,
  setupClickOutsideHandler,
  initializeNavTabs,
  setNavigationData,
} from "./modules/navigation.js";
import { setState, state } from "./modules/state.js";
import { setupTranslations } from "./modules/translations.js";
import {
  initializeAutoplay,
  loadAutoplayState,
  loadDescribeImagesState,
  loadGlossaryState,
  toggleAutoplay,
  toggleDescribeImages,
  toggleEli5Mode,
  handleEli5Popup,
  initializeAudioElements,
  initializeGlossary,
  initializeTabs,
  initializeReferencePage,
  setAutoplayContainerVisibility,
  setDescribeImagesContainerVisibility,
  updateTtsOptionsContainerVisibility,
  loadToggleButtonState,
  initializeEli5
} from "./modules/ui_utils.js";
import {
  toggleNotepad,
  saveNotes,
  loadSavedNotes,
  loadNotepad,
  initializeNotepad
} from "./modules/notepad.js";
import { prepareActivity } from "./activity.js";
import { initializeQuizActivity } from "./modules/activities/quiz.js";
import { initCharacterDisplay } from "./modules/character-display.js"
import { initMatomo } from "./modules/analytics.js";

// Constants
const PLACEHOLDER_TITLE = "Accessible Digital Textbook";
const basePath = window.location.pathname.substring(
  0,
  window.location.pathname.lastIndexOf("/") + 1
);

// Create a centralized asset loader
const assetLoader = {
  cache: new Map(),

  async load(paths) {
    try {
      const promises = paths.map(path =>
        this.cache.has(path) ?
          Promise.resolve(this.cache.get(path)) :
          fetch(path)
            .then(response => {
              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
              return response.text();
            })
            .then(content => {
              this.cache.set(path, content);
              return content;
            })
      );

      return await Promise.all(promises);
    } catch (error) {
      console.error("Error loading assets:", error);
      throw error;
    }
  }
};

// Element cache to avoid repetitive DOM lookups
const elementCache = {
  _cache: new Map(),

  get(id) {
    if (!this._cache.has(id)) {
      const element = document.getElementById(id);
      this._cache.set(id, element);
    }
    return this._cache.get(id);
  },

  getAll(selector) {
    const key = `selector:${selector}`;
    if (!this._cache.has(key)) {
      const elements = document.querySelectorAll(selector);
      this._cache.set(key, elements);
    }
    return this._cache.get(key);
  },

  clear() {
    this._cache.clear();
  }
};

// Initialize the application
document.addEventListener("DOMContentLoaded", async function () {
  try {
    await initializeApp();
  } catch (error) {
    console.error("Error initializing application:", error);
    handleInitializationError();
  }
});

// Store the current page state before leaving
window.addEventListener("beforeunload", () => {
  cacheInterfaceElements();
  //saveInterfaceState();
});

// Create a structured initialization sequence
async function initializeApp() {
  try {
    addFavicons();

    // Ensure DOM is ready
    await waitForDOM();

    // Initialize in a specific sequence with dependencies
    const initSequence = [
      {
        name: "Core",
        fn: initializeCoreFunctionality
      },
      {
        name: "EventListeners",
        fn: setupEventListeners,
        dependencies: ["Core"]
      },
      {
        name: "UI",
        fn: initializeUIComponents,
        dependencies: ["Core", "EventListeners"]
      },
      {
        name: "Final",
        fn: finalizeInitialization,
        dependencies: ["UI"]
      }
    ];

    for (const step of initSequence) {
      await step.fn();
    }
  } catch (error) {
    console.error("Error in initialization:", error);
    handleInitializationError(error);
  } finally {
    showMainContent();
  }
}

// Add this function in the initializeApp() function

function addFavicons() {
  const faviconLinks = [
    { rel: "icon", type: "image/x-icon", href: "./assets/favicon_io/favicon.ico" },
    { rel: "apple-touch-icon", sizes: "180x180", href: "./assets/favicon_io/apple-touch-icon.png" },
    { rel: "icon", type: "image/png", sizes: "32x32", href: "./assets/favicon_io/favicon-32x32.png" },
    { rel: "icon", type: "image/png", sizes: "16x16", href: "./assets/favicon_io/favicon-16x16.png" },
    { rel: "manifest", href: "./assets/favicon_io/site.webmanifest" }
  ];

  faviconLinks.forEach(linkData => {
    // Check if link already exists to avoid duplicates
    const exists = Array.from(document.head.querySelectorAll('link')).some(
      link => link.rel === linkData.rel && link.href.includes(linkData.href.split('/').pop())
    );

    if (!exists) {
      const link = document.createElement('link');
      for (const [attr, value] of Object.entries(linkData)) {
        link.setAttribute(attr, value);
      }
      document.head.appendChild(link);
    }
  });
}

function waitForDOM() {
  return new Promise((resolve) => {
    if (document.readyState === "complete") {
      resolve();
    } else {
      window.addEventListener("load", resolve);
    }
  });
}

function showLoadingIndicator() {
  const loader = document.createElement("div");
  loader.id = "app-loader";
  loader.className =
    "fixed top-0 left-0 w-full h-full flex items-center justify-center bg-white z-50";
  loader.innerHTML = `
       <div class="text-center">
           <div class="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
           <p class="mt-4 text-gray-600">Loading...</p>
       </div>
   `;
  document.body.appendChild(loader);
}

function hideLoadingIndicator() {
  const loader = document.getElementById("app-loader");
  if (loader) {
    loader.remove();
  }
}

function restoreNavAndSidebar() {
  const navPopup = document.getElementById("navPopup");
  const sidebar = document.getElementById("sidebar");

  if (navPopup) navPopup.classList.remove("hidden");
  if (sidebar) sidebar.classList.remove("hidden");
}

async function initializeCoreFunctionality() {
  try {
    // First ensure the DOM is fully loaded
    if (document.readyState !== "complete") {
      await new Promise((resolve) => {
        window.addEventListener("load", resolve);
      });
    }

    // Set initial language (without validation since config not loaded yet)
    initializeLanguage();
    initCharacterDisplay();

    // Initialize components after HTML is definitely loaded
    await fetchAndInjectComponents();

    // IMPORTANT: Validate and correct language AFTER config is loaded
    // This must happen before translations/glossary are fetched
    initializeLanguage();

    // Try to initialize language dropdown
    const dropdownInitialized = await initializeLanguageDropdown();
    if (!dropdownInitialized) {
      console.warn(
        "Language dropdown initialization failed, continuing with other components"
      );
    }

    formatNavigationItems();
    // Initialize page numbering
    updatePageNumber();
    await setupTranslations();

    return true;
  } catch (error) {
    console.error("Error in core initialization:", error);
    return false;
  }
}

function initializeLanguage() {
  const cookieLanguage = getCookie("currentLanguage");
  const htmlLang = document.getElementsByTagName("html")[0].getAttribute("lang");
  const defaultLanguage = window.appConfig?.languages?.default || htmlLang || "en";
  const availableLanguages = window.appConfig?.languages?.available || [];

  let selectedLanguage = null;

  // If we have config loaded, validate the cookie language
  if (availableLanguages.length > 0) {
    // Check if cookie language is valid
    if (cookieLanguage && availableLanguages.includes(cookieLanguage)) {
      selectedLanguage = cookieLanguage;
    } else {
      // Cookie is invalid or missing, use default
      if (cookieLanguage && !availableLanguages.includes(cookieLanguage)) {
        console.warn(`Cookie language "${cookieLanguage}" not available. Available languages:`, availableLanguages, ". Using default:", defaultLanguage);
        // Clear invalid cookie on root path
        eraseCookie("currentLanguage", "/");
        // Also clear cookie on current page path (in case it was set with specific path)
        const currentPath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf("/") + 1);
        if (currentPath !== "/") {
          eraseCookie("currentLanguage", currentPath);
        }
      }
      selectedLanguage = defaultLanguage;
      // Set the cookie to the correct language
      setCookie("currentLanguage", defaultLanguage, 7);
    }
  } else {
    // Config not loaded yet, use cookie or fallback
    selectedLanguage = cookieLanguage || defaultLanguage;
  }

  // Always update state
  setState("currentLanguage", selectedLanguage);
}

const handleResponse = async (response) => {
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response;
};

async function fetchAndInjectComponents() {
  try {
    const [interfaceHTML, navHTML, config, pages, toc] = await Promise.all([
      fetch("./assets/interface.html").then(response => response.text()),
      fetch("./content/navigation/nav.html").then(response => response.text()),
      fetch("./assets/config.json").then(response => response.json()),
      fetch("./content/pages.json").then(handleResponse).then(response => response.json()),
      fetch("./content/toc.json").then(handleResponse).then(response => response.json()),
    ]);

    await injectComponents(interfaceHTML, navHTML, config);

    initializeNavTabs();
    setNavigationData({ pages, toc });
    formatNavigationItems();
  } catch (error) {
    throw new Error("Failed to fetch components: " + error.message);
  }
};

async function injectComponents(interfaceHTML, navHTML, config) {
  try {
    const cachedInterface = getCachedInterface();
    const cachedNavigation = getCachedNavigation();

    if (cachedInterface && cachedNavigation) {
      const restored = restoreInterfaceElements();
      if (!restored) {
        throw new Error("Failed to restore cached interface elements");
      }
    } else {
      const interfaceContainer = elementCache.get("interface-container");
      const navContainer = elementCache.get("nav-container");

      if (!interfaceContainer || !navContainer) {
        throw new Error("Required containers not found");
      }

      interfaceContainer.innerHTML = interfaceHTML;
      navContainer.innerHTML = navHTML;

      // Clear cache since DOM has changed
      elementCache.clear();

      cacheInterfaceElements();
    }

    setupConfig(config);
  } catch (error) {
    console.error("Error injecting components:", error);
    throw new Error("Failed to inject components: " + error.message);
  }
}

function setupConfig(config) {
  // Apply title from config
  if (config.title && config.title !== PLACEHOLDER_TITLE) {
    document.title = config.title;
  }

  // Set available languages meta tag
  if (config.languages && config.languages.available) {
    const availableLanguagesStr = config.languages.available.join(',');

    // Create or update the meta tag
    let availableLanguagesMeta = document.querySelector('meta[name="available-languages"]');
    if (!availableLanguagesMeta) {
      availableLanguagesMeta = document.createElement("meta");
      availableLanguagesMeta.name = "available-languages";
      document.head.appendChild(availableLanguagesMeta);
    }
    availableLanguagesMeta.content = availableLanguagesStr;
  }

  // Store the config for access throughout the application
  window.appConfig = config;

  // Apply feature flags
  applyFeatureFlags(config.features || {});
}

// Add this helper function
function applyFeatureFlags(features) {
  // Loop through features and apply them
  Object.entries(features).forEach(([feature, enabled]) => {
    // Convert camelCase to kebab-case for element IDs
    const kebabFeature = feature.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

    // Handle special cases that don't follow the toggle pattern
    if (feature === 'notepad') {
      // Hide/show notepad button and content
      const notepadButton = document.getElementById('notepad-button');
      const notepadContent = document.getElementById('notepad-content');

      if (notepadButton) {
        notepadButton.classList.toggle('hidden', !enabled);
      }
      if (notepadContent) {
        notepadContent.classList.toggle('hidden', !enabled);
      }
    } else if (feature === 'showAutoHideButton') {
      // Hide/show the auto-hide menu toggle button
      const toggleStateElement = document.getElementById('toggle-state');

      if (toggleStateElement) {
        // Find the container (the div that wraps the toggle)
        const container = toggleStateElement.closest('.flex.justify-between.items-left') ||
          toggleStateElement.parentElement;

        if (container) {
          container.classList.toggle('hidden', !enabled);
        }
      }
    } else if (feature === 'showNavigationControls') {
      // Hide/show the navigation controls wrapper and ensure it is inert when hidden
      const navButtons = document.getElementById('back-forward-buttons');
      const backButton = document.getElementById('back-button');
      const forwardButton = document.getElementById('forward-button');

      if (navButtons) {
        navButtons.classList.toggle('hidden', !enabled);
        navButtons.setAttribute('aria-hidden', (!enabled).toString());
      }

      [backButton, forwardButton].forEach(button => {
        if (!button) return;
        button.tabIndex = enabled ? 0 : -1;
        button.setAttribute('aria-hidden', (!enabled).toString());
      });
    } else if (feature === 'characterDisplay') {
      // Hide/show the character profile row
      const characterProfileRow = document.getElementById('character-profile-row');

      if (characterProfileRow) {
        characterProfileRow.classList.toggle('hidden', !enabled);
      }
    } else {
      // Find the toggle element for other features
      const toggleElement = elementCache.get(`toggle-${kebabFeature}`);

      // If the toggle exists but feature is disabled, hide its container
      if (toggleElement) {
        const container = toggleElement.closest('.setting-item') ||
          toggleElement.closest('.feature-container') ||
          toggleElement.parentElement;

        if (container) {
          container.classList.toggle('hidden', !enabled);
        }
      }
    }

    // Also store in the state for programmatic checks
    setState(`${feature}Enabled`, enabled);
  });
}

// Create a helper function for attaching event listeners
function addListener(elementId, event, handler) {
  const element = document.getElementById(elementId);
  if (element) element.addEventListener(event, handler);
  return element;
}

// Use with an object map for clarity
function setupEventListeners() {
  // Handle basic click events
  const clickHandlers = {
    "open-sidebar": toggleSidebar,
    "close-sidebar": toggleSidebar,
    "toggle-eli5": toggleEli5Mode,
    "toggle-easy-read": toggleEasyReadMode,
    "toggle-sign-language": toggleSignLanguageMode,
    "sl-quick-toggle-button": toggleSignLanguageMode,
    "toggle-syllables": toggleSyllablesMode,
    "toggle-glossary": toggleGlossaryMode,
    "toggle-autoplay": toggleAutoplay,
    "toggle-describe-images": toggleDescribeImages,
    "toggle-state": toggleStateMode,
    "back-button": previousPage,
    "forward-button": nextPage,
    "nav-popup": toggleNav,
    "nav-close": toggleNav,
  };

  // Add notepad handlers only if notepad feature is enabled
  if (isFeatureEnabled('notepad')) {
    clickHandlers["notepad-button"] = toggleNotepad;
    clickHandlers["close-notepad"] = toggleNotepad;
    clickHandlers["save-notepad"] = saveNotes;
  }

  // Attach all click handlers
  Object.entries(clickHandlers).forEach(([id, handler]) => {
    const element = elementCache.get(id);
    if (element) element.addEventListener("click", handler);
  });

  // Handle special cases
  const languageDropdown = elementCache.get("language-dropdown");
  if (languageDropdown) languageDropdown.addEventListener("change", switchLanguage);

  // Set up notepad auto-save - only if notepad feature is enabled
  if (isFeatureEnabled('notepad')) {
    const notepadTextarea = elementCache.get("notepad-textarea");
    if (notepadTextarea) {
      let saveTimeout;
      notepadTextarea.addEventListener("input", () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveNotes, 1000);
      });
    }
  }

  // Global listeners
  document.addEventListener("click", handleNavigation);
  document.addEventListener("keydown", handleKeyboardShortcuts);

  // Purple links
  const purpleLinks = elementCache.getAll('.purple-link-button');
  purpleLinks.forEach(link => {
    link.addEventListener('click', () => {
      localStorage.setItem('originatingPage', window.location.href);
    });
  });

  setupClickOutsideHandler();
}

function setupAudioListeners() {
  // Set up basic controls with a map
  const audioControls = [
    ["play-pause-button", togglePlayPause],
    ["toggle-read-aloud", toggleReadAloud],
    ["audio-previous", playPreviousAudio],
    ["audio-next", playNextAudio],
    ["read-aloud-speed", togglePlayBarSettings]
  ];

  audioControls.forEach(([id, handler]) => {
    const element = elementCache.get(id);
    if (element) element.addEventListener("click", handler);
  });

  // Speed buttons
  const speedButtons = elementCache.getAll(".read-aloud-change-speed");
  speedButtons.forEach(button => {
    button.addEventListener("click", changeAudioSpeed);
  });
}

async function initializeUIComponents() {
  try {
    // Layout and visual components - always initialize these
    await lazyLoad.load('zoom', () => Promise.resolve({ init: initializeZoomController }))
      .then(module => module.init());
    initializeSidebar();
    initializeTabs();
    adjustLayout();

    // Initialize features based on config
    if (window.appConfig?.features) {
      // Audio features
      if (isFeatureEnabled('readAloud')) {
        initializePlayBar();
        initializeAudioSpeed();
        setupAudioListeners();
        initializeTtsQuickToggle();

        // Show the sidebar TTS toggle section
        const ttsSidebarSection = document.getElementById("tts-sidebar-section");
        if (ttsSidebarSection) ttsSidebarSection.classList.remove("hidden");

        // Show play bar if needed
        if (state.readAloudMode) {
          initializeAudioElements();
          const playBar = elementCache.get("play-bar");
          if (playBar) playBar.classList.remove("hidden");
        }
      }

      // Glossary
      if (isFeatureEnabled('glossary')) {
        initializeGlossary();
      }

      // ELI5
      if (isFeatureEnabled('eli5')) {
        initializeEli5();
      }

      // Notepad
      if (isFeatureEnabled('notepad')) {
        initializeNotepad();
      }

      // Character display
      if (isFeatureEnabled('characterDisplay')) {
        initCharacterDisplay();
        displayCharacterInSettings();
      }

      // Highlighting text
      if (isFeatureEnabled('highlight')) {
        initializeWordByWordHighlighter();
      }

      // Load state modes - only if features are enabled
      const stateInitTasks = [];

      if (isFeatureEnabled('easyRead')) {
        const easyReadSection = document.getElementById("easy-read-section");
        if (easyReadSection) easyReadSection.classList.remove("hidden");
        stateInitTasks.push(loadEasyReadMode);
      }
      // Always load state mode to maintain consistency, regardless of button visibility
      stateInitTasks.push(loadStateMode);
      if (isFeatureEnabled('signLanguage')) {
        const signLanguageSection = document.getElementById("sign-language-section");
        if (signLanguageSection) signLanguageSection.classList.remove("hidden");
        initializeSignLanguage();
        stateInitTasks.push(loadSignLanguageMode);
      }
      if (isFeatureEnabled('notepad')) {
        stateInitTasks.push(loadSavedNotes());
        stateInitTasks.push(loadNotepad);
      }
      if (isFeatureEnabled('autoplay')) {
        setAutoplayContainerVisibility(true);
        stateInitTasks.push(loadAutoplayState);
      } else {
        setAutoplayContainerVisibility(false);
      }
      if (isFeatureEnabled('describeImages')) {
        setDescribeImagesContainerVisibility(true);
        stateInitTasks.push(loadDescribeImagesState);
      }
      if (isFeatureEnabled("autoplay") || isFeatureEnabled("describeImages")) {
        updateTtsOptionsContainerVisibility(true);
      } else {
        updateTtsOptionsContainerVisibility(false);
      }
      if (isFeatureEnabled('glossary')) stateInitTasks.push(loadGlossaryState);
      if (isFeatureEnabled('eli5')) {
        handleEli5Popup();
      }

      // Hide assistant tab if no assistant features are enabled
      const hasAssistantFeatures =
        isFeatureEnabled('easyRead') ||
        isFeatureEnabled('readAloud') ||
        isFeatureEnabled('signLanguage') ||
        isFeatureEnabled('eli5') ||
        isFeatureEnabled('glossary');
      if (!hasAssistantFeatures) {
        const assistantTab = document.getElementById("assistant-tab");
        if (assistantTab) assistantTab.classList.add("hidden");
        // Default to settings tab
        const settingsTab = document.getElementById("settings-tab");
        const assistantContent = document.getElementById("assistant-content");
        const settingsContent = document.getElementById("settings-content");
        if (settingsTab && assistantContent && settingsContent) {
          settingsTab.setAttribute("aria-selected", "true");
          settingsTab.classList.add("text-blue-700", "border-b-4", "-mb-1", "border-blue-700");
          assistantContent.classList.add("hidden");
          settingsContent.classList.remove("hidden");
        }
      }

      if (stateInitTasks.length > 0) {
        await Promise.all(stateInitTasks.map(task => Promise.resolve().then(task)));
      }

    } else {
      // Fallback to the original behavior if config isn't available
      const initGroups = [
        // All your original initialization groups
      ];
      await Promise.all(initGroups.map(group => group()));
    }

    // Activities should be initialized after UI components
    if (isFeatureEnabled('activities', true)) {
      const activitySections = document.querySelectorAll('section[role="activity"]');
      if (activitySections.length > 0) {
        initializeQuizActivity();
        prepareActivity();
      }
    }
    loadToggleButtonState();
  } catch (error) {
    console.error('Error initializing UI components:', error);
  }
}

const finalizeInitialization = async () => {
  const navPopup = elementCache.get("navPopup");
  const sidebar = elementCache.get("sidebar");

  setTimeout(async () => {
    // Show navigation and sidebar
    if (navPopup) navPopup.classList.remove("hidden");
    if (sidebar) sidebar.classList.remove("hidden");

    // Initialize autoplay if needed
    if (isFeatureEnabled('readAloud') && isFeatureEnabled('autoplay')) {
      initializeAutoplay();
    }

    // Run these tasks in parallel
    const finalTasks = [
      // Navigation
      () => initializeNavigation(),

      // Reference page functionality
      () => initializeReferencePage(),

      // Glossary terms
      () => {
        if (isFeatureEnabled('glossary')) {
          highlightGlossaryTerms();
        }
      },

      // Math rendering
      () => {
        if (window.MathJax) {
          window.MathJax.typeset();
        }
      },

      // Adjust layout after all content is ready
      () => {
        adjustLayout();
      },

      // Initialize tutorial via lazy loading
      async () => {
        if (!isFeatureEnabled('showTutorial', true)) {
          return;
        }

        const tutorialModule = await lazyLoad.load('tutorial', () => import('./modules/tutorial.js'));
        if (tutorialModule.init) {
          tutorialModule.init();
        }
      },

      // Analytics
      async () => {
        // Check if analytics is enabled in config
        if (window.appConfig?.analytics?.enabled) {
          const analyticsModule = await lazyLoad.load('analytics', () => import('./modules/analytics.js'));
          analyticsModule.initMatomo(window.appConfig.analytics);
        }
      }
    ];

    // Execute all tasks in parallel
    await Promise.all(finalTasks.map(task => Promise.resolve().then(task)));
  }, 100);
};

/**
 * Displays character information in the settings menu
 */
function displayCharacterInSettings() {
  // Get the character information from localStorage
  const characterInfo = localStorage.getItem('characterInfo');
  const studentID = localStorage.getItem('studentID');

  // Show the entire character-profile-row if it is hidden
  const profileRow = document.getElementById('character-profile-row');
  if (profileRow && profileRow.classList.contains('hidden')) {
    profileRow.classList.remove('hidden');
  }

  if (characterInfo) {
    try {
      const character = JSON.parse(characterInfo);
      const emojiElement = elementCache.get('settings-character-emoji');
      const nameElement = elementCache.get('settings-character-name');
      const studentIDElements = elementCache.getAll('#student-id');

      if (emojiElement && nameElement) {
        emojiElement.textContent = character.emoji || '👤';
        nameElement.textContent = character.fullName || localStorage.getItem('nameUser') || 'Guest';
      }

      // Update any student ID elements in the settings
      if (studentID && studentIDElements.length > 0) {
        studentIDElements.forEach(element => {
          if (element) element.textContent = studentID;
        });
      }
    } catch (e) {
      console.error('Error parsing character information:', e);
    }
  }
}

// Lazy load module function
const lazyLoad = {
  _modules: {},

  async load(name, loader) {
    if (!this._modules[name]) {
      this._modules[name] = await loader();
    }
    return this._modules[name];
  }
};

// Add this function near your setupConfig function
export const isFeatureEnabled = (featureName, defaultValue = false) => {
  // Access from appConfig if available, otherwise fall back to state
  if (typeof window.appConfig?.features?.[featureName] !== 'undefined') {
    return window.appConfig.features[featureName] === true;
  }

  // Fall back to state object
  const stateKey = `${featureName}Enabled`;
  if (typeof state[stateKey] !== 'undefined') {
    return state[stateKey] === true;
  }

  return defaultValue;
}


// Export necessary functions
export {
  changeAudioSpeed,
  handleKeyboardShortcuts,
  initializeAutoplay,
  loadAutoplayState,
  loadDescribeImagesState,
  playNextAudio,
  playPreviousAudio,
  toggleEli5Mode,
  togglePlayPause,
  toggleReadAloud,
};
