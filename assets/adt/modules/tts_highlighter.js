/**
 * @module tts_highlighter
 * @description
 * Provides word-by-word highlighting for TTS audio playback, including subtitle popups for images and glossary integration.
 */
import { state } from "./state.js";
import { stopAudio } from "./audio.js";
import { unhighlightAllElements } from './ui_utils.js';
import { showGlossaryDefinition } from './interface.js';

let timecodeData = null;
let monitorInterval = null;
let currentListener = null;
let endedListener = null;
const TOLERANCE = 0.2; // 200ms tolerance

let subtitlePopup = null;
let lastHighlightedImage = null;

/**
 * Loads the timecode JSON for the current language and starts monitoring the current audio for word highlighting.
 * @async
 */
export async function initializeWordByWordHighlighter() {
  const timecodeJsonUrl = `./content/i18n/${state.currentLanguage}/timecode/timecode_output.json`;
  try {
    const response = await fetch(timecodeJsonUrl);
    if (!response.ok) {
      throw new Error(`Failed to load timecode JSON: ${response.statusText}`);
    }
    timecodeData = await response.json();
    startMonitoring();
  } catch (error) {
    console.error("Error initializing word-by-word highlighter:", error);
  }
}

/**
 * Starts monitoring the current audio for word highlighting.
 * Sets up a timer to check the audio's currentTime.
 * @private
 */
function startMonitoring() {
  if (monitorInterval) return;
  // Check the audio's currentTime every 50ms for more responsive updates
  monitorInterval = setInterval(checkCurrentAudio, 50);
}

/**
 * Checks the current audio and attaches or detaches the word highlighter as needed.
 * @private
 */
function checkCurrentAudio() {
  const audio = state.currentAudio;
  if (audio && !audio._wordHighlighterAttached) {
    attachWordHighlighter(audio);
  } else if (!audio && currentListener) {
    detachCurrentListener();
    clearHighlights();
  }
}

/**
 * Attaches the word highlighter to the current audio element.
 * Handles easy-read mode, glossary terms, and subtitle popups for images.
 * @private
 * @param {HTMLAudioElement} audio - The audio element to attach the highlighter to.
 */
function attachWordHighlighter(audio) {
  // Get the current text element (from state.audioElements and state.currentIndex).
  const audioElements = state.audioElements;
  if (!audioElements || audioElements.length === 0) return;
  const currentIndex = state.currentIndex;
  if (currentIndex < 0 || currentIndex >= audioElements.length) return;
  const { element, id: dataId } = audioElements[currentIndex];

  // Get the translation key with proper easy-read handling
  let translationKey = dataId;
  let timecodeKey = dataId;

  if (state.easyReadMode) {
    // Check if element is a header
    const isHeader = element.tagName.toLowerCase().match(/^h[1-6]$/);

    // Check if element is inside excluded areas
    const wordCard = element.closest('.word-card');
    const activityItem = element.closest('[data-activity-item]');
    const navList = element.closest('.nav__list');
    const activityText = element.closest('.activity-text');
    const isExcluded = wordCard !== null || activityItem !== null ||
      navList !== null || activityText !== null;

    // Use easyread translation if not a header and not in excluded areas
    if (!isHeader && !isExcluded) {
      const easyReadKey = `easyread-${dataId}`;
      if (state.translations && state.translations.hasOwnProperty(easyReadKey)) {
        translationKey = easyReadKey;

        // FALLBACK MECHANISM: Try to use easyReadKey for timecode first
        // If that doesn't exist in timecodeData, fall back to original dataId
        timecodeKey = (timecodeData && timecodeData[easyReadKey]) ? easyReadKey : dataId;
      }
    }
  }

  if (!timecodeData || !timecodeData[timecodeKey]) return;
  const entry = timecodeData[timecodeKey];

  const wordTimestamps = (entry.timecodes && entry.timecodes[1] && entry.timecodes[1].word_timestamps) || [];
  if (wordTimestamps.length === 0) return;

  const translatedText = state.translations && state.translations[translationKey]
    ? state.translations[translationKey]
    : element.textContent;

  // Check if this is an image element - if so, create a subtitle popup
  const isImage = element.tagName.toLowerCase() === 'img';
  if (isImage) {
    createSubtitlePopup(element, translatedText);
    lastHighlightedImage = element;
  } else {
    // If we're not highlighting an image, hide any existing subtitle popup
    if (subtitlePopup) {
      hideSubtitlePopup();
    }
  }

  // Get the target element for highlighting (either the original element or the subtitle popup content)
  const targetElement = isImage ? subtitlePopup.querySelector('.subtitle-content') : element;

  // Wrap the text in spans (if not already wrapped).
  if (!targetElement.dataset.wordsWrapped) {
    wrapTextInSpans(targetElement, wordTimestamps, translatedText);
    targetElement.dataset.wordsWrapped = "true";
  }

  // Clear highlights on other text elements.
  document.querySelectorAll('[data-words-wrapped="true"]').forEach(el => {
    if (el !== element) {
      el.querySelectorAll("span[data-word-index]").forEach(span => {
        span.classList.remove("bg-yellow-300");
        span.classList.remove("rounded-lg");
        span.classList.remove("text-black");
      });
    }
  });

  // Highlight the first word when we start
  const firstSpan = element.querySelector('span[data-word-index="0"]');
  if (firstSpan) {
    element.querySelectorAll("span[data-word-index]").forEach(span => {
      span.classList.remove("bg-yellow-300");
      span.classList.remove("rounded-lg");
      span.classList.remove("text-black");
    });
    firstSpan.classList.add("bg-yellow-300");
    firstSpan.classList.add("rounded-lg");
    firstSpan.classList.add("text-black");
  }

  // Detach any existing listeners first to avoid duplicates
  detachCurrentListener();

  // Attach a timeupdate listener
  currentListener = () => updateWordHighlighting(audio, targetElement, wordTimestamps);
  audio.addEventListener("timeupdate", currentListener);

  // Add an ended listener to clear highlights when audio finishes
  endedListener = () => {
    clearHighlights();
    if (isImage && subtitlePopup) {
      hideSubtitlePopup();
    }
  };
  audio.addEventListener("ended", endedListener);

  // Also listen for play event to ensure first word gets highlighted
  audio.addEventListener("play", () => {
    const firstSpan = element.querySelector('span[data-word-index="0"]');
    if (firstSpan && audio.currentTime < wordTimestamps[0].end + TOLERANCE) {
      element.querySelectorAll("span[data-word-index]").forEach(span => {
        span.classList.remove("bg-yellow-300");
        span.classList.remove("rounded-lg");
        span.classList.remove("text-black");
      });
      firstSpan.classList.add("bg-yellow-300");
      firstSpan.classList.add("rounded-lg");
      firstSpan.classList.add("text-black");
    }
  });

  // Listen for index changes to clear highlights when moving to next item
  document.addEventListener("audioIndexChanged", clearHighlights);

  audio._wordHighlighterAttached = true;
}

/**
 * Creates a subtitle popup below an image element and displays the provided text.
 * @private
 * @param {HTMLElement} imageElement - The image element to anchor the popup to.
 * @param {string} text - The subtitle text to display.
 * @returns {HTMLElement} The created subtitle popup element.
 */
function createSubtitlePopup(imageElement, text) {

  // Remove any click outside listeners before hiding existing popup
  document.removeEventListener('click', handleClickOutside);

  // Hide any existing popup first
  if (subtitlePopup) {
    // Skip fade-out animation when directly replacing with a new popup
    if (subtitlePopup.parentNode) {
      subtitlePopup.parentNode.removeChild(subtitlePopup);
      subtitlePopup = null;
    }
  }

  // Create the popup
  subtitlePopup = document.createElement('div');
  subtitlePopup.className = 'fixed z-50 bg-white/90 backdrop-blur-sm rounded-lg border border-gray-300 shadow-lg p-3 max-w-md min-w-[280px] opacity-0 transition-opacity duration-300 ease-in-out';
  subtitlePopup.style.width = Math.min(Math.max(imageElement.offsetWidth * 1.2, 280), 500) + 'px';

  // Add content div that will hold the text with word-by-word highlighting
  const content = document.createElement('div');
  content.className = 'subtitle-content text-lg leading-relaxed';
  content.textContent = text;

  subtitlePopup.appendChild(content);
  document.body.appendChild(subtitlePopup);

  // Position it below the image
  positionSubtitlePopup(imageElement);

  // Add visible class for fade-in
  setTimeout(() => {
    subtitlePopup.classList.add('opacity-100');
  }, 10);

  // Add a listener to reposition on window resize
  window.addEventListener('resize', () => {
    if (subtitlePopup && lastHighlightedImage) {
      positionSubtitlePopup(lastHighlightedImage);
    }
  });

  // Add click outside listener
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 50);

  return subtitlePopup;
}

/**
 * Handles clicks outside the subtitle popup to hide it.
 * @private
 * @param {MouseEvent} event
 */
function handleClickOutside(event) {
  // Check if we have a popup and if the click was outside both the popup and the currently highlighted image
  if (subtitlePopup &&
    !subtitlePopup.contains(event.target) &&
    (!lastHighlightedImage || !lastHighlightedImage.contains(event.target))) {

    // If we're clicking on a different image, don't hide the popup yet
    // The createSubtitlePopup for that new image will handle it
    if (event.target.tagName.toLowerCase() === 'img' &&
      event.target.getAttribute('data-id')) {
      return;
    }

    hideSubtitlePopup();
  }
}

/**
 * Positions the subtitle popup below the given image element.
 * @private
 * @param {HTMLElement} imageElement
 */
function positionSubtitlePopup(imageElement) {
  if (!subtitlePopup) return;

  const rect = imageElement.getBoundingClientRect();

  // Position it centered below the image
  subtitlePopup.style.top = (rect.bottom + window.scrollY + 8) + 'px';
  subtitlePopup.style.left = (rect.left + window.scrollX + (rect.width - subtitlePopup.offsetWidth) / 2) + 'px';

  // Make sure it's not off-screen
  const viewportWidth = window.innerWidth;
  const popupRect = subtitlePopup.getBoundingClientRect();

  if (popupRect.right > viewportWidth) {
    subtitlePopup.style.left = (viewportWidth - popupRect.width - 8) + 'px';
  }

  if (parseFloat(subtitlePopup.style.left) < 8) {
    subtitlePopup.style.left = '8px';
  }
}

/**
 * Hides and removes the subtitle popup from the DOM.
 * @private
 */
function hideSubtitlePopup() {
  if (subtitlePopup) {
    // Remove click outside listener
    document.removeEventListener('click', handleClickOutside);

    // Fade out
    subtitlePopup.classList.add('opacity-0');

    // Remove after animation
    setTimeout(() => {
      if (subtitlePopup && subtitlePopup.parentNode) {
        subtitlePopup.parentNode.removeChild(subtitlePopup);
        subtitlePopup = null;
      }
    }, 300);
  }
  lastHighlightedImage = null;
}

/**
 * Removes all word highlights and cleans up subtitle popups.
 * @private
 */
function clearHighlights() {
  // Remove the Tailwind highlight class from all wrapped elements.
  const wrappedElements = document.querySelectorAll('[data-words-wrapped="true"]');
  wrappedElements.forEach(element => {
    element.querySelectorAll("span[data-word-index]").forEach(span => {
      span.classList.remove("bg-yellow-300");
      span.classList.remove("rounded-lg");
      span.classList.remove("text-black");
    });
  });
}

/**
 * Detaches the current audio event listeners for word highlighting.
 * @private
 */
function detachCurrentListener() {
  const audio = state.currentAudio;
  if (audio) {
    if (currentListener) {
      audio.removeEventListener("timeupdate", currentListener);
      currentListener = null;
    }
    if (endedListener) {
      audio.removeEventListener("ended", endedListener);
      endedListener = null;
    }
    audio._wordHighlighterAttached = false;
  }

  // Remove the index change listener
  document.removeEventListener("audioIndexChanged", clearHighlights);
}

/**
 * Wraps the text content of an element in <span> tags for each word, handling glossary terms.
 * Adds click listeners for glossary terms.
 * @private
 * @param {HTMLElement} element - The element whose text to wrap.
 * @param {Array} wordTimestamps - Array of word timestamp objects.
 * @param {string} translatedText - The text to use for wrapping.
 */
function wrapTextInSpans(element, wordTimestamps, translatedText) {
  const glossaryMapping = {};
  const glossaryElements = element.querySelectorAll('.glossary-term');

  // Use the provided translated text instead of element.textContent
  const originalText = translatedText || element.textContent;

  // Helper function to normalize text by removing punctuation
  const normalizeText = (text) => {
    return text.toLowerCase().trim().replace(/[.,;:!?()]/g, '');
  };

  // Build a map of all glossary terms
  glossaryElements.forEach(termElement => {
    const termText = termElement.textContent.trim();
    const normalizedText = normalizeText(termText);

    glossaryMapping[normalizedText] = {
      classes: Array.from(termElement.classList),
      role: termElement.getAttribute('role'),
      tabindex: termElement.getAttribute('tabindex'),
      text: termText, // Preserve original casing
      originalText: termText // Keep the original text with punctuation
    };
  });

  // Create a working copy of timestamps that we can modify
  const modifiedTimestamps = [...wordTimestamps];

  // Step 1: Sort glossary terms by length (longest first) to handle overlapping terms
  // This ensures "bosque tropical" is processed before "bosque"
  const sortedGlossaryTerms = Object.keys(glossaryMapping)
    .sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);

  // Step 2: Look for multi-word glossary terms and mark them
  sortedGlossaryTerms.forEach(term => {
    const words = term.split(/\s+/);

    // Find potential matches in our timestamps
    for (let i = 0; i < modifiedTimestamps.length - words.length + 1; i++) {
      // Skip if this position is already part of a glossary term
      if (modifiedTimestamps[i].isPartOfGlossaryTerm) continue;

      // Get the sequence of words at this position and normalize for comparison
      const sequence = modifiedTimestamps.slice(i, i + words.length)
        .map(ts => normalizeText(ts.text))
        .join(' ');

      // If we found a match
      if (sequence === term) {
        // Flag each word in this sequence as part of a glossary term
        for (let j = 0; j < words.length; j++) {
          modifiedTimestamps[i + j].isPartOfGlossaryTerm = true;
          modifiedTimestamps[i + j].glossaryTermIndex = i;
          modifiedTimestamps[i + j].glossaryTermLength = words.length;
          modifiedTimestamps[i + j].glossaryTerm = term;
        }
      }
    }
  });

  // Step 3: Generate HTML with special handling for glossary terms
  let html = [];
  let i = 0;
  while (i < modifiedTimestamps.length) {
    const ts = modifiedTimestamps[i];

    // If this is the start of a multi-word glossary term
    if (ts.isPartOfGlossaryTerm && ts.glossaryTermIndex === i) {
      // Get the full text of the multi-word term with original punctuation
      const termText = modifiedTimestamps
        .slice(i, i + ts.glossaryTermLength)
        .map(w => w.text)
        .join(' ');

      const termAttr = glossaryMapping[ts.glossaryTerm];
      const classList = termAttr.classes.join(' ');

      // Create a single span for the entire term
      html.push(`<span 
        data-word-index="${i}" 
        class="${classList}" 
        role="${termAttr.role || 'button'}" 
        tabindex="${termAttr.tabindex || '0'}"
        data-glossary-term="true"
      >${termText}</span>`);

      // Skip ahead past all words in this term
      i += ts.glossaryTermLength;
    }
    // Single word glossary term - check with normalized text
    else {
      // Check if this word (without punctuation) is a glossary term
      const normalizedWord = normalizeText(ts.text);

      if (glossaryMapping[normalizedWord]) {
        const termAttr = glossaryMapping[normalizedWord];
        const classList = termAttr.classes.join(' ');

        html.push(`<span 
          data-word-index="${i}" 
          class="${classList}" 
          role="${termAttr.role || 'button'}" 
          tabindex="${termAttr.tabindex || '0'}"
          data-glossary-term="true"
        >${ts.text}</span>`);
      }
      // Regular word
      else if (!ts.isPartOfGlossaryTerm) {
        html.push(`<span data-word-index="${i}">${ts.text}</span>`);
      }
      // Skip words that are part of a multi-word term but not the start
      i++;
    }
  }

  element.innerHTML = html.join(' ');

  // Add event parameter to the click handler
  element.querySelectorAll('[data-glossary-term="true"]').forEach(term => {
    term.addEventListener('click', (event) => {  // Note the event parameter here
      // Stop event propagation to prevent parent elements from receiving the click
      event.stopPropagation();
      // event.preventDefault();

      // Set a flag to prevent audio playback
      window._isGlossaryTermClick = true;

      // Stop any currently playing audio
      if (state.isPlaying || state.currentAudio) {
        stopAudio();
        unhighlightAllElements();
      }

      // Show the glossary definition popup
      showGlossaryDefinition(event);

      // Clear the flag after a short delay
      setTimeout(() => {
        window._isGlossaryTermClick = false;
      }, 100);
    });
  });
}

/**
 * Updates the highlighted word based on the current audio time.
 * @private
 * @param {HTMLAudioElement} audio - The audio element.
 * @param {HTMLElement} element - The element containing the word spans.
 * @param {Array} wordTimestamps - Array of word timestamp objects.
 */
function updateWordHighlighting(audio, element, wordTimestamps) {
  const currentTime = audio.currentTime;
  let activeIndex = -1;

  // Check if we're past the last word's end time
  const lastWord = wordTimestamps[wordTimestamps.length - 1];
  if (lastWord && currentTime > lastWord.end + TOLERANCE) {
    // We're past the last word, clear all highlights
    clearHighlights();
    return;
  }

  // Special case for before the first word
  if (currentTime < wordTimestamps[0].start) {
    activeIndex = 0;
  }
  // Special case for after the last word but still within tolerance
  else if (currentTime >= wordTimestamps[wordTimestamps.length - 1].start) {
    activeIndex = wordTimestamps.length - 1;
  }
  // Find the right word based on position between start times
  else {
    // Find the last word whose start time is before or equal to the current time
    for (let i = 0; i < wordTimestamps.length; i++) {
      if (currentTime >= wordTimestamps[i].start) {
        activeIndex = i;

        // Check if we're very close to the next word's start time
        // This helps catch small words that might be skipped
        if (i < wordTimestamps.length - 1 &&
          currentTime > wordTimestamps[i + 1].start - TOLERANCE) {
          activeIndex = i + 1;
        }

        // Check if we're past the current word's end time
        if (currentTime > wordTimestamps[i].end + TOLERANCE) {
          // If we're between words, clear highlighting
          const isInGap = i < wordTimestamps.length - 1 &&
            currentTime < wordTimestamps[i + 1].start - TOLERANCE;
          if (isInGap) {
            clearHighlights();
            return;
          }
        }
      } else {
        break;
      }
    }
  }

  // If no suitable word was found, default to the first word
  if (activeIndex === -1) {
    activeIndex = 0;
  }

  // Remove highlight from all spans.
  const spans = element.querySelectorAll("span[data-word-index]");
  spans.forEach(span => {
    span.classList.remove("bg-yellow-300");
    span.classList.remove("rounded-lg");
    span.classList.remove("text-black");
  });

  // Highlight the active word.
  const activeSpan = element.querySelector(`span[data-word-index="${activeIndex}"]`);
  if (activeSpan) {
    activeSpan.classList.add("bg-yellow-300");
    activeSpan.classList.add("rounded-lg");
    activeSpan.classList.add("text-black");
  }
}

