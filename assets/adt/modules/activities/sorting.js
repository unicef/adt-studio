import { state, setState } from '../state.js';
import { playActivitySound } from '../audio.js';
import { ActivityTypes, updateSubmitButtonAndToast } from '../utils.js';
import { announceToScreenReader } from '../ui_utils.js';
import { translateText } from '../translations.js';
import { executeMail } from './send-email.js';
import { updateResetButtonVisibility } from '../../activity.js';

/**
 * Helper function to strip emojis and clean up whitespace from text for accessibility
 * @param {string} text - The text to clean
 * @returns {string} - Clean text without emojis and normalized whitespace
 */
const stripEmojisAndCleanText = (text) => {
  return text
    .trim()
    .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const prepareSorting = (section) => {
  setupWordCards(section);
  setupCategories(section);
  setupFeedbackReset(section);

  // Load saved data only after setup is complete
  setTimeout(() => {
    loadFromLocalStorage();
  }, 0);
};

const setupWordCards = (section) => {
  const wordCards = section.querySelectorAll(".word-card");
  wordCards.forEach((wordCard) => {
    addWordCardListeners(wordCard, section);
    styleWordCard(wordCard);
  });
};

// this is for take de id for localstorage
const activity = () => {
  const activityElement = document.querySelector('[data-aria-id]');
  if (!activityElement) {
    return
  }

  const activity = activityElement.getAttribute('data-aria-id');

  const activityId = location.pathname
    .substring(location.pathname.lastIndexOf("/") + 1)
    .split(".")[0];

  const localStorageKey = `${activityId}_${activity}`;
  if (document.getElementsByTagName("h1").length < 0) {
    localStorage.setItem("namePage", document.getElementsByTagName("h2")[0].innerText);
  } else if (document.getElementsByTagName("h1").length > 0) {
    localStorage.setItem("namePage", document.querySelector("h1")?.innerText ?? "unknown_page");
  }


  return localStorageKey
}

// Helper function to get all focusable elements in the correct order
const getAllFocusableElements = (section) => {
  const availableWordCards = Array.from(section.querySelectorAll('.word-card:not(.bg-gray-300):not(.placed-word)'))
    .filter(card => !card.closest('.category')); // Exclude cards that are inside categories
  const placedWordCards = Array.from(section.querySelectorAll('.placed-word'));
  const categories = Array.from(section.querySelectorAll('section .category'));
  const submitButton = document.getElementById('submit-button');
  const resetButton = document.getElementById('reset-button');

  // Build the complete list of focusable elements in logical tab order
  let focusableElements = [];

  // First add available word cards
  focusableElements.push(...availableWordCards);

  // Then add categories and placed word cards
  focusableElements.push(...categories);
  focusableElements.push(...placedWordCards);

  // Add submit and reset buttons only if they exist
  if (submitButton) {
    focusableElements.push(submitButton);
  }
  if (resetButton) {
    focusableElements.push(resetButton);
  }

  return focusableElements;
};

const addWordCardListeners = (wordCard, section) => {
  wordCard.addEventListener("click", () => selectWordSort(wordCard));
  wordCard.addEventListener('dragstart', handleDragStart);
  wordCard.addEventListener("mousedown", () => highlightBoxes(true));
  wordCard.addEventListener("mouseup", () => highlightBoxes(false));
  wordCard.addEventListener("keydown", (event) => handleWordCardKeydown(event, wordCard, section));

  // Make images inside cards not draggable
  const cardImage = wordCard.querySelector('img');
  if (cardImage) {
    cardImage.setAttribute('draggable', 'false');
    cardImage.style.pointerEvents = 'none';
  }
}

const handleWordCardKeydown = (event, wordCard, section) => {
  // Prevent arrow keys from triggering page navigation but allow natural tab order
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' ||
    event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.stopPropagation();
    event.preventDefault();

    // Handle arrow navigation within word cards only when focusing word cards
    handleWordCardArrowNavigation(event.key, wordCard, section);
    return;
  }

  // Allow natural tab navigation in most cases
  if (event.key === 'Tab') {
    // Only prevent default and control tab order when in category navigation mode
    if (state.inCategoryNavigation) {
      event.preventDefault();

      // Exit category navigation mode if shift+tab is pressed
      if (event.shiftKey) {
        state.inCategoryNavigation = false;
        resetSelectionState();
        return; // Let browser handle the tab navigation naturally
      }

      // Otherwise, handle custom tab navigation within categories
      const allFocusableElements = getAllFocusableElements(section);

      if (allFocusableElements.length > 0) {
        const currentIndex = allFocusableElements.indexOf(wordCard);
        const nextIndex = (currentIndex + 1) % allFocusableElements.length;
        allFocusableElements[nextIndex].focus();
      }
      return;
    }
    // Otherwise, let the browser handle natural tab order
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectWordSort(wordCard);
  }
};

// New function to handle arrow navigation through all elements
const handleAllElementsArrowNavigation = (key, currentElement, section) => {
  const allFocusableElements = getAllFocusableElements(section);

  if (allFocusableElements.length <= 1) return;

  const currentIndex = allFocusableElements.indexOf(currentElement);
  let nextIndex;

  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + allFocusableElements.length) % allFocusableElements.length;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % allFocusableElements.length;
      break;
  }

  if (allFocusableElements[nextIndex]) {
    allFocusableElements[nextIndex].focus();
  }
};

const styleWordCard = (wordCard) => {
  wordCard.classList.add(
    "cursor-pointer",
    "transition",
    "duration-300",
    "hover:bg-yellow-300",
    "transform",
    "hover:scale-105"
  );
};

const setupCategories = (section) => {
  const categories = section.querySelectorAll('section .category');
  categories.forEach((category) => {
    category.setAttribute('tabindex', '0');
    category.setAttribute('role', 'listbox');
    category.addEventListener('dragover', allowDrop);
    category.addEventListener('drop', (event) => dropSort(event, section));

    // Find the preceding heading to label the category
    const heading = category.previousElementSibling;
    if (heading && heading.tagName.toLowerCase().startsWith('h')) {
      // Ensure heading has an ID
      if (!heading.id) {
        heading.id = `category-label-${category.getAttribute('data-activity-category')}`;
      }
      category.setAttribute('aria-labelledby', heading.id);
    }

    // Add focus event to announce category contents for screen readers
    category.addEventListener('focus', () => {
      // Only announce contents if not in word placement mode
      if (!state.currentWord) {
        const categoryName = category.getAttribute('aria-label') || category.getAttribute('data-activity-category');
        const placedCards = category.querySelectorAll('.placed-word');
        const placedCount = placedCards.length;

        let announcement = '';

        if (placedCount === 0) {
          announcement = `Categoría: ${categoryName}. No hay palabras colocadas aquí.`;
        } else {
          // Build a list of placed card names
          const cardNames = Array.from(placedCards).map(card => card.textContent.trim());

          announcement = `Categoría: ${categoryName}. Contiene ${placedCount} palabra${placedCount !== 1 ? 's' : ''}: ${cardNames.join(', ')}.`;
        }

        announceToScreenReader(announcement);
      }
    });

    category.addEventListener('click', (e) => {
      // Add this logic to handle placing a selected word on category click
      if (state.currentWord) {
        // Prevent placing if the click target is already a placed word within the category
        if (e.target.closest('.placed-word')) {
          e.stopPropagation();
          return; // Don't place a new word if clicking on an existing placed one
        }
        // If a word is selected, place it in this category
        placeWord(category.getAttribute('data-activity-category'), section);
      }
    });

    category.addEventListener('keydown', (e) => {
      // Prevent arrow keys from triggering page navigation
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.stopPropagation();
        e.preventDefault();

        // Handle arrow navigation within categories when in category mode
        handleCategoryArrowNavigation(e.key, category, section);
        return;
      }

      if (e.key === 'Tab') {
        // Confine Tab navigation within categories only when a word is selected and in category navigation mode
        if (state.currentWord && state.inCategoryNavigation) {
          e.preventDefault();

          // Exit category navigation mode if shift+tab is pressed
          if (e.shiftKey) {
            state.inCategoryNavigation = false;
            resetSelectionState();
            highlightBoxes(false);

            // Find the last placed word card or first word card to focus
            const wordCards = document.querySelectorAll('section .word-card:not(.bg-gray-300):not(.placed-word)');
            if (wordCards.length > 0) {
              wordCards[0].focus();
            }
            return;
          }

          // Otherwise continue with category tab navigation
          const allCategories = Array.from(section.querySelectorAll('section .category'));
          if (allCategories.length > 0) {
            const currentIndex = allCategories.indexOf(category);
            const nextIndex = (currentIndex + 1) % allCategories.length;
            allCategories[nextIndex].focus();
          }
        } else {
          // Allow natural tab navigation when not in category navigation mode
          return;
        }
        return;
      }

      if (state.currentWord && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const categoryName = category.getAttribute('data-activity-category');
        placeWord(categoryName, section);
      }
    });
  });
};

// Add a new function to handle arrow navigation
const handleArrowNavigation = (key, currentElement) => {
  // Get all interactive elements in the activity
  const allElements = [
    ...document.querySelectorAll('.word-card:not(.bg-gray-300)'), // Available word cards
    ...document.querySelectorAll('.category'),                    // Category dropzones
    ...document.querySelectorAll('.placed-word')                  // Placed word cards
  ];

  // Get the current element's position
  const rect = currentElement.getBoundingClientRect();
  const currentCenter = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };

  // Find the next element based on arrow direction
  let closestElement = null;
  let minDistance = Infinity;

  allElements.forEach(element => {
    if (element === currentElement) return; // Skip the current element

    const elementRect = element.getBoundingClientRect();
    const elementCenter = {
      x: elementRect.left + elementRect.width / 2,
      y: elementRect.top + elementRect.height / 2
    };

    // Calculate distance and direction
    const deltaX = elementCenter.x - currentCenter.x;
    const deltaY = elementCenter.y - currentCenter.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Check if the element is in the correct direction
    let isInDirection = false;

    switch (key) {
      case 'ArrowLeft':
        isInDirection = deltaX < -10; // Element is to the left
        break;
      case 'ArrowRight':
        isInDirection = deltaX > 10;  // Element is to the right
        break;
      case 'ArrowUp':
        isInDirection = deltaY < -10; // Element is above
        break;
      case 'ArrowDown':
        isInDirection = deltaY > 10;  // Element is below
        break;
    }

    // If in the right direction and closer than current closest
    if (isInDirection && distance < minDistance) {
      minDistance = distance;
      closestElement = element;
    }
  });

  // Focus the closest element if found
  if (closestElement) {
    closestElement.focus();
  }
};

const setupFeedbackReset = () => {
  const feedback = document.querySelector("#feedback");
  if (feedback) {
    feedback.addEventListener("click", resetActivity);
  }
};

export const resetActivity = () => {
  // Remove all placed word cards
  const placedWordCards = document.querySelectorAll('section .placed-word');
  placedWordCards.forEach((placedWordCard) => {
    placedWordCard.remove();
  });

  // Restore original word cards
  const originalWordCards = document.querySelectorAll('section .word-card');
  originalWordCards.forEach((wordCard) => {
    restoreOriginalCard(wordCard);
  });

  // Reset state variables
  setState('currentWord', "");
  if (state) state.inCategoryNavigation = false;

  // Remove any visual feedback
  const feedbackElement = document.getElementById("feedback");
  if (feedbackElement) {
    feedbackElement.textContent = "";
    feedbackElement.classList.remove("text-red-500", "text-green-500");
  }

  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = "";
    toast.classList.add("hidden");
    toast.classList.remove("bg-red-200", "text-red-700", "bg-green-200", "text-green-700");
  }

  // Reset categories' visual state
  highlightBoxes(false);

  // Clear localStorage for this activity
  clearSortingLocalStorage();

  // Try to play reset sound if audio module is loaded
  try {
    if (typeof playActivitySound === 'function') {
      playActivitySound('reset');
    }
  } catch (error) {
    console.warn("Could not play reset sound:", error);
  }
};

// New function to clear localStorage data for sorting activities
const clearSortingLocalStorage = () => {
  try {
    const activityId = location.pathname
      .substring(location.pathname.lastIndexOf("/") + 1)
      .split(".")[0];

    // Get all localStorage keys for this activity
    const localStorageKeys = Object.keys(localStorage).filter(key =>
      key.startsWith(`${activityId}_`)
    );

    // Remove all matching localStorage items
    localStorageKeys.forEach(key => {
      localStorage.removeItem(key);
    });

    // Also try to remove the activity-specific item
    const activityKey = activity();
    if (activityKey) {
      localStorage.removeItem(activityKey);
    }
  } catch (error) {
    console.error("Error clearing sorting localStorage:", error);
  }
};

export const handleDragStart = (event) => {
  const wordCard = event.target.closest('.word-card');
  if (!wordCard) return;

  if (wordCard.classList.contains('bg-gray-300')) {
    event.preventDefault();
    return;
  }

  event.dataTransfer.setData('text', wordCard.getAttribute('data-activity-item'));
  wordCard.classList.add('selected');

  if (event.dataTransfer.setDragImage) {
    event.dataTransfer.setDragImage(wordCard, 0, 0);
  }

  highlightBoxes(true);
};

export const highlightBoxes = (state) => {
  const categories = document.querySelectorAll("section .category");
  categories.forEach((category) => {
    if (state) {
      category.classList.add("bg-blue-100", "border-blue-400");
    } else {
      category.classList.remove("bg-blue-100", "border-blue-400");
    }
  });
};

export const selectWordSort = (wordCard) => {
  // Check if this is a placed word card that should be removed
  if (wordCard.classList.contains("placed-word")) {
    removeWord(wordCard);
    return;
  }

  if (wordCard.classList.contains("bg-gray-300")) {
    // This is a disabled original card, find its placed counterpart and remove it
    const placedWordCard = document.querySelector(`.placed-word[data-activity-item="${wordCard.getAttribute('data-activity-item')}"]`);
    if (placedWordCard) {
      removeWord(placedWordCard);
    }
    return;
  }

  // Remove selection from all other word cards
  document.querySelectorAll("section .word-card")
    .forEach((card) => card.classList.remove("border-blue-700"));

  wordCard.classList.remove("border-gray-300");
  wordCard.classList.add("border-blue-700", "border-2", "box-border");

  setState('currentWord', wordCard.getAttribute("data-activity-item"));
  // Enable category navigation mode and focus first category
  state.inCategoryNavigation = true;
  const firstCategory = document.querySelector('section .category');
  if (firstCategory) {
    firstCategory.focus();

    // Get number of items in this category
    const itemCount = firstCategory.querySelector('.word-list')?.children.length || 0;
    const categoryName = firstCategory.getAttribute('aria-label') || firstCategory.getAttribute('data-activity-category');

    // Enhanced announcement with more context
    let announcement = `Seleccionado: ${wordCard.textContent.trim()}. `;
    announcement += `Ahora enfocado en categoría: ${categoryName}. `;

    // Add information about what's already in the category
    if (itemCount === 0) {
      announcement += 'Esta categoría está vacía. ';
    } else {
      const placedCards = firstCategory.querySelectorAll('.placed-word');
      const cardNames = Array.from(placedCards).map(card => card.textContent.trim());
      announcement += `Ya contiene ${itemCount} palabra${itemCount !== 1 ? 's' : ''}: ${cardNames.join(', ')}. `;
    }

    announcement += 'Presione Enter para colocar aquí, o use las flechas para moverse entre categorías.';

    announceToScreenReader(announcement);
  }
  highlightBoxes(true);
};

const restoreOriginalCard = (wordCard) => {
  wordCard.classList.remove(
    "bg-gray-300",
    "cursor-not-allowed",
    "text-gray-400",
    "hover:bg-gray-300",
    "hover:scale-100"
  );
  wordCard.style.border = "";
  wordCard.classList.add("cursor-pointer", "transition", "duration-300", "hover:bg-yellow-300", "transform", "hover:scale-105");
  wordCard.addEventListener("click", () => selectWordSort(wordCard));
};

const removeWord = (listItem) => {

  const placedItemId = listItem.getAttribute('data-activity-item');

  const parentCategory = listItem.closest('[data-activity-category]');
  const categoryName = parentCategory.getAttribute('data-activity-category');

  const savedData = JSON.parse(localStorage.getItem('wordPlacement')) || {};
  if (savedData[categoryName]) {
    savedData[categoryName] = savedData[categoryName].filter(word => word !== placedItemId);
    if (savedData[categoryName].length === 0) {
      delete savedData[categoryName];
    }
    localStorage.setItem('wordPlacement', JSON.stringify(savedData));
  }

  let wordCard = document.querySelector(`section .word-card[data-activity-item="${placedItemId}"]`);

  if (wordCard) {
    const newWordCard = wordCard.cloneNode(true);
    wordCard.parentNode.replaceChild(newWordCard, wordCard);

    newWordCard.classList.remove(
      "bg-gray-300",
      "cursor-not-allowed",
      "text-gray-400",
      "hover:bg-gray-300",
      "hover:scale-100"
    );

    newWordCard.classList.add(
      "cursor-pointer",
      "transition",
      "duration-300",
      "hover:bg-yellow-300",
      "transform",
      "hover:scale-105"
    );

    newWordCard.style.border = "";
    newWordCard.setAttribute('draggable', 'true');

    // Get the section for this activity
    const section = document.querySelector('section[data-section-type="activity_sorting"]');
    addWordCardListeners(newWordCard, section);

    // Focus on the restored word card after removal
    setTimeout(() => {
      newWordCard.focus();
      announceToScreenReader(`${newWordCard.textContent.trim()} has been returned to available options.`);
    }, 100);

    saveToLocalStorage();
    playActivitySound('reset');
  } else {
    console.error(`Could not find original card with id: ${placedItemId}`);
  }
  listItem.remove();
};

export const placeWord = (category) => {
  if (!state.currentWord) {
    return;
  }

  playActivitySound('drop');

  const categoryDiv = document.querySelector(
    `div[data-activity-category="${category}"]`
  );
  const listElement = categoryDiv?.querySelector("section .word-list");

  if (!listElement) {
    console.error(`Category "${category}" not found or no word list available.`);
    return;
  }

  const wordCard = document.querySelector(
    `.word-card[data-activity-item="${state.currentWord}"]`
  );
  if (!wordCard) {
    console.error(`Word card for "${state.currentWord}" not found.`);
    return;
  }

  // Place the word in the category
  const placedWordCard = handleWordPlacement(wordCard, listElement);

  // Important: Reset the selection state immediately to prevent duplication
  const currentWordText = wordCard.textContent.trim();
  const categoryName = categoryDiv.getAttribute('aria-label') || categoryDiv.getAttribute('data-activity-category');
  resetSelectionState();

  saveToLocalStorage();

  // Enhanced focus management after placement
  const section = document.querySelector('section[data-section-type="activity_sorting"]');

  // Give the DOM time to update and use a more specific selector for unplaced cards
  setTimeout(() => {
    // More specific query to find genuinely available word cards
    const remainingWordCards = Array.from(document.querySelectorAll('section .word-card:not(.bg-gray-300):not(.placed-word)'))
      .filter(card => !card.closest('.category')); // Exclude cards that are inside a category container

    // Count how many words are now in the category
    const categoryList = listElement || categoryDiv.querySelector(".word-list");
    const wordsInCategory = categoryList ? categoryList.children.length : 0;

    // Build the announcement message
    let announcement = '';

    // First announce the placement
    announcement += `${currentWordText} colocado en ${categoryName}. `;

    // Add category content information
    if (wordsInCategory === 1) {
      announcement += `Esta es la primera palabra en esta categoría. `;
    } else {
      announcement += `Hay ${wordsInCategory} palabras en esta categoría. `;
    }

    // Check if this was the last word being placed
    if (remainingWordCards.length === 0) {
      // All words placed - focus should go directly to submit button if available
      const submitButton = document.getElementById('submit-button');
      if (submitButton) {
        submitButton.focus();
        announcement += "Todas las palabras han sido colocadas. Ahora está enfocado el botón de enviar. Presione Enter para enviar sus respuestas.";
        announceToScreenReader(announcement);
      } else {
        announcement += "Todas las palabras han sido colocadas. Puede enviar sus respuestas ahora.";
        announceToScreenReader(announcement);
      }
    } else {
      // Still have words to place - focus on next available word card
      const nextWordCard = remainingWordCards[0];
      nextWordCard.focus();

      // Add information about what's next
      announcement += `Ahora está enfocado en "${nextWordCard.textContent.trim()}", que es la siguiente palabra disponible.`;
      announceToScreenReader(announcement);
    }
  }, 50); // Short delay to ensure DOM has updated
};

// Function to add a screen-reader-only "next option" button
const addNextOptionButton = (placedWordCard, nextWordCard) => {
  // Get the category container
  const categoryContainer = placedWordCard.closest('.category');
  if (!categoryContainer) return;

  // Check if we already have a "next option" button in this category
  const existingButton = categoryContainer.querySelector('.next-option-button');
  if (existingButton) {
    existingButton.remove(); // Remove any existing button before adding a new one
  }

  // Remove any existing "next option" buttons from other categories
  document.querySelectorAll('.next-option-button').forEach(button => {
    button.remove();
  });

  const nextButton = document.createElement('button');
  nextButton.className = 'sr-only focus:not-sr-only focus:absolute focus:z-50 bg-blue-600 text-white p-2 rounded next-option-button focus:ring-2 focus:ring-blue-300';
  nextButton.textContent = "Volver a la siguiente opción disponible";
  nextButton.setAttribute('aria-label', "Volver a la siguiente opción disponible");

  nextButton.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering parent events
    goToNextOption(nextWordCard);
  });

  nextButton.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      goToNextOption(nextWordCard);
    }
  });

  // Add as the first element inside the category container
  //placedWordCard.parentNode.insertBefore(nextButton, placedWordCard.nextSibling);

  //Check if this message is in the code.
};

const goToNextOption = (nextWordCard) => {
  // First remove all next option buttons
  document.querySelectorAll('.next-option-button').forEach(button => {
    button.remove();
  });

  nextWordCard.focus();
  setState('currentWord', nextWordCard.getAttribute('data-activity-item'));
};

const handleWordPlacement = (wordCard, listElement) => {
  const clonedWordCard = wordCard.cloneNode(true);

  // First append to DOM so we can find the parent category
  listElement.classList.add("flex", "flex-wrap");
  listElement.appendChild(clonedWordCard);

  // Now setup the card with access to parent category
  setupClonedCard(clonedWordCard);

  disableOriginalCard(wordCard);

  return clonedWordCard; // Return the placed card so we can add buttons to it
};

const setupClonedCard = (clonedCard) => {
  if (clonedCard.querySelector('img')) {
    setupImageCard(clonedCard);
  } else {
    setupTextCard(clonedCard);
  }

  // Enhanced styling for placed cards
  clonedCard.classList.add(
    'placed-word',
    'max-w-40',
    'm-2',
    'p-2',
    'cursor-pointer',
    'hover:bg-red-100',  // Hover suggests removal
    'bg-blue-50',        // Light blue background to indicate placement
    'border-2',          // More visible border
    'border-blue-300',   // Blue border to indicate successful placement
    'rounded-md',        // Rounded corners
    'shadow-sm',         // Subtle shadow
    'transition-all'     // Smooth transitions for hover effects
  );

  // Add role and aria attributes for screen readers
  clonedCard.setAttribute('draggable', 'false');
  clonedCard.setAttribute('tabindex', '0');
  clonedCard.setAttribute('role', 'option');
  clonedCard.setAttribute('aria-selected', 'false');

  // Get category name for more descriptive aria-label
  const parentCategory = clonedCard.closest('.category');
  let categoryName = '';
  if (parentCategory) {
    categoryName = parentCategory.getAttribute('aria-label') || parentCategory.getAttribute('data-activity-category');
  }

  // Enhanced aria-label with category information - strip emojis for accessibility
  const cleanWordText = stripEmojisAndCleanText(clonedCard.textContent);
  clonedCard.setAttribute('aria-label', `${cleanWordText} - colocado en la categoría: ${categoryName}. Presione Enter para quitar.`);

  clonedCard.addEventListener("click", function () {
    removeWord(this);
  });

  clonedCard.addEventListener("keydown", function (event) {
    // Allow natural tab navigation for placed words
    if (event.key === 'Tab') {
      // Exit any current category navigation mode
      if (state.inCategoryNavigation) {
        state.inCategoryNavigation = false;
        resetSelectionState();
      }
      // Let the browser handle natural tab navigation
      return;
    }

    // Handle arrow navigation for placed words
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      const section = document.querySelector('section[data-section-type="activity_sorting"]');
      handleAllElementsArrowNavigation(event.key, this, section);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation(); // Stop the event from bubbling up to the category
      removeWord(this);
    }
  });
};

const setupTextCard = (card) => {
  const textWrapper = document.createElement('div');
  textWrapper.classList.add(
    'text-wrapper',
    'flex',
    'items-center',
    'justify-center',
    'w-full'
  );

  while (card.firstChild) {
    textWrapper.appendChild(card.firstChild);
  }
  card.appendChild(textWrapper);
};

const disableOriginalCard = (wordCard) => {
  if (!wordCard.classList.contains("placed-word")) {
    wordCard.classList.add(
      "bg-gray-300",
      "cursor-not-allowed",
      "text-gray-400",
      "hover:bg-gray-300",
      "hover:scale-100"
    );
    wordCard.style.border = "none";
    wordCard.classList.remove("selected", "shadow-lg");
    wordCard.removeEventListener("click", () => selectWordSort(wordCard));
  }
};

const setupImageCard = (card) => {
  const contentContainer = document.createElement('div');
  contentContainer.classList.add(
    'content-container',
    'flex',
    'flex-col',
    'items-center',
    'w-full',
    'space-y-2'
  );

  const textWrapper = document.createElement('div');
  textWrapper.classList.add(
    'text-wrapper',
    'flex',
    'items-center',
    'justify-center'
  );

  const image = card.querySelector('img');
  const text = card.querySelector('.word-text, span:not(.validation-mark)');

  if (image) {
    image.setAttribute('draggable', 'false');
    image.style.pointerEvents = 'none';
    contentContainer.appendChild(image);
  }
  if (text) {
    textWrapper.appendChild(text);
  }
  contentContainer.appendChild(textWrapper);

  while (card.firstChild) {
    card.removeChild(card.firstChild);
  }
  card.appendChild(contentContainer);
};


const resetSelectionState = () => {
  setState('currentWord', "");
  highlightBoxes(false);
};

// Remaining sorting activity functions...
export const allowDrop = (event) => {
  event.preventDefault();
};

export const dropSort = (event) => {
  event.preventDefault();
  const data = event.dataTransfer.getData("text");
  setState('currentWord', data);
  const category = event.target.closest(".category").dataset.activityCategory;

  playActivitySound('drop');
  placeWord(category);
  highlightBoxes(false);
};


export function checkSorting() {
  const feedbackElement = document.getElementById("feedback");
  const toast = document.getElementById("toast");
  const activityId = location.pathname
    .substring(location.pathname.lastIndexOf("/") + 1)
    .split(".")[0];

  let correctCount = 0;
  let incorrectCount = 0;
  let key = activityId + "-intentos";
  let intentCount = localStorage.getItem(key);
  if (intentCount === null) {
    localStorage.setItem(key, "0");
    intentCount = 0;
  } else {
    intentCount = parseInt(intentCount, 10);
  }

  intentCount++;
  localStorage.setItem(key, intentCount.toString());

  const categories = document.querySelectorAll('section .category');

  // Process all word placements first (unchanged code)
  categories.forEach(category => {
    const categoryType = category.getAttribute('data-activity-category');
    const placedWords = category.querySelectorAll('.placed-word');

    placedWords.forEach(placedWord => {
      const wordKey = placedWord.getAttribute('data-activity-item');
      const correctCategory = correctAnswers[wordKey];

      // Remove any existing validation marks
      const existingMark = placedWord.querySelector('.validation-mark');
      if (existingMark) {
        existingMark.remove();
      }

      // Create validation mark
      const mark = document.createElement('span');
      mark.classList.add(
        'validation-mark',
        'ml-2',  // margin left for spacing
        'inline-flex',
        'items-center',
        'text-lg'
      );

      // Get the current category name for screen reader feedback
      const categoryName = category.getAttribute('aria-label') || category.getAttribute('data-activity-category');
      // Strip emojis and clean up whitespace from word text
      const wordText = stripEmojisAndCleanText(placedWord.textContent);

      if (categoryType === correctCategory) {
        placedWord.classList.remove('bg-red-100', 'border-red-300');
        placedWord.classList.add('bg-green-100', 'border-green-300', 'border');
        mark.textContent = '✓';
        mark.classList.add('text-green-700');
        correctCount++;

        // Enhanced aria-label for correct placement
        placedWord.setAttribute('aria-label',
          `${wordText} - colocado correctamente en la categoría: ${categoryName}. Presione Enter para quitar.`
        );
      } else {
        placedWord.classList.remove('bg-green-100', 'border-green-300');
        placedWord.classList.add('bg-red-100', 'border-red-300', 'border');
        mark.textContent = '✗';
        mark.classList.add('text-red-700');
        incorrectCount++;

        // Enhanced aria-label for incorrect placement - include correct category
        const correctCategoryElement = document.querySelector(`[data-activity-category="${correctCategory}"]`);
        const correctCategoryName = correctCategoryElement ?
          (correctCategoryElement.getAttribute('aria-label') || correctCategoryElement.getAttribute('data-activity-category')) :
          correctCategory;

        placedWord.setAttribute('aria-label',
          `${wordText} - colocado incorrectamente en la categoría: ${categoryName}. Debería estar en: ${correctCategoryName}. Presione Enter para quitar.`
        );
      }

      // Handle different card layouts based on content
      if (placedWord.querySelector('img')) {
        // Cards with images: Create structured layout
        let contentContainer = placedWord.querySelector('.content-container');
        if (!contentContainer) {
          contentContainer = document.createElement('div');
          contentContainer.classList.add(
            'content-container',
            'flex',
            'flex-col',
            'items-center',
            'w-full',
            'space-y-2'
          );

          // Move existing content into container
          while (placedWord.firstChild) {
            contentContainer.appendChild(placedWord.firstChild);
          }
          placedWord.appendChild(contentContainer);
        }

        // Create/update text wrapper
        let textWrapper = placedWord.querySelector('.text-wrapper');
        if (!textWrapper) {
          textWrapper = document.createElement('div');
          textWrapper.classList.add(
            'text-wrapper',
            'flex',
            'items-center',
            'justify-center'
          );

          // Move the text element into the wrapper
          const textElement = contentContainer.querySelector('.word-text, span:not(.validation-mark)');
          if (textElement) {
            textWrapper.appendChild(textElement);
          }
          contentContainer.appendChild(textWrapper);
        }

        // Add the mark to the text wrapper
        textWrapper.appendChild(mark);

      } else {
        // For text-only or text+icon cards: Simpler inline layout
        let textWrapper = placedWord.querySelector('.text-wrapper');
        if (!textWrapper) {
          textWrapper = document.createElement('div');
          textWrapper.classList.add(
            'text-wrapper',
            'flex',
            'items-center',
            'justify-center',
            'w-full'
          );

          // Move all existing content to the wrapper
          while (placedWord.firstChild) {
            textWrapper.appendChild(placedWord.firstChild);
          }
          placedWord.appendChild(textWrapper);
        }

        // Add the mark after the content
        textWrapper.appendChild(mark);
      }

      // Ensure proper spacing and layout
      placedWord.classList.add('p-2', 'rounded');

      // Add a slight delay and then announce the validation result to screen reader
      setTimeout(() => {
        if (categoryType === correctCategory) {
          announceToScreenReader(`${wordText} está correctamente colocado en ${categoryName}.`);
        } else {
          const correctCategoryElement = document.querySelector(`[data-activity-category="${correctCategory}"]`);
          const correctCategoryName = correctCategoryElement ?
            (correctCategoryElement.getAttribute('aria-label') || correctCategoryElement.getAttribute('data-activity-category')) :
            correctCategory;
          announceToScreenReader(`${wordText} está incorrectamente colocado. Debería estar en ${correctCategoryName}.`);
        }
      }, 100 * (correctCount + incorrectCount)); // Stagger announcements
    });
  });

  const totalPlacedWords = document.querySelectorAll('section .placed-word').length;
  const totalWords = Object.keys(correctAnswers).length;
  const allWordsPlaced = totalPlacedWords === totalWords;
  const allCorrect = correctCount === totalWords;

  // Handle incomplete placement case with improved toast
  if (!allWordsPlaced) {
    const message = translateText("sorting-not-complete", { cardsPlaced: totalPlacedWords, totalCards: totalWords });

    // Update feedback element
    feedbackElement.textContent = message;
    feedbackElement.classList.remove("text-green-500");
    feedbackElement.classList.add("text-red-500");

    // Use updateSubmitButtonAndToast instead
    updateSubmitButtonAndToast(
      false,
      translateText("retry"),
      ActivityTypes.SORTING,
      totalWords - totalPlacedWords, // unfilledCount represents unplaced words here
      {
        message: message,
        emoji: '🤔',
        toastType: 'warning',
        timeout: 6000,
        showCloseButton: true
      }
    );

    playActivitySound('error');

    // Add this line to update reset button visibility
    if (typeof updateResetButtonVisibility === 'function') {
      updateResetButtonVisibility();
    }

    return;
  }

  // Handle completed activity feedback with improved toast
  let feedbackMessage = translateText("sorting-results", { correctCount: correctCount, incorrectCount: incorrectCount });
  if (allCorrect) {
    // Success handling code (unchanged)
    playActivitySound('success');
    const activityId = location.pathname
      .substring(location.pathname.lastIndexOf("/") + 1)
      .split(".")[0];
    // Activity tracking code (unchanged)
    const storedActivities = localStorage.getItem("completedActivities");
    let completedActivities = storedActivities ? JSON.parse(storedActivities) : [];
    const namePage = localStorage.getItem("namePage");
    const timeDone = new Date().toLocaleString("es-ES")
    const newActivityId = `${activityId}-${namePage}-${intentCount}-${timeDone}`;

    if (!completedActivities.includes(activityId)) {
      completedActivities.push(newActivityId);
      localStorage.setItem("completedActivities", JSON.stringify(completedActivities));
    }
    feedbackMessage = translateText("sorting-correct-answer");
    executeMail(ActivityTypes.SORTING);

    // Announce overall success to screen reader
    setTimeout(() => {
      announceToScreenReader(`¡Excelente! Todas las ${totalWords} palabras están correctamente colocadas.`);
    }, 1000);
  } else {
    playActivitySound('error');
    feedbackMessage = translateText("sorting-results", { correctCount: correctCount, incorrectCount: incorrectCount });

    // Announce overall results to screen reader
    setTimeout(() => {
      announceToScreenReader(`Resultados: ${correctCount} correctas, ${incorrectCount} incorrectas. Revisa las palabras marcadas con X.`);
    }, 1000);
  }



  // Update feedback element
  feedbackElement.textContent = feedbackMessage;
  feedbackElement.classList.remove("text-red-500", "text-green-500");
  feedbackElement.classList.add(allCorrect ? "text-green-500" : "text-red-500");

  // Keep this final call to updateSubmitButtonAndToast which now handles all toast functionality
  updateSubmitButtonAndToast(
    allCorrect,
    allCorrect ? translateText("next-activity") : translateText("retry"),
    ActivityTypes.SORTING,
    0, // unfilledCount
    {
      message: feedbackMessage, // Custom message for this activity
      emoji: allCorrect ? '🎉' : '🤔',
      toastType: allCorrect ? 'success' : 'error', // Type of toast
      timeout: 6000, // Custom timeout
      showCloseButton: true // Show close button
    }
  );
}

const saveToLocalStorage = () => {

  const categories = document.querySelectorAll('[data-activity-category]');
  const data = {};

  categories.forEach(category => {
    const categoryName = category.getAttribute('data-activity-category');
    const words = [...category.querySelectorAll('.word-card')].map(word => word.dataset.activityItem);
    data[categoryName] = words;
  });

  localStorage.setItem(activity(), JSON.stringify(data));

};

// Modify loadFromLocalStorage to handle errors gracefully
const loadFromLocalStorage = () => {
  try {
    const savedDataRaw = localStorage.getItem(activity());
    if (!savedDataRaw) return;

    let savedData = {};
    try {
      savedData = JSON.parse(savedDataRaw);
    } catch (error) {
      console.error("Error parsing saved sorting data:", error);
      return;
    }

    if (!savedData || Object.keys(savedData).length === 0) return;

    Object.entries(savedData).forEach(([category, words]) => {
      const categoryDiv = document.querySelector(`div[data-activity-category="${category}"]`);
      if (!categoryDiv) return;

      if (Array.isArray(words)) {
        words.forEach(word => {
          const wordCard = document.querySelector(`.word-card[data-activity-item="${word}"]`);
          if (wordCard && state.currentWord !== word) {
            // Set current word temporarily
            const previousWord = state.currentWord;
            setState('currentWord', word);

            // Place the word silently (without sound)
            placeWordSilently(category);

            // Restore previous word
            setState('currentWord', previousWord);
          }
        });
      }
    });
  } catch (error) {
    console.error("Error loading sorting data:", error);
  }
};

// Add a silent version of placeWord that doesn't play sounds
const placeWordSilently = (category) => {
  if (!state.currentWord) return;

  const categoryDiv = document.querySelector(
    `div[data-activity-category="${category}"]`
  );
  const listElement = categoryDiv?.querySelector(".word-list");

  if (!listElement) return;

  const wordCard = document.querySelector(
    `.word-card[data-activity-item="${state.currentWord}"]`
  );
  if (!wordCard) return;

  // Place the word in the category
  const placedWordCard = handleWordPlacement(wordCard, listElement);

  // Reset selection state
  resetSelectionState();

  // Don't call saveToLocalStorage() here to prevent circular saves
};

// Add arrow navigation functions for word cards and categories
const handleWordCardArrowNavigation = (key, currentWordCard, section) => {
  // Get only available (unplaced) word cards that are not inside categories
  const availableWordCards = Array.from(section.querySelectorAll('.word-card:not(.bg-gray-300):not(.placed-word)'))
    .filter(card => !card.closest('.category')); // Exclude cards that are inside categories

  if (availableWordCards.length <= 1) return;

  const currentIndex = availableWordCards.indexOf(currentWordCard);
  let nextIndex;

  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + availableWordCards.length) % availableWordCards.length;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % availableWordCards.length;
      break;
  }

  if (availableWordCards[nextIndex]) {
    availableWordCards[nextIndex].focus();
  }
};

const handleCategoryArrowNavigation = (key, currentCategory, section) => {
  const allCategories = Array.from(section.querySelectorAll('section .category'));
  if (allCategories.length <= 1) return;

  const currentIndex = allCategories.indexOf(currentCategory);
  let nextIndex;

  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + allCategories.length) % allCategories.length;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % allCategories.length;
      break;
  }

  if (allCategories[nextIndex]) {
    const nextCategory = allCategories[nextIndex];
    nextCategory.focus();

    // If in word placement mode, provide more context about the category
    if (state.currentWord) {
      const categoryName = nextCategory.getAttribute('aria-label') || nextCategory.getAttribute('data-activity-category');
      const placedCards = nextCategory.querySelectorAll('.placed-word');
      const placedCount = placedCards.length;

      let announcement = `Categoría: ${categoryName}. `;

      // Add information about the selected word
      const selectedWordCard = document.querySelector(`.word-card[data-activity-item="${state.currentWord}"]`);
      const selectedWordText = selectedWordCard ? selectedWordCard.textContent.trim() : 'Palabra seleccionada';

      announcement += `Palabra seleccionada: ${selectedWordText}. `;

      // Add information about the category contents
      if (placedCount === 0) {
        announcement += `No hay palabras colocadas aquí. `;
      } else {
        // Add information about what's already in the category
        announcement += `Ya contiene ${placedCount} palabra${placedCount !== 1 ? 's' : ''}: `;
        const cardNames = Array.from(placedCards).map(card => card.textContent.trim());
        announcement += `${cardNames.join(', ')}. `;
      }

      announcement += 'Presione Enter para colocar la palabra aquí.';

      announceToScreenReader(announcement);
    }
  }
};