/**
 * @module ui_utils
 * @description
 * UI utility functions for toggles, audio highlighting, ELI5, glossary, tabs, reference pages, and accessibility.
 */

import { getState, setState, state } from './state.js';
import { setCookie, getCookie } from './cookies.js';
import {
    stopAudio,
    gatherAudioElements,
    playCurrentAudio,
    playAudioSequentially
} from './audio.js';
import { setPlayPauseIcon, loadGlossaryTerms, highlightGlossaryTerms, removeGlossaryHighlights, cacheInterfaceElements } from './interface.js'
import { toggleButtonColor, toggleButtonState } from './utils.js';
import { extractPageTerms } from './interface.js';
import { translateText } from './translations.js';
import { trackToggleEvent, trackEvent } from './analytics.js';
import { isFeatureEnabled } from '../base.js';

document.addEventListener('click', (event) => {
    // Check for clicks on any element with glossary-term class or data-glossary-term attribute
    const glossaryTerm = event.target.closest('.glossary-term, [data-glossary-term="true"]');

    if (glossaryTerm) {
        // Import the showGlossaryDefinition function
        import('./interface.js').then(module => {
            // Call the function directly with the event
            module.showGlossaryDefinition(event);
        });

        // Set flag to prevent audio playback
        window._isGlossaryTermClick = true;

        // Stop any currently playing audio
        if (state.isPlaying || state.currentAudio) {
            stopAudio();
            unhighlightAllElements();
        }

        // Clear the flag after a delay
        setTimeout(() => {
            window._isGlossaryTermClick = false;
        }, 100);

        return false;
    }
}, { capture: true }); // Use capture to ensure this runs before other handlers

/**
 * Loads the autoplay state from cookies and updates UI.
 */
export const loadAutoplayState = () => {
    const autoplayModeCookie = getCookie("autoplayMode");
    if (autoplayModeCookie !== null) {
        setState('autoplayMode', autoplayModeCookie === "true");
        toggleButtonState("toggle-autoplay", state.autoplayMode);
    }
};

/**
 * Loads the describe images state from cookies and updates UI.
 */
export const loadDescribeImagesState = () => {
    const describeImagesModeCookie = getCookie("describeImagesMode");
    if (describeImagesModeCookie !== null) {
        // Cookie exists, use its value
        setState('describeImagesMode', describeImagesModeCookie === "true");
    } else {
        // Cookie doesn't exist, set a default value (false)
        setState('describeImagesMode', false);
        setCookie("describeImagesMode", "false", 7);
    }

    // Always sync UI with state (this line was commented out)
    toggleButtonState("toggle-describe-images", state.describeImagesMode);

    // Regather audio elements to ensure correct initial state
    if (state.describeImagesMode) {
        gatherAudioElements();
    }
};

/**
 * Loads the syllables state from cookies and updates UI.
 */
export const loadSyllablesState = () => {
    const syllablesModeCookie = getCookie("syllablesMode");
    if (syllablesModeCookie !== null) {
        setState('syllablesMode', syllablesModeCookie === "true");
        toggleButtonState("toggle-syllables", state.syllablesMode);
    }
};

/**
 * Loads the glossary state from cookies and updates UI.
 */
export const loadGlossaryState = async () => {
    const glossaryModeCookie = getCookie("glossaryMode");
    if (glossaryModeCookie !== null) {
        setState('glossaryMode', glossaryModeCookie === "true");
        toggleButtonState("toggle-glossary", state.glossaryMode);

        if (state.glossaryMode) {
            await loadGlossaryTerms();
            highlightGlossaryTerms();
        }
    }
};

/**
 * Toggles autoplay mode, updates state, UI, and cookies, and starts playback if needed.
 */
export const toggleAutoplay = () => {
    stopAudio();
    unhighlightAllElements();

    setState('autoplayMode', !state.autoplayMode);
    toggleButtonState("toggle-autoplay", state.autoplayMode);
    setCookie("autoplayMode", state.autoplayMode, 7);

    if (state.readAloudMode && state.autoplayMode) {
        setState('currentIndex', 0);
        setState('isPlaying', true);
        setPlayPauseIcon();
        playAudioSequentially();
    }
};

/**
 * Toggles describe images mode, updates state, UI, and cookies, and starts playback if needed.
 */
export const toggleDescribeImages = () => {
    stopAudio();
    unhighlightAllElements();

    setState('describeImagesMode', !state.describeImagesMode);
    toggleButtonState("toggle-describe-images", state.describeImagesMode);
    setCookie("describeImagesMode", state.describeImagesMode, 7);

    // Regather audio elements to update the sequence with or without images
    // gatherAudioElements();

    // If read aloud and autoplay are active, start playing from beginning
    if (state.readAloudMode && state.autoplayMode) {
        setState('currentIndex', 0);
        setState('isPlaying', true);
        setPlayPauseIcon();
        playAudioSequentially();
    }
};

/**
 * Initializes autoplay if both read aloud and autoplay are enabled.
 */
export const initializeAutoplay = () => {
    // Don't automatically start playing on page load
    if (state.readAloudMode && state.autoplayMode) {
        setState('isPlaying', true);
        setPlayPauseIcon();

        // Setup audio elements but don't play yet
        gatherAudioElements();
        setState('currentIndex', 0);

        playAudioSequentially();
    }
};

/**
 * Loads and updates the toggle button states for all main features.
 */
export const loadToggleButtonState = () => {
    const easyReadItem = document.getElementById("toggle-easy-read");
    const readAloudItem = document.getElementById("toggle-read-aloud");
    //const syllablesItem = document.getElementById("toggle-syllables");
    const eli5Item = document.getElementById("toggle-eli5");
    const ttsOptionsContainer = document.getElementById("tts-options-container");
    //const glossaryItem = document.getElementById("glossary-toggle");

    if (!readAloudItem || !eli5Item || !ttsOptionsContainer || !easyReadItem) {
        setTimeout(loadToggleButtonState, 100);
        return;
    }

    // Set visibility for each feature container based on state
    // setAutoplayContainerVisibility(state.autoplayMode);
    // setDescribeImagesContainerVisibility(state.describeImagesMode);
    updateTtsOptionsContainerVisibility(state.readAloudMode);
    // setEli5ContainerVisibility(state.eli5Mode);

    // Optionally, update button states/colors as before
    toggleButtonState("toggle-read-aloud", state.readAloudMode);
    toggleButtonColor("tts-quick-toggle-button", state.readAloudMode);
    toggleButtonState("toggle-eli5", state.eli5Mode);
    toggleButtonState("toggle-easy-read", state.easyReadMode);
    handleEli5State();
};

/**
 * Initializes click listeners for all audio elements in state.
 */
export const initializeAudioElements = () => {
    state.audioElements.forEach(({ element }) => {
        // Remove existing handler if it exists
        if (element._audioHandler) {
            element.removeEventListener('click', element._audioHandler);
        }

        // Create and store new handler
        element._audioHandler = () => handleAudioElementClick(element, state.audioElements);

        // Add the new listener
        element.addEventListener('click', element._audioHandler);
    });
}

/**
 * Removes all audio click handlers from elements in the audio elements array.
 * Use this function before modifying the page content or when disabling read aloud mode
 */
export const deactivateAudioElements = () => {
    // Check if there are any audio elements to process
    if (!state.audioElements || state.audioElements.length === 0) {
        return;
    }

    // Remove handlers from all elements in the state.audioElements array
    state.audioElements.forEach(({ element }) => {
        if (element && element._audioHandler) {
            // Remove the event listener using the stored handler reference
            element.removeEventListener('click', element._audioHandler);

            // Clear the stored handler reference to free memory
            element._audioHandler = null;

            // Remove visual indication that the element is clickable (if any)
            element.classList.remove('audio-clickable');
        }
    });
}

const handleAudioElementClick = (element, elements) => {
    // First check the global glossary click flag
    if (window._isGlossaryTermClick === true) {
        return;
    }

    // Then check element classes/attributes
    const isGlossaryTerm =
        element.classList.contains('glossary-highlighted') ||
        element.classList.contains('glossary-term') ||
        element.hasAttribute('data-glossary-term') ||
        element.closest('.glossary-term-highlight') ||
        element.closest('.glossary-term') ||
        element.closest('[data-glossary-term]');

    if (isGlossaryTerm) {
        return;
    }

    if (state.readAloudMode) {
        const isImage = element.tagName.toLowerCase() === "img";

        // Always allow clicks to play audio, even for images when describe images is off
        const index = elements.findIndex(item => item.element === element);

        // If the element is found in our current sequence, play it
        if (index !== -1) {
            setState('currentIndex', index);
            stopAudio();
            setState('isPlaying', true);
            playCurrentAudio();
        }
        // Special handling for images that might not be in the sequence (when describe images is off)
        else if (isImage) {
            // Get the image's ID and audio source directly
            const id = element.getAttribute('data-id');
            let audioSrc = state.audioFiles[id];

            const ariaId = element.getAttribute('data-aria-id');
            if (ariaId && state.audioFiles[ariaId]) {
                audioSrc = state.audioFiles[ariaId];
            }

            if (audioSrc) {
                // Play the audio directly without using the sequence
                stopAudio();
                unhighlightAllElements();

                const audio = new Audio(audioSrc);
                setState('currentAudio', audio);
                audio.playbackRate = parseFloat(state.audioSpeed);

                highlightElement(element);
                setState('isPlaying', true);
                updatePlayPauseIcon(true);

                audio.play().catch(err => {
                    console.error("Error playing audio:", err);
                    unhighlightElement(element);
                    setState('isPlaying', false);
                    updatePlayPauseIcon(false);
                });

                audio.onended = () => {
                    unhighlightElement(element);
                    setState('currentAudio', null);
                    setState('isPlaying', false);
                    updatePlayPauseIcon(false);
                };
            }
        }
    }
};

/* const handleReadAloudState = (autoplayContainer, describeImagesContainer, ttsOptionsContainer, eli5Container) => {
    const readAloudModeCookie = getCookie("readAloudMode");
    if (readAloudModeCookie) {
        setState('readAloudMode', readAloudModeCookie === "true");
        if (state.readAloudMode) {
            initializeAudioElements();
        }
        toggleButtonState("toggle-read-aloud", state.readAloudMode);
        toggleButtonColor("tts-quick-toggle-button", state.readAloudMode);
        updateContainersVisibility(
            state.readAloudMode,
            autoplayContainer,
            describeImagesContainer,
            ttsOptionsContainer,
            eli5Container
        );
    }
};

const updateContainersVisibility = (
    isReadAloudMode,
    autoplayContainer,
    describeImagesContainer,
    ttsOptionsContainer,
    eli5Container
) => {
    if (isReadAloudMode) {
        showReadAloudContainers(ttsOptionsContainer, autoplayContainer, describeImagesContainer, eli5Container);
    } else {
        hideReadAloudContainers(ttsOptionsContainer, autoplayContainer, describeImagesContainer, eli5Container);
    }
}; */

export const showReadAloudContainers = () => {
    const ttsOptionsContainer = document.getElementById('tts-options-container');
    //const autoplayContainer = document.getElementById('autoplay-container');
    const describeImagesContainer = document.getElementById('describe-images-container');
    const eli5Container = document.querySelector('#eli5-label')?.closest('.flex');

    // Show options and ensure proper spacing
    ttsOptionsContainer?.classList.remove('hidden');
    //autoplayContainer?.classList.remove('hidden');
    describeImagesContainer?.classList.remove('hidden');

    ttsOptionsContainer?.classList.add('mt-4', 'mb-2', 'px-4');
    eli5Container?.classList.add('mt-4');
};

/**
 * Updates the play/pause icon in the UI based on playback state.
 * @param {boolean} isPlaying - Whether audio is currently playing.
 */
export const updatePlayPauseIcon = (isPlaying) => {
    const playIcon = document.getElementById("read-aloud-play-icon");
    const pauseIcon = document.getElementById("read-aloud-pause-icon");
    if (isPlaying) {
        playIcon.style.display = "none";
        playIcon.setAttribute("aria-hidden", "true");
        pauseIcon.style.display = "";
        pauseIcon.setAttribute("aria-hidden", "false");
    } else {
        playIcon.style.display = "";
        playIcon.setAttribute("aria-hidden", "false");
        pauseIcon.style.display = "none";
        pauseIcon.setAttribute("aria-hidden", "true");
    }
};

/**
 * Hides the read aloud containers (TTS options, autoplay, describe images, ELI5) and updates ARIA attributes.
 * @param {HTMLElement} ttsOptionsContainer - The TTS options container element.
 * @param {HTMLElement} autoplayContainer - The autoplay container element.
 * @param {HTMLElement} describeImagesContainer - The describe images container element.
 * @param {HTMLElement} eli5Container - The ELI5 container element.
 * @private
 */
const hideReadAloudContainers = (ttsOptionsContainer, autoplayContainer, describeImagesContainer, eli5Container) => {
    ttsOptionsContainer.classList.add("hidden");
    ttsOptionsContainer.setAttribute("aria-expanded", "false");
    autoplayContainer.classList.add("hidden");
    describeImagesContainer.classList.add("hidden");
    eli5Container.classList.add("border-t", "border-gray-300");
};

/**
 * Handles the ELI5 state, toggling the explain button visibility and updating the toggle state.
 * Checks feature availability and cookie, updates state and UI accordingly.
 * @private
 */
const handleEli5State = () => {
    const explainButton = document.getElementById('explain-me-button');
    const eli5ModeCookie = getCookie("eli5Mode");
    if (isFeatureEnabled("eli5") && eli5ModeCookie) {
        setState('eli5Mode', eli5ModeCookie === "true");
        toggleButtonState("toggle-eli5", state.eli5Mode);

        if (state.eli5Mode && state.translations) {
            displayEli5Content();
            explainButton?.classList.remove('hidden');
        } else {
            // Hide the button if ELI5 mode is off
            explainButton?.classList.add('hidden');
        }
    } else {
        // If no cookie is set, ELI5 is off by default
        explainButton?.classList.add('hidden');
    }
};

/**
 * Displays ELI5 content in the UI if available for the current section.
 * Applies custom list styling for ELI5 content.
 * @private
 */
const displayEli5Content = () => {
    const eli5Id = document.querySelector('section[data-eli5-id]')?.getAttribute("data-eli5-id");
    if (!eli5Id) {
        return;
    }

    const eli5Text = state.translations[eli5Id];

    if (eli5Text) {
        const eli5Container = document.getElementById("eli5-content-text");
        if (eli5Container) {
            eli5Container.innerHTML = eli5Text;
            eli5Container.classList.remove("hidden");

            // Apply dash styling to lists if they exist
            if (!document.getElementById('eli5-list-style')) {
                const style = document.createElement('style');
                style.id = 'eli5-list-style';
                style.textContent = `
                    #eli5-content-text ul {
                        list-style-type: none;
                        padding-left: 2.5em;
                        margin-top:0.8em;
                    }
                    #eli5-content-text ul li {
                        position: relative;
                        margin-bottom: 0.5em;
                    }
                    #eli5-content-text ul li::before {
                        content: "—";
                        position: absolute;
                        left: -1.5em;
                        color: #666;
                    }
                `;
                document.head.appendChild(style);
            }
            eli5Container.classList.remove("hidden");
        }
    }
};

/**
 * Toggles ELI5 mode, updates state, cookies, and UI.
 */
export const toggleEli5Mode = () => {
    setState('eli5Mode', !state.eli5Mode);
    setCookie("eli5Mode", state.eli5Mode, 7);
    toggleButtonState("toggle-eli5", state.eli5Mode);

    // Track the toggle event
    trackToggleEvent('Eli5Mode', state.eli5Mode);

    if (state.isPlaying) stopAudio();
    unhighlightAllElements();

    handleEli5ModeToggle();
};

/**
 * Initializes ELI5 UI elements and ensures accessibility.
 */
export const initializeEli5 = () => {
    // Show the explain-me-button if it exists and is hidden
    const explainButton = document.getElementById("explain-me-button");
    if (explainButton && explainButton.classList.contains("hidden")) {
        explainButton.classList.remove("hidden");
        explainButton.setAttribute('aria-hidden', 'false');
        explainButton.setAttribute('tabindex', '0');
    }

    // Show the toggle-eli5 button if it exists and is hidden
    const toggleEli5Button = document.getElementById("toggle-eli5");
    if (toggleEli5Button && toggleEli5Button.classList.contains("hidden")) {
        toggleEli5Button.classList.remove("hidden");
        toggleEli5Button.setAttribute('aria-hidden', 'false');
        toggleEli5Button.setAttribute('tabindex', '0');
    }

    // Show the container of toggle-eli5 if it exists and is hidden
    const eli5Container = document.getElementById("eli5-container");
    if (eli5Container && eli5Container.classList.contains("hidden")) {
        eli5Container.classList.remove("hidden");
        eli5Container.setAttribute('aria-hidden', 'false');
    }
}

/**
 * Handles the ELI5 popup, including open/close and audio playback.
 */
export const handleEli5Popup = () => {
    const explainButton = document.getElementById('explain-me-button');
    const eli5Content = document.getElementById('eli5-content');
    const closeButton = document.getElementById('close-eli5-content');
    const mainSection = document.querySelector('section[data-eli5-id]');

    // Check if elements exist before proceeding
    if (!explainButton || !eli5Content || !closeButton || !mainSection) {
        return;
    }

    const eli5Id = mainSection.getAttribute("data-eli5-id");

    // Toggle the visibility when the button is clicked
    explainButton.addEventListener('click', function () {
        const isVisible = !eli5Content.classList.contains('hidden');

        if (isVisible) {
            eli5Content.classList.add('hidden');
            explainButton.setAttribute('aria-expanded', 'false');
            removeEli5AudioFromQueue();
        } else {
            eli5Content.classList.remove('hidden');
            explainButton.setAttribute('aria-expanded', 'true');
            handleEli5Audio(eli5Id);
        }
    });

    // Hide the popup when the close button is clicked
    closeButton.addEventListener('click', function () {
        eli5Content.classList.add('hidden');
        explainButton.setAttribute('aria-expanded', 'false');
        removeEli5AudioFromQueue();
    });

    // Close popup if user clicks outside of it
    document.addEventListener('click', function (event) {
        if (!eli5Content.contains(event.target) &&
            !explainButton.contains(event.target) &&
            !eli5Content.classList.contains('hidden')) {
            eli5Content.classList.add('hidden');
            explainButton.setAttribute('aria-expanded', 'false');
            removeEli5AudioFromQueue();
        }
    });
};

/**
 * Handles toggling of ELI5 mode, updating content and explain button visibility.
 * Clears content and hides the button if ELI5 mode is off.
 * @private
 */
const handleEli5ModeToggle = () => {
    const explainButton = document.getElementById('explain-me-button');
    if (state.eli5Mode) {
        const mainSection = document.querySelector('section[data-eli5-id]');
        if (!mainSection) {
            if (explainButton) {
                explainButton.classList.add('hidden');
            }
            return;
        }

        const eli5Id = mainSection.getAttribute("data-eli5-id");
        const eli5Text = state.translations[eli5Id];

        if (eli5Text) {
            updateEli5Content(eli5Id, eli5Text);
        }

        if (explainButton) {
            explainButton.classList.remove('hidden');
        }
    } else {

        clearEli5Content();
        //Hide the eli5 toggle button

        if (explainButton) {
            explainButton.classList.add('hidden');
        }
    }
};

/**
 * Updates the ELI5 content area with the provided text and ID.
 * @param {string} eli5Id - The ELI5 section ID.
 * @param {string} eli5Text - The ELI5 content to display.
 * @private
 */
const updateEli5Content = (eli5Id, eli5Text) => {
    const eli5Container = document.getElementById("eli5-content-text");
    eli5Container.innerHTML = `<span data-id="${eli5Id}">${eli5Text}</span>`;
    eli5Container.classList.remove("hidden");
};

/**
 * Handles ELI5 audio playback when ELI5 content is shown.
 * @param {string} eli5Id - The ELI5 section ID.
 * @private
 */
const handleEli5Audio = (eli5Id) => {
    if (state.readAloudMode) {
        stopAudio();
        const eli5Container = document.getElementById("eli5-content-text");
        highlightElement(eli5Container);
        // Get the current language from state or a global config
        const currentLanguage = state.currentLanguage || (window.appConfig && window.appConfig.languages && window.appConfig.languages.default) || 'es';
        const audioBasePath = `content/i18n/${currentLanguage}/audio/`;
        const eli5AudioSrc = audioBasePath + state.audioFiles[eli5Id];

        if (eli5AudioSrc) {
            addEli5AudioToQueue(eli5AudioSrc, eli5Container);
        }
    }
};

/**
 * Adds ELI5 audio to the audio queue and starts playback.
 * @param {string} audioSrc - The audio source URL.
 * @param {HTMLElement} container - The container element for ELI5 content.
 * @private
 */
const addEli5AudioToQueue = (audioSrc, container) => {
    // Check if the element is already in the audio queue
    const existingIndex = state.audioElements.findIndex(
        (item) => item.element === container && item.audioSrc === audioSrc
    );

    if (existingIndex !== -1) {
        // Element is already in the queue, set the current index to the existing element
        setState('currentIndex', existingIndex);
    } else {
        // Add the ELI5 audio to the audio queue
        state.audioElements.push({
            element: container,
            id: 'eli5-audio',
            audioSrc: audioSrc
        });

        // Update the current index to the new ELI5 audio
        setState('currentIndex', state.audioElements.length - 1);
    }

    // Play the ELI5 audio
    setState('isPlaying', true);
    playCurrentAudio();
};

/**
 * Removes ELI5 audio from the audio queue and stops playback.
 * @private
 */
const removeEli5AudioFromQueue = () => {
    // Stop the audio and unhighlight all elements
    stopAudio();
    unhighlightAllElements();

    // Find the index of the ELI5 audio in the audio elements queue
    const eli5Index = state.audioElements.findIndex(item => item.id === 'eli5-audio');

    // If the ELI5 audio is found, remove it from the queue
    if (eli5Index !== -1) {
        state.audioElements.splice(eli5Index, 1);

        // Adjust the current index if necessary
        if (state.currentIndex >= eli5Index) {
            setState('currentIndex', Math.max(0, state.currentIndex - 1));
        }
    }
};

/**
 * Plays ELI5 audio directly and updates playback state.
 * @param {string} audioSrc - The audio source URL.
 * @param {HTMLElement} container - The container element for ELI5 content.
 * @private
 */
const playEli5Audio = (audioSrc, container) => {
    stopAudio();
    setState('eli5Active', true);
    const audio = new Audio(audioSrc);
    setState('eli5Audio', audio);
    audio.playbackRate = parseFloat(state.audioSpeed);
    audio.play();

    audio.onended = () => {
        unhighlightElement(container);
        setState('eli5Active', false);
        setState('isPlaying', false);
        setPlayPauseIcon();
    };

    setState('isPlaying', true);
    setPlayPauseIcon();
};

/**
 * Clears the ELI5 content area and hides it.
 * @private
 */
const clearEli5Content = () => {
    const eli5Container = document.getElementById("eli5-content-text");
    eli5Container.textContent = "";
    eli5Container.classList.add("hidden");
};

export const announceToScreenReader = (message, assertive = false) => {
    let announcement = document.getElementById('sr-announcement');
    if (!announcement) {
        const div = document.createElement('div');
        div.id = 'sr-announcement';
        div.setAttribute('role', 'status');
        div.setAttribute('aria-live', 'polite');
        div.classList.add('sr-only'); // Make it invisible but available to screen readers
        document.body.appendChild(div);
        announcement = div;
    }

    // Clear existing content first
    announcement.textContent = '';

    // Set the politeness based on the assertive parameter
    announcement.setAttribute('aria-live', assertive ? 'assertive' : 'polite');

    // Add lang attribute to ensure Spanish pronunciation
    announcement.setAttribute('lang', 'es');

    // Set the message after a small delay to ensure screen readers detect the change
    setTimeout(() => {
        announcement.textContent = message;
    }, 50);
}

/**
 * Populates glossary terms in the sidebar and page glossary lists.
 */
export const populateGlossaryTerms = () => {
    loadGlossaryTerms().then(() => {
        const glossaryList = document.getElementById('glossary-terms-book');
        const glossaryPageList = document.getElementById('glossary-terms-page');
        const glossaryTerms = state.glossaryTerms;
        state.pageTerms = extractPageTerms(); // Extract terms from the current page
        const pageTerms = state.pageTerms;

        // Empty glossary lists if they already have content
        if (glossaryList) glossaryList.innerHTML = '';
        if (glossaryPageList) glossaryPageList.innerHTML = '';

        // Use a Set to track added terms and avoid duplicates
        const addedTerms = new Set();

        // Populate the main glossary book list with alphabetical grouping
        if (glossaryList && glossaryTerms) {
            // Step 1: Collect and organize terms by first letter (normalized to group accented letters)
            const termsByLetter = {};

            Object.entries(glossaryTerms).forEach(([key, data]) => {
                if (!addedTerms.has(key.toLowerCase())) {
                    // Get first letter, normalize it to remove diacritics, and ensure it's uppercase
                    const firstLetterWithAccent = key.charAt(0).toUpperCase();
                    const firstLetterNormalized = firstLetterWithAccent
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toUpperCase();

                    // Use the normalized letter as the key for grouping
                    if (!termsByLetter[firstLetterNormalized]) {
                        termsByLetter[firstLetterNormalized] = [];
                    }

                    // Add the term data to the appropriate letter group
                    termsByLetter[firstLetterNormalized].push({
                        term: key,
                        displayTerm: key.charAt(0).toUpperCase() + key.slice(1),
                        emoji: data.emoji,
                        definition: data.definition,
                        originalFirstLetter: firstLetterWithAccent // Store for potential display
                    });

                    addedTerms.add(key.toLowerCase());
                }
            });

            // Step 2: Sort the letters alphabetically (normalized)
            const sortedLetters = Object.keys(termsByLetter).sort();

            // Step 3: Create letter groups and append terms
            sortedLetters.forEach(letter => {
                // Determine the display letter (we could use the first term's original letter)
                const letterGroup = termsByLetter[letter];

                // Find if there's any accented version of this letter in the group
                // Otherwise, use the normalized letter itself
                const displayLetter = letter;

                // Create a letter heading
                const letterHeading = document.createElement('div');
                letterHeading.classList.add('glossary-letter-grouping', 'text-2xl', 'font-bold', 'mt-6', 'mb-3', 'text-blue-700', 'pb-4');
                letterHeading.textContent = displayLetter;
                glossaryList.appendChild(letterHeading);

                // Sort terms within this letter group alphabetically
                // We use localeCompare with sensitivity: 'base' to treat accented letters the same
                letterGroup.sort((a, b) =>
                    a.term.localeCompare(b.term, undefined, { sensitivity: 'base' })
                );

                // Create and append each term in this letter group
                letterGroup.forEach(item => {
                    createGlossaryItem(glossaryList, item.displayTerm, item.emoji, item.definition, item.term);
                });
            });
        }

        // Populate the page-specific glossary terms
        if (glossaryPageList && pageTerms && pageTerms.length > 0) {
            pageTerms.forEach(term => {
                let termData = null;
                let matchedMainTerm = null;

                // Find the term data and the corresponding main term
                Object.entries(glossaryTerms).forEach(([key, data]) => {
                    const { variations } = data;
                    const variation = variations.find(v => v.toLowerCase() === term.toLowerCase());
                    if (variation) {
                        termData = data;
                        matchedMainTerm = key; // Store the main term, not the variation
                    } else if (key.toLowerCase() === term.toLowerCase()) {
                        termData = data;
                        matchedMainTerm = key;
                    }
                });

                if (termData && matchedMainTerm) {
                    const { emoji, definition } = termData;

                    // Create a container for each glossary item
                    const glossaryItem = document.createElement('div');
                    glossaryItem.classList.add('mb-4',
                        'border-b',
                        'border-gray-300',
                        'pb-4',
                        'glossary-page-item',
                        'cursor-pointer',
                        'focus:outline-none',
                        'focus:ring-2',
                        'focus:ring-blue-700',
                        'focus:ring-opacity-50'
                    );

                    // Make the container focusable with proper keyboard support - added these lines
                    glossaryItem.setAttribute('tabindex', '0');
                    glossaryItem.setAttribute('role', 'button');
                    glossaryItem.setAttribute('aria-label', `${term}${emoji ? ' ' + emoji : ''}`);

                    // Use the exact matched text from the page for display
                    const termTitleText = term.charAt(0).toUpperCase() + term.slice(1);

                    // Create the term element as a title
                    const termTitle = document.createElement('div');
                    termTitle.classList.add('font-bold', 'text-lg', 'glossary-page-term');
                    termTitle.textContent = emoji ? (termTitleText + " " + emoji) : termTitleText;
                    glossaryItem.appendChild(termTitle);

                    // Create the definition element
                    const definitionElement = document.createElement('div');
                    definitionElement.classList.add('mt-2', 'text-gray-700', 'mb-2');
                    definitionElement.textContent = definition;
                    glossaryItem.appendChild(definitionElement);

                    // Add keyboard support - added these event listeners
                    glossaryItem.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault(); // Prevent scrolling on space key
                            // Optionally add any action you want when this item is activated
                        }
                    });

                    // Add focus and hover visual indicators - added these event listeners
                    glossaryItem.addEventListener('focus', () => {
                        glossaryItem.classList.add('bg-gray-100');
                    });

                    glossaryItem.addEventListener('blur', () => {
                        glossaryItem.classList.remove('bg-gray-100');
                    });

                    // Append the glossary item to the list
                    glossaryPageList.appendChild(glossaryItem);
                }
            });
        } else if (glossaryPageList) {
            glossaryPageList.innerHTML = '<span data-id="glossary-no-terms">' + translateText('glossary-no-terms') + '</span>';
        }

        // If glossary mode is on, reload glossary terms
        if (state.glossaryMode) {
            highlightGlossaryTerms();
        } else {
            removeGlossaryHighlights();
        }
    });
};

/**
 * Creates a glossary item element and appends it to the glossary list.
 * Adds keyboard and click support for accessibility.
 * @param {HTMLElement} glossaryList - The glossary list container.
 * @param {string} term - The glossary term.
 * @param {string} emoji - The emoji associated with the term.
 * @param {string} definition - The definition of the term.
 * @param {string} variation - The main term or variation key.
 * @private
 */
const createGlossaryItem = (glossaryList, term, emoji, definition, variation) => {
    // Create a container for each glossary item
    const glossaryItem = document.createElement('div');
    glossaryItem.classList.add(
        'mb-4',
        'border-b',
        'border-gray-300',
        'pb-4',
        'glossary-item',
        'cursor-pointer',
        'focus:outline-none',
        'focus:ring-2',
        'focus:ring-blue-500',
        'focus:ring-opacity-50'
    );

    // Make the container focusable with proper keyboard support
    glossaryItem.setAttribute('tabindex', '0');
    glossaryItem.setAttribute('role', 'button');
    glossaryItem.setAttribute('aria-label', `${term}${emoji ? ' ' + emoji : ''}`);

    // Create the term element (no longer using <a> to avoid navigation confusion)
    const termElement = document.createElement('div');
    termElement.classList.add('font-bold', 'text-lg', 'glossary-term');
    termElement.textContent = term;

    // Add emoji if present
    if (emoji) {
        const emojiSpan = document.createElement('span');
        emojiSpan.classList.add('ml-1');
        emojiSpan.textContent = emoji;
        termElement.appendChild(emojiSpan);
    }

    // Store the variations and other properties as before
    const termData = state.glossaryTerms[variation];
    if (termData && termData.variations && Array.isArray(termData.variations)) {
        const allSearchTerms = [variation.toLowerCase(), ...termData.variations.map(v => v.toLowerCase())];
        glossaryItem.dataset.searchTerms = allSearchTerms.join('|');
    } else {
        glossaryItem.dataset.searchTerms = variation.toLowerCase();
    }

    glossaryItem.appendChild(termElement);
    glossaryList.appendChild(glossaryItem);

    // Add keyboard support - handle both click and keyboard events
    const showDetails = (event) => {
        // Only trigger on Enter or Space for keyboard events
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        if (event.type === 'keydown' && event.key === ' ') {
            event.preventDefault(); // Prevent page scroll on Space key
        }

        const glossaryContent = document.getElementById('glossary-content');
        const glossaryTermDetails = document.getElementById('glossary-term-details');
        const glossaryTermContent = document.getElementById('glossary-term-content');

        // Remember the originating item for later focus return
        glossaryTermDetails.dataset.sourceItemId = glossaryItem.id;

        // Ensure the glossary item has a unique ID for focus return
        if (!glossaryItem.id) {
            glossaryItem.id = `glossary-item-${variation.replace(/\s+/g, '-').toLowerCase()}`;
        }

        // Get the term data and format content as before
        const originalTerm = variation;
        const termData = state.glossaryTerms[originalTerm];
        let variationsHtml = '';

        if (termData && termData.variations && termData.variations.length > 0) {
            const joinedVariations = termData.variations.join(', ');
            const formattedVariations = joinedVariations.charAt(0).toUpperCase() + joinedVariations.slice(1);
            variationsHtml = `
                <div class="text-sm text-gray-500 mt-1 mb-3">
                    ${formattedVariations}
                </div>
            `;
        }

        // Populate the term details content
        glossaryTermContent.innerHTML = `
            <div class="flex justify-center items-center mt-8 mb-2 border-b border-gray-300 pb-8">
                <h3 class="text-2xl font-bold">
                    ${term} ${emoji || ''}
                </h3>
            </div>
            ${variationsHtml}
            <div class="mt-4 text-lg">
                ${definition}
            </div>
        `;

        // Hide glossary content and show term details
        glossaryContent.classList.add('hidden');
        glossaryTermDetails.classList.remove('hidden');

        // Set focus to the close button for keyboard navigation
        const closeButton = document.getElementById('close-glossary-term-details');
        if (closeButton) {
            setTimeout(() => closeButton.focus(), 10);
        }

        // Announce to screen readers
        announceToScreenReader(`Showing details for ${term}`);
    };

    // Add both click and keyboard event listeners
    glossaryItem.addEventListener('click', showDetails);
    glossaryItem.addEventListener('keydown', showDetails);

    // Add focus indicators
    glossaryItem.addEventListener('focus', () => {
        glossaryItem.classList.add('bg-gray-100');
    });

    glossaryItem.addEventListener('blur', () => {
        glossaryItem.classList.remove('bg-gray-100');
    });
};

export const initializeGlossary = () => {
    const glossaryButton = document.getElementById('glossary-button');
    const glossaryButtonContainer = glossaryButton?.closest('.flex.justify-between.items-left.border-t.border-gray-300');
    const glossaryContent = document.getElementById('glossary-content');
    const backToSidebarButton = document.getElementById('back-to-sidebar');
    const sidebarContent = document.getElementById('sidebar-content');
    const pageTab = document.getElementById('page-tab');
    const bookTab = document.getElementById('book-tab');
    const pageContent = document.getElementById('page-content');
    const bookContent = document.getElementById('book-content');
    const filterInput = document.getElementById('filter-input');
    const glossaryTermsBook = document.getElementById('glossary-terms-book');
    const glossaryTermDetails = document.getElementById('glossary-term-details');
    const closeGlossaryTermDetailsButton = document.getElementById('close-glossary-term-details');

    // Show the glossary button container if the button exists
    if (glossaryButton && glossaryButtonContainer) {
        glossaryButtonContainer.classList.remove('hidden');
    }

    populateGlossaryTerms();

    if (glossaryButton && glossaryContent && backToSidebarButton && sidebarContent) {
        // Check for saved glossary state first
        const savedGlossaryOpen = getCookie("glossaryListOpen");
        if (savedGlossaryOpen === "true") {
            // Show glossary content, hide sidebar content
            sidebarContent.classList.add('hidden');
            glossaryContent.classList.remove('hidden');
        }

        // Update click handlers to save state
        glossaryButton.addEventListener('click', () => {
            sidebarContent.classList.add('hidden');
            glossaryContent.classList.remove('hidden');
            // Make sure term details is hidden when opening glossary
            glossaryTermDetails.classList.add('hidden');
            // Save state when opening glossary
            setCookie("glossaryListOpen", "true", 7);
            trackEvent('Glossary', 'Open', 'Glossary button clicked');
        });

        backToSidebarButton.addEventListener('click', () => {
            glossaryContent.classList.add('hidden');
            sidebarContent.classList.remove('hidden');
            // Make sure term details is hidden when closing glossary
            glossaryTermDetails.classList.add('hidden');
            // Save state when closing glossary
            setCookie("glossaryListOpen", "false", 7);
            trackEvent('Glossary', 'Close', 'Glossary back button clicked');
        });

        // Update the close glossary term details button handler
        if (closeGlossaryTermDetailsButton) {
            closeGlossaryTermDetailsButton.addEventListener('click', () => {
                // Hide term details and show main glossary content
                glossaryTermDetails.classList.add('hidden');
                glossaryContent.classList.remove('hidden');
            });
        }
    }

    if (pageTab && bookTab && pageContent && bookContent) {
        // Function to set active tab
        const setActiveTab = (tabIndex) => {
            if (tabIndex === 0) {
                // On this page tab
                pageTab.setAttribute('aria-selected', 'true');
                bookTab.setAttribute('aria-selected', 'false');
                pageContent.classList.remove('hidden');
                bookContent.classList.add('hidden');
                pageTab.classList.add("text-blue-700", "border-b-4", "border-blue-700", "-mb-1");
                bookTab.classList.remove("border-b-4", "border-blue-700", "text-blue-700", "-mb-1");
            } else {
                // On this chapter tab
                pageTab.setAttribute('aria-selected', 'false');
                bookTab.setAttribute('aria-selected', 'true');
                pageContent.classList.add('hidden');
                bookContent.classList.remove('hidden');
                pageTab.classList.remove('text-blue-700');
                bookTab.classList.add("text-blue-700", "border-b-4", "-mb-1", "border-blue-700");
                pageTab.classList.remove("border-b-4", "border-blue-700", "text-blue-700", "-mb-1");
            }

            // Save the tab state to a cookie
            setCookie("activeGlossaryTabIndex", tabIndex, 7); // Save for 7 days
        };

        // Check if we have a saved tab preference
        const savedTabIndex = getCookie("activeGlossaryTabIndex");

        // Apply the saved tab or default to the first tab
        if (savedTabIndex !== null && savedTabIndex !== undefined && savedTabIndex !== "") {
            // Apply the saved tab
            setActiveTab(parseInt(savedTabIndex));
        } else {
            // Default to first tab (index 0)
            setActiveTab(0);
        }

        // Event listeners for tab switching
        pageTab.addEventListener('click', () => {
            setActiveTab(0);
        });

        bookTab.addEventListener('click', () => {
            setActiveTab(1);
        });
    }

    if (filterInput && glossaryTermsBook) {
        filterInput.addEventListener('input', () => {
            // Normalize the filter value: lowercase and remove diacritics
            const filterValue = filterInput.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

            // Get all terms and letter headings
            const terms = glossaryTermsBook.querySelectorAll('.glossary-item');
            const letterHeadings = glossaryTermsBook.querySelectorAll('.glossary-letter-grouping');

            let hasResults = false;

            // Create a map to track which letter headings have visible terms
            const letterHeadingsVisibility = new Map();

            // Initialize all letter headings as not having visible terms
            letterHeadings.forEach(heading => {
                letterHeadingsVisibility.set(heading, false);
            });

            // First pass: Filter the terms and mark which letter headings have visible terms
            terms.forEach(term => {
                // Get both visible text and stored search terms (which include variations)
                const termText = term.textContent.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const searchTerms = (term.dataset.searchTerms || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

                // Check if this term matches the filter
                const isVisible = termText.includes(filterValue) || searchTerms.includes(filterValue);

                if (isVisible) {
                    term.classList.remove('hidden');
                    hasResults = true;

                    // Find the previous letter heading for this term
                    let currentElement = term;
                    while (currentElement.previousElementSibling) {
                        currentElement = currentElement.previousElementSibling;
                        if (currentElement.classList.contains('glossary-letter-grouping')) {
                            // Mark this heading as having a visible term
                            letterHeadingsVisibility.set(currentElement, true);
                            break;
                        }
                    }
                } else {
                    term.classList.add('hidden');
                }
            });

            // Second pass: Update visibility of letter headings
            letterHeadings.forEach(heading => {
                if (letterHeadingsVisibility.get(heading)) {
                    heading.classList.remove('hidden');
                } else {
                    heading.classList.add('hidden');
                }
            });

            // Show or hide the no results message
            let noResultsMessage = document.getElementById('no-results-message');
            if (!noResultsMessage) {
                noResultsMessage = document.createElement('span');
                noResultsMessage.id = 'no-results-message';
                noResultsMessage.dataset.id = 'glossary-no-terms-filter';
                noResultsMessage.classList.add('text-gray-700', 'mt-4');
                noResultsMessage.textContent = translateText('glossary-no-terms-filter');
                glossaryTermsBook.appendChild(noResultsMessage);
            }

            if (hasResults) {
                noResultsMessage.classList.add('hidden');
            } else {
                noResultsMessage.classList.remove('hidden');
            }
        });
    }
};

/**
 * Initializes the assistant/settings tabs and restores saved tab state.
 */
export const initializeTabs = () => {
    const assistantTab = document.getElementById('assistant-tab');
    const settingsTab = document.getElementById('settings-tab');
    const assistantContent = document.getElementById('assistant-content');
    const settingsContent = document.getElementById('settings-content');

    if (assistantTab && settingsTab && assistantContent && settingsContent) {
        // Function to set active tab - reuse existing logic
        const setActiveTab = (tabIndex) => {
            if (tabIndex === 0) {
                // Assistant tab
                assistantTab.setAttribute('aria-selected', 'true');
                settingsTab.setAttribute('aria-selected', 'false');
                assistantContent.classList.remove('hidden');
                settingsContent.classList.add('hidden');
                assistantTab.classList.add("text-blue-700", "border-b-4", "-mb-1", "border-blue-700");
                settingsTab.classList.remove("border-b-4", "-mb-1", "border-blue-700", "text-blue-700");
            } else {
                // Settings tab
                assistantTab.setAttribute('aria-selected', 'false');
                settingsTab.setAttribute('aria-selected', 'true');
                assistantContent.classList.add('hidden');
                settingsContent.classList.remove('hidden');
                assistantTab.classList.remove('text-blue-700');
                settingsTab.classList.add("text-blue-700", "border-b-4", "-mb-1", "border-blue-700");
                assistantTab.classList.remove("border-b-4", "-mb-1", "border-blue-700", "text-blue-700");
            }

            // Save the tab state to a cookie
            setCookie("activeTabIndex", tabIndex, 7); // Save for 7 days
        };

        // Check if we have a saved tab preference
        const savedTabIndex = getCookie("activeTabIndex");

        // Apply the saved tab or default to the first tab
        if (savedTabIndex !== null && savedTabIndex !== undefined && savedTabIndex !== "") {
            // Apply the saved tab
            setActiveTab(parseInt(savedTabIndex));
        } else {
            // Default to first tab (index 0)
            setActiveTab(0);
        }

        // Keep existing event listeners, but use the new function
        assistantTab.addEventListener('click', () => {
            setActiveTab(0);
        });

        settingsTab.addEventListener('click', () => {
            setActiveTab(1);
        });
    }
};

/**
 * Checks if the current page should display a return button
 * Also clears originating page if we're back at the original page
 */
export const checkIfReferencePage = () => {
    // Get the originating page from localStorage
    const originatingPage = localStorage.getItem('originatingPage');

    // If no originating page exists, this isn't a reference context
    if (!originatingPage) {
        return false;
    }

    // Check if we've navigated back to the originating page by some other means
    const currentUrl = window.location.href;
    if (originatingPage === currentUrl) {
        // Clear the originating page data since we're back at the source
        localStorage.removeItem('originatingPage');
        setState('originatingPage', null);
        setState('isReferencePage', false);
        return false;
    }

    // Update state
    setState('isReferencePage', true);
    setState('originatingPage', originatingPage);

    return true;
};

/**
 * Initializes reference page functionality
 */
export const initializeReferencePage = () => {
    // Check if we should display a return button (based on localStorage)
    const shouldShowReturnButton = checkIfReferencePage();

    if (shouldShowReturnButton) {
        displayReturnButton();
    }
};

/**
 * Creates and displays the return button on reference pages
 */
export const displayReturnButton = () => {
    // Get originating page from state
    const originatingPage = getState('originatingPage');
    if (!originatingPage) {
        return;
    }

    // Check if return button already exists
    if (document.querySelector('.return-button')) {
        return;
    }

    // Create return button with translated text
    const returnButton = document.createElement('button');

    // Get translation if available, otherwise use default text
    const translations = getState('translations') || {};
    const buttonText = translations['return-button'] || 'Regresar'; // Spanish default

    // Add arrow icon before text
    returnButton.innerHTML = `<i class="fas fa-arrow-left mr-1"></i> ${buttonText}`;

    // Apply styles to make it appear in the top right
    returnButton.classList.add(
        'return-button',
        'fixed',
        'top-4',  // Position from top
        'right-20', // Position from right (leave space for accessibility button)
        'z-50',
        'inline-flex',
        'items-center',
        'px-3',
        'py-1.5',
        'bg-purple-600',
        'text-white',
        'text-sm',
        'rounded-lg',
        'shadow-md',
        'hover:bg-purple-700',
        'focus:outline-none',
        'focus:ring-2',
        'focus:ring-purple-500',
        'focus:ring-opacity-50'
    );

    returnButton.setAttribute('aria-label', buttonText);
    returnButton.setAttribute('role', 'button');
    returnButton.setAttribute('tabindex', '0'); // Make it focusable for keyboard navigation
    returnButton.setAttribute('aria-live', 'polite'); // For screen readers
    returnButton.setAttribute('aria-pressed', 'false'); // For screen readers

    // Add click event to return to originating page
    returnButton.addEventListener('click', () => {

        // Clear the originating page from localStorage and state
        localStorage.removeItem('originatingPage');
        setState('originatingPage', null);
        setState('isReferencePage', false);

        // Cache interface elements before navigating
        cacheInterfaceElements();

        // Add fade-out animation
        const mainContent = document.querySelector('body > .container');
        if (mainContent) {
            mainContent.classList.add("opacity-0");
        }

        // Navigate back to originating page
        setTimeout(() => {
            window.location.href = originatingPage;
        }, 150);
    });

    // Add the button directly to the body
    document.body.appendChild(returnButton);
};

/**
 * Sets the visibility of the autoplay container.
 * @param {boolean} enabled - Whether to show the container.
 */
export const setAutoplayContainerVisibility = (enabled) => {
    const autoplayContainer = document.getElementById('autoplay-container');
    if (autoplayContainer) {
        autoplayContainer.classList.toggle('hidden', !enabled);
    }
};

/**
 * Sets the visibility of the describe images container.
 * @param {boolean} enabled - Whether to show the container.
 */
export const setDescribeImagesContainerVisibility = (enabled) => {
    const describeImagesContainer = document.getElementById('describe-images-container');
    if (describeImagesContainer) {
        describeImagesContainer.classList.toggle('hidden', !enabled);
    }
};

/**
 * Updates the visibility of the TTS options container based on feature state.
 * @param {boolean} show - Whether to show the container.
 */
export const updateTtsOptionsContainerVisibility = (show) => {
    const ttsOptionsContainer = document.getElementById('tts-options-container');
    if (!ttsOptionsContainer) return;

    if (show && (isFeatureEnabled('autoplay') || isFeatureEnabled('describeImages'))) {
        ttsOptionsContainer.classList.remove('hidden');
    } else {
        ttsOptionsContainer.classList.add('hidden');
    }
};

/**
 * Sets the visibility of the ELI5 container.
 * @param {boolean} enabled - Whether to show the container.
 */
export const setEli5ContainerVisibility = (enabled) => {
    const eli5Container = document.getElementById('eli5-container');
    if (eli5Container) {
        eli5Container.classList.toggle('hidden', !enabled);
    }
};

/**
 * Highlights a DOM element for audio playback.
 * @param {HTMLElement} element - The element to highlight.
 */
export const highlightElement = (element) => {
    element?.classList.add(
        'outline',
        'outline-blue-300',
        'outline-2',
        'bg-blue-100',
        'bg-opacity-30',
        'text-black',
        'rounded-lg'
    );
};

/**
 * Removes highlight from a DOM element.
 * @param {HTMLElement} element - The element to unhighlight.
 */
export const unhighlightElement = (element) => {
    element?.classList.remove(
        'outline',
        'outline-blue-300',
        'bg-opacity-30',
        'outline-2',
        'bg-blue-100',
        'text-black'
    );

};

/**
 * Removes highlight from all elements.
 */
export const unhighlightAllElements = () => {
    document.querySelectorAll('.bg-blue-100').forEach(unhighlightElement);
};

