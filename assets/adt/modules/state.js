/**
 * @module state
 * @description
 * Centralized state management for UI and activity modules. Provides helpers to get, set, update, and reset state, as well as initialize state from cookies.
 */

/**
 * The main application state object. All UI and activity modules should use this for shared state.
 * @type {Object}
 */
const initialState = {
    currentAudio: null,
    isPlaying: false,
    currentIndex: 0,
    audioElements: [],
    audioQueue: [],
    eli5Active: false,
    eli5Element: null,
    eli5Audio: null,
    eli5Mode: false,
    readAloudMode: false,
    signLanguageMode: false,
    sideBarActive: false,
    navOpen: false,
    navScrollPosition: 0,
    easyReadMode: false,
    autoplayMode: false,
    describeImagesMode: false,
    syllablesMode: false,
    glossaryMode: false,
    audioSpeed: 1,
    selectedOption: null,
    selectedWord: null,
    inCategoryNavigation: false,
    currentWord: null,
    translations: {},
    audioFiles: {},
    validateHandler: null,
    retryHandler: null,
    currentLanguage: document.documentElement.lang || 'en',
    currentPage: "",
    interfaceInitialized: false,
    activeTabIndex: 0,
    glossaryListOpen: false,
    isReferencePage: false,
    originatingPage: null,
    stateMode: true,
    videoFiles: {},
    videoPlaying: false,
    videoElement: null,
    videoSource: "",
    characterName: null,
    characterGreeting: null,
    notepadOpen: false,
    navigationDirection: 'forward'
};

// State management
export const state = { ...initialState };

/**
 * Gets the value of a state property by key.
 * @param {string} key - The state property to retrieve.
 * @returns {*} The value of the state property.
 */
export const getState = (key) => state[key];

/**
 * Sets the value of a state property by key.
 * @param {string} key - The state property to set.
 * @param {*} value - The value to set.
 * @returns {*} The new value of the state property.
 */
export const setState = (key, value) => {
    state[key] = value;
    return state[key];
};

/**
 * Updates multiple state properties at once.
 * @param {Object} updates - An object with key-value pairs to update in state.
 */
export const updateState = (updates) => {
    Object.entries(updates).forEach(([key, value]) => {
        state[key] = value;
    });
};

/**
 * Resets the state object to its initial values.
 */
export const resetState = () => {
    Object.assign(state, initialState);
};

/**
 * Returns a shallow copy of the entire state object.
 * @returns {Object} The current state.
 */
export const getFullState = () => ({ ...state });

/**
 * Initializes state properties from cookies, using defaults for toggles.
 * Should be called on app load to sync persisted state.
 */
export const initializeStateFromCookies = () => {
    const cookieKeys = {
        readAloudMode: false,
        easyReadMode: false,
        eli5Mode: false,
        autoplayMode: false,
        describeImagesMode: false,
        syllablesMode: false,
        audioSpeed: 1,
        currentLanguage: document.documentElement.lang || 'en'
    };

    Object.entries(cookieKeys).forEach(([stateKey, defaultValue]) => {
        const cookieValue = getCookie(stateKey);
        if (cookieValue !== null) {
            if (stateKey === 'audioSpeed') {
                setState(stateKey, parseFloat(cookieValue) || 1);
            } else if (typeof defaultValue === 'boolean') {
                setState(stateKey, cookieValue === 'true');
            } else {
                setState(stateKey, cookieValue || defaultValue);
            }
        } else {
            setState(stateKey, defaultValue);
        }
    });
};