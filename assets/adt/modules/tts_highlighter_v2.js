// assets/modules/wordByWordHighlighter.js
import { state } from "./state.js";
import { stopAudio, unhighlightAllElements } from "./audio.js";
import { showGlossaryDefinition } from './interface.js';

let timecodeCache = {}; // Cache for loaded timecode files
let monitorInterval = null;
let currentListener = null;
let endedListener = null;
const TOLERANCE = 0.2; // 200ms tolerance

let subtitlePopup = null;
let lastHighlightedImage = null;

/**
 * Initializes the word-by-word highlighter and starts monitoring the current audio.
 */
export async function initializeWordByWordHighlighter() {
  startMonitoring();
}

/**
 * Loads the timecode data for a specific element ID from individual JSON files.
 * @param {string} elementId - The ID of the element for which to load timecodes
 * @returns {Promise<Object|null>} - The timecode data or null if not found
 */
async function loadTimecodeForElement(elementId) {
  // Return from cache if already loaded
  if (timecodeCache[elementId]) {
    return timecodeCache[elementId];
  }

  // Format: timecodes/[lang]/timecode_output.json
  const timecodeJsonUrl = `./content/i18n/${state.currentLanguage}/timecode/timecode_output.json`;

  try {
    const response = await fetch(timecodeJsonUrl);
    if (!response.ok) {
      console.warn(`Timecode file not found for ${elementId}: ${response.statusText}`);
      return null;
    }

    const jsonData = await response.json();

    // Extract the actual timecode data from the nested structure
    // The file contains { "element-id": { timecode data } }
    const timecodeData = jsonData[elementId];

    if (!timecodeData) {
      console.warn(`Timecode file found but no data for ${elementId}`);
      return null;
    }

    // Store in cache
    timecodeCache[elementId] = timecodeData;

    return timecodeData;
  } catch (error) {
    console.error(`Error loading timecode for ${elementId}:`, error);
    return null;
  }
}

function startMonitoring() {
  if (monitorInterval) return;
  // Check the audio's currentTime every 50ms for more responsive updates
  monitorInterval = setInterval(checkCurrentAudio, 50);
}

function checkCurrentAudio() {
  const audio = state.currentAudio;
  if (audio && !audio._wordHighlighterAttached) {
    attachWordHighlighter(audio);
  } else if (!audio && currentListener) {
    detachCurrentListener();
    clearHighlights();
  }
}

async function attachWordHighlighter(audio) {
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
      const easyReadKey = `${dataId}_easy_read`;
      if (state.translations && state.translations.hasOwnProperty(easyReadKey)) {
        translationKey = easyReadKey;

        // Try to use the easyread key for timecode files too
        const easyReadTimecodeKey = easyReadKey;
        const fallbackTimecodeKey = dataId;

        // Check if we need to log the fallback
        const easyReadTimecode = await loadTimecodeForElement(easyReadTimecodeKey);
        if (!easyReadTimecode) {
          timecodeKey = fallbackTimecodeKey;
        } else {
          timecodeKey = easyReadTimecodeKey;
        }
      }
    }
  }

  // Load the timecode data for this element
  const timecodeData = await loadTimecodeForElement(timecodeKey);

  if (!timecodeData) {
    console.warn(`No timecode data found for ${timecodeKey}`);
    return;
  }

  const wordTimestamps = (timecodeData.timecodes && timecodeData.timecodes[1] &&
    timecodeData.timecodes[1].word_timestamps) || [];
  if (wordTimestamps.length === 0) {
    console.warn(`No word timestamps found for ${timecodeKey}`);
    return;
  }

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
    if (el !== targetElement) {
      el.querySelectorAll("span[data-word-index]").forEach(span => {
        span.classList.remove("bg-yellow-300");
        span.classList.remove("rounded-lg");
        span.classList.remove("text-black");
      });
    }
  });

  // Highlight the first word when we start
  const firstSpan = targetElement.querySelector('span[data-word-index="0"]');
  if (firstSpan) {
    targetElement.querySelectorAll("span[data-word-index]").forEach(span => {
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
    const firstSpan = targetElement.querySelector('span[data-word-index="0"]');
    if (firstSpan && audio.currentTime < wordTimestamps[0].end + TOLERANCE) {
      targetElement.querySelectorAll("span[data-word-index]").forEach(span => {
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
  document.removeEventListener("audioIndexChanged", clearHighlights); // Remove existing listener first
  document.addEventListener("audioIndexChanged", clearHighlights);

  audio._wordHighlighterAttached = true;
}

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

