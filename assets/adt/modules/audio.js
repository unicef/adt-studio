/**
 * @module audio
 * @description
 * Audio playback and Text-to-Speech (TTS) utilities for activities and UI.
 * Handles audio element management, playback queue, highlighting, controls, and speed.
 */

import { state, setState } from './state.js';
import { getCookie, setCookie } from './cookies.js';
import {
    updatePlayPauseIcon,
    deactivateAudioElements,
    initializeAudioElements,
    highlightElement,
    unhighlightElement,
    unhighlightAllElements
} from './ui_utils.js';
import { toggleButtonColor, toggleButtonState } from './utils.js';
import { togglePlayBarSettings, toggleSignLanguageMode } from './interface.js';
import { trackToggleEvent } from './analytics.js';
import { isFeatureEnabled } from '../base.js';

/**
 * Maps speed class names to playback rates.
 * @constant
 * @type {Object}
 */
const SPEED_MAPPING = {
    'speed-0-5': '0.5',
    'speed-1': '1',
    'speed-1-5': '1.5',
    'speed-2': '2'
};

let hasUserInteracted = true;
let activityAudio = null;
let isProcessingAudio = false;

/**
 * Initializes activity audio elements for sound effects.
 * @returns {Object} activityAudio - Map of sound effect Audio objects.
 */
export const initializeActivityAudioElements = () => {
    if (!activityAudio) {
        activityAudio = {
            drop: new Audio('./assets/sounds/drop.mp3'),
            success: new Audio('./assets/sounds/success.mp3'),
            error: new Audio('./assets/sounds/error.mp3'),
            reset: new Audio('./assets/sounds/reset.mp3'),
            validate_success: new Audio('./assets/sounds/validate_success.mp3'),
            //validate_error: new Audio('./assets/sounds/validate_error.mp3'),
            validate_error: new Audio('./assets/sounds/drop.mp3'),
        };

        Object.values(activityAudio).forEach(audio => {
            audio.volume = 0.5;
        });
    }
    return activityAudio;
};

/**
 * Plays a sound effect for activities.
 * @param {string} soundKey - The key of the sound to play.
 */
export const playActivitySound = (soundKey) => {
    if (!activityAudio || !activityAudio[soundKey]) {
        initializeActivityAudioElements();
    }

    const soundEffect = activityAudio?.[soundKey];
    if (!soundEffect) {
        console.log(`Sound ${soundKey} not available`);
        return null;
    }

    try {
        soundEffect.pause();
        soundEffect.currentTime = 0;
        soundEffect.play().catch((err) => {
            console.log(`Error playing ${soundKey} sound:`, err);
        });
    } catch (err) {
        console.warn(`Error playing ${soundKey} sound:`, err);
        return null;
    }

    return soundEffect;
};

/**
 * Gathers all audio elements from the page for TTS.
 * @returns {Array} Array of audio element objects.
 */
export const gatherAudioElements = () => {
    // Get the current language from state or a global config
    const currentLanguage = state.currentLanguage || (window.appConfig && window.appConfig.languages && window.appConfig.languages.default) || 'es';

    const audioBasePath = `content/i18n/${currentLanguage}/audio/`;

    const elements = Array.from(
        document.querySelectorAll('.container [data-id], .container textarea[data-placeholder-id], .container input[data-placeholder-id]')
    )
        .filter(el => {
            const isNavElement = el.closest('.nav__list') !== null;
            const isImage = el.tagName.toLowerCase() === 'img';
            // Exclude ELI5 sections
            return !isNavElement && !el.getAttribute('data-id')?.startsWith?.('sectioneli5');
        })
        .map(el => {
            const tagName = el.tagName.toLowerCase();

            // If it's an input or textarea with data-placeholder-id, use that instead of data-id
            if ((tagName === 'textarea' || tagName === 'input') && el.hasAttribute('data-placeholder-id')) {
                const placeholderId = el.getAttribute('data-placeholder-id');
                if (placeholderId && state.audioFiles[placeholderId]) {
                    return {
                        element: el,
                        id: placeholderId,
                        audioSrc: audioBasePath + state.audioFiles[placeholderId]
                    };
                }
                return null;
            }

            // Default logic for everything else
            const id = el.getAttribute('data-id');
            let audioSrc = state.audioFiles[id] ? audioBasePath + state.audioFiles[id] : undefined;

            // If it's an image with a data-aria-id, use that audio instead
            if (tagName === 'img') {
                const ariaId = el.getAttribute('data-aria-id');
                if (ariaId && state.audioFiles[ariaId]) {
                    audioSrc = audioBasePath + state.audioFiles[ariaId];
                }
            }

            // For easyReadMode, check the "_easy_read" variant of id
            // but exclude headers and elements in special containers
            if (state.easyReadMode) {
                // Check if element is a header
                const isHeader = el.tagName.toLowerCase().match(/^h[1-6]$/);

                // Check if element is inside excluded areas
                const wordCard = el.closest('.word-card');
                const activityItem = el.closest('[data-activity-item]');
                const navList = el.closest('.nav__list');
                const activityText = el.closest('.activity-text');
                const isExcluded = wordCard !== null || activityItem !== null ||
                    navList !== null || activityText !== null;

                // Only use easyread audio if not a header and not in excluded areas
                if (!isHeader && !isExcluded) {
                    const easyReadAudioId = `${id}_easy_read`;
                    if (state.audioFiles.hasOwnProperty(easyReadAudioId)) {
                        audioSrc = audioBasePath + state.audioFiles[easyReadAudioId];
                    }
                }
            }

            return { element: el, id, audioSrc };
        })
        .filter(item => item && item.audioSrc);

    setState('audioElements', elements);
    return elements;
};

/**
 * Stops current audio playback and resets state.
 */
export const stopAudio = () => {
    try {
        unhighlightAllElements();
        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            setState('currentAudio', null);
        }
        setState('isPlaying', false);
        updatePlayPauseIcon(false); // Update play button state
        isProcessingAudio = false;
    } catch (error) {
        console.error('Error stopping audio:', error);
    }
};

/**
 * Toggles play/pause for TTS audio.
 */
export const togglePlayPause = () => {
    if (state.isPlaying) {
        stopAudio();
    } else {
        setState('isPlaying', true);
        updatePlayPauseIcon(true); // Update play button state
        playAudioSequentially();
    }
};

/**
 * Plays audio elements sequentially.
 */
export const playAudioSequentially = async () => {
    if (isProcessingAudio || !hasUserInteracted) {
        return;
    }

    isProcessingAudio = true;
    try {
        await processAudioQueue();
    } finally {
        isProcessingAudio = false;
    }
    setState('navigationDirection', 'forward');
};

/**
 * Plays the current audio element.
 */
export const playCurrentAudio = async () => {
    const { currentIndex, audioElements, audioSpeed } = state;

    if (currentIndex < 0 || currentIndex >= audioElements.length) {
        stopAudio();
        return;
    }

    const { element, audioSrc } = audioElements[currentIndex];
    try {
        highlightElement(element);
        await playAudioWithPromise(audioSrc, audioSpeed);
        unhighlightElement(element);
        stopAudio();
    } catch (error) {
        console.error('Error playing audio:', error);
        stopAudio();
    }
};

/**
 * Processes the audio queue, playing elements in order.
 * @private
 */
const processAudioQueue = async () => {
    const { currentIndex, audioElements, audioSpeed, describeImagesMode, navigationDirection } = state;

    if (currentIndex < 0 || currentIndex >= audioElements.length) {
        stopAudio();
        state.currentIndex = 0; // Reset index if out of bounds
        state.navigationDirection = 'forward'; // Reset navigation direction
        return;
    }

    // Clear leftover highlights first
    unhighlightAllElements();

    const { element, audioSrc } = audioElements[currentIndex];

    // Check if current element is an image and should be skipped
    const isImage = element.tagName.toLowerCase() === 'img';
    if (isImage && !describeImagesMode) {
        // Skip this audio element and move to the next/previous one based on navigation direction
        if (state.isPlaying) {
            // Determine which direction to navigate based on the last user action
            const direction = navigationDirection === 'backward' ? -1 : 1;
            setState('currentIndex', currentIndex + direction);

            // We don't reset navigation direction here yet - we need to keep skipping in the same direction
            // until we find a non-image element

            await processAudioQueue();
            return;
        } else {
            stopAudio();
            return;
        }
    }

    try {
        highlightElement(element);
        await playAudioWithPromise(audioSrc, audioSpeed);
        unhighlightElement(element);

        if (state.isPlaying) {
            // The key fix: After playing an element, always move forward regardless of how we got here
            if (navigationDirection === 'backward') {
                // We've successfully played the "previous" audio, now reset to forward direction
                setState('navigationDirection', 'forward');
                setState('currentIndex', currentIndex + 1); // Move forward
            } else {
                // Continue in forward direction
                setState('currentIndex', currentIndex + 1);
            }
            await processAudioQueue();
        } else {
            stopAudio();
        }
    } catch (error) {
        console.error('Error playing audio:', error);
        stopAudio();
    }
};

/**
 * Play a single audio file with promise.
 * @private
 * @param {string} src - Audio source URL.
 * @param {string|number} speed - Playback speed.
 * @returns {Promise<void>}
 */
const playAudioWithPromise = (src, speed) => {
    return new Promise((resolve, reject) => {
        if (!state.isPlaying) {
            resolve();
            return;
        }

        const audio = new Audio(src);
        setState('currentAudio', audio);
        audio.playbackRate = parseFloat(speed);

        audio.onended = resolve;
        audio.onerror = reject;

        updatePlayPauseIcon(true); // Update play button state

        audio.play().catch((error) => {
            console.warn('Audio playback failed:', error);
            resolve();
        });
    });
};

/**
 * Plays the previous audio element in the sequence.
 */
export const playPreviousAudio = () => {
    setState('navigationDirection', 'backward');
    setState('currentIndex', Math.max(0, state.currentIndex - 1));
    stopAudio();
    setState('isPlaying', true);
    playAudioSequentially();
};

/**
 * Plays the next audio element in the sequence.
 */
export const playNextAudio = () => {
    setState('navigationDirection', 'forward');
    setState('currentIndex', state.currentIndex + 1);
    stopAudio();
    setState('isPlaying', true);
    playAudioSequentially();
};

/**
 * Initializes audio speed from cookies and updates UI.
 */
export const initializeAudioSpeed = () => {
    const savedSpeed = getCookie('audioSpeed');
    if (savedSpeed) {
        setState('audioSpeed', savedSpeed);
        updateSpeedDisplay(savedSpeed);
        updateSpeedButtons(savedSpeed);
    }
};

/**
 * Changes the audio speed based on user selection.
 * @param {Event} event - The click event from the speed button.
 */
export const changeAudioSpeed = (event) => {
    const button = event.target.closest('.read-aloud-change-speed');
    const speedClass = Array.from(button.classList).find(cls => cls.startsWith('speed-'));
    const newSpeed = SPEED_MAPPING[speedClass];

    setState('audioSpeed', newSpeed);
    setCookie('audioSpeed', newSpeed, 7);

    updateAudioSpeed(newSpeed);
    updateSpeedDisplay(newSpeed);
    updateSpeedButtons(button);
    togglePlayBarSettings();
};

/**
 * Updates the playback speed for current audio elements.
 * @private
 * @param {string|number} speed - Playback speed.
 */
const updateAudioSpeed = (speed) => {
    if (state.currentAudio) {
        state.currentAudio.playbackRate = parseFloat(speed);
    }
    if (state.eli5Audio) {
        state.eli5Audio.playbackRate = parseFloat(speed);
    }
};

/**
 * Updates the speed display in the UI.
 * @private
 * @param {string|number} speed - Playback speed.
 */
const updateSpeedDisplay = (speed) => {
    const speedClass = Object.entries(SPEED_MAPPING)
        .find(([key, value]) => value === speed)?.[0] || 'speed-1';
    const speedButton = document.querySelector(`[class*="${speedClass}"]`);
    const display = speedButton?.innerHTML;

    if (display) {
        const speedButtonElement = document.getElementById('read-aloud-speed');
        speedButtonElement.innerHTML = display;

        // Update aria-label for screen readers
        const speedText = speedButton.textContent.trim();
        speedButtonElement.setAttribute('aria-label', `Playback speed: ${speedText}`);
    }
};

/**
 * Updates the speed button styles in the UI.
 * @private
 * @param {HTMLElement|string} selectedButton - The selected button or speed value.
 */
const updateSpeedButtons = (selectedButton) => {
    document.querySelectorAll('.read-aloud-change-speed').forEach(btn => {
        if (btn === selectedButton) {
            btn.classList.add('bg-white', 'text-black');
            btn.classList.remove('bg-black', 'text-white');
        } else {
            btn.classList.remove('bg-white', 'text-black');
            btn.classList.add('bg-black', 'text-white');
        }
    });
};

/**
 * Toggle Read Aloud mode and updates UI.
 * @param {Object} [options] - Options for toggling.
 * @param {boolean} [options.stopCalls=false] - If true, stops related calls.
 */
export const toggleReadAloud = ({ stopCalls = false } = {}) => {
    stopAudio();
    unhighlightAllElements();

    // If turning read aloud off, remove all audio handlers
    if (state.readAloudMode) {
        deactivateAudioElements();
    } else {
        initializeAudioElements();
    }

    const newState = !state.readAloudMode;
    setState('readAloudMode', newState);
    setCookie('readAloudMode', newState.toString(), 7);
    toggleButtonColor("tts-quick-toggle-button", newState);

    // Track the toggle event
    trackToggleEvent('ReadAloud', newState);

    // Toggle UI elements
    const playBar = document.getElementById("play-bar");
    const ttsOptionsContainer = document.getElementById("tts-options-container");
    const autoplayContainer = document.getElementById("autoplay-container");
    const describeImagesContainer = document.getElementById("describe-images-container");
    const ttsQuickToggleButton = document.getElementById("tts-quick-toggle-button");

    if (newState) {
        if (playBar) playBar.classList.remove("hidden");
        if (ttsQuickToggleButton) ttsQuickToggleButton.classList.remove("hidden");
        if ((isFeatureEnabled("autoplay") || isFeatureEnabled("describeImages")) && ttsOptionsContainer) {
            ttsOptionsContainer.classList.remove("hidden");
            if (isFeatureEnabled("autoplay")) autoplayContainer?.classList.remove("hidden");
            if (isFeatureEnabled("describeImages")) describeImagesContainer?.classList.remove("hidden");
        }
    } else {
        if (playBar) playBar.classList.add("hidden");
        //if (ttsQuickToggleButton) ttsQuickToggleButton.classList.add("hidden");
        if (ttsOptionsContainer) {
            ttsOptionsContainer.classList.add("hidden");
            if (isFeatureEnabled("autoplay")) autoplayContainer?.classList.add("hidden");
            if (isFeatureEnabled("describeImages")) describeImagesContainer?.classList.add("hidden");
        }
    }

    toggleButtonState("toggle-read-aloud", newState);
    if (!stopCalls && state.signLanguageMode) {
        toggleSignLanguageMode({ stopCalls: true });
    }
};

/**
 * Initializes the quick toggle TTS button and its event listener.
 */
export const initializeTtsQuickToggle = () => {
    const ttsQuickToggleButton = document.getElementById("tts-quick-toggle-button");

    if (ttsQuickToggleButton) {
        // Show the ttsQuickToggleButton if the function is called
        ttsQuickToggleButton.classList.remove("hidden");

        // Add click event listener
        ttsQuickToggleButton.addEventListener("click", (e) => {
            e.preventDefault();

            // Toggle read aloud mode
            toggleReadAloud();
        });
    }
};