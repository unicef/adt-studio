import { state, setState } from '../state.js';
import { playActivitySound } from '../audio.js';
import { updateSubmitButtonAndToast } from '../utils.js';
import { translateText } from '../translations.js';
import { ActivityTypes } from '../utils.js';
import { executeMail } from './send-email.js';

const applyCardStyling = (card, isInDropzone = false) => {
    // Basic styling for all cards - now with scale effect for all cards
    card.classList.add("hover:bg-yellow-300", "hover:scale-105", "transition-transform", "duration-200");

    // Additional styling only for cards in dropzones
    if (isInDropzone) {
        card.classList.add("placed-in-dropzone");
        card.classList.add("hover:shadow-md");
        card.setAttribute("title", translateText("click-to-remove"));
    }
};

export const prepareMatching = (section) => {
    setupWordButtons(section);
    setupDropzones(section);
    setupDragListeners();
};

const setupWordButtons = (section) => {
    const wordButtons = section.querySelectorAll(".activity-item");
    wordButtons.forEach((button) => {
        button.addEventListener("click", () => selectWord(button));
        button.addEventListener("dragstart", (event) => drag(event));
        button.addEventListener("keydown", (event) => handleWordButtonKeydown(event, button));
        button.setAttribute("tabindex", "0");
        button.style.cursor = "pointer";

        // Apply card styling (which now includes scale effect)
        applyCardStyling(button);
    });
};

const setupDropzones = (section) => {
    const dropzones = section.querySelectorAll(".dropzone");
    dropzones.forEach((dropzone) => {
        dropzone.addEventListener("click", () => dropWord(dropzone.id));
        dropzone.addEventListener("drop", (event) => drop(event));
        dropzone.addEventListener("dragover", (event) => allowDrop(event));
        dropzone.addEventListener("keydown", (event) => handleDropzoneKeydown(event, dropzone));
        dropzone.setAttribute("tabindex", "0");
        dropzone.style.cursor = "pointer";
    });
};

const setupDragListeners = () => {
    const activityItems = document.querySelectorAll(".activity-item");
    activityItems.forEach(item => {
        item.addEventListener("click", (event) => {
            const dropzone = event.target.closest(".dropzone");
            if (dropzone) {
                // If card is already in a dropzone, remove it and return to original position
                returnCardToOriginalPosition(event.target);

                // Also clear the localStorage entry for this card
                removeDropzoneStateForWord(event.target.getAttribute("data-activity-item"));
            } else {
                // Regular selection behavior for cards not in dropzones
                selectWord(event.target);
            }
        });

        // Update keydown handler for accessibility as well
        item.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                const dropzone = event.target.closest(".dropzone");
                if (dropzone) {
                    // Remove card on Enter/Space key if already in a dropzone
                    returnCardToOriginalPosition(event.target);
                    removeDropzoneStateForWord(event.target.getAttribute("data-activity-item"));
                } else {
                    selectWord(event.target);
                }
            }
        });
    });
};

const handleWordButtonKeydown = (event, button) => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectWord(button);
    }
};

const handleDropzoneKeydown = (event, dropzone) => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        dropWord(dropzone.id);
    }
};

export const selectWord = (button) => {
    // If a word is already selected, deselect it
    if (state.selectedWord) {
        state.selectedWord.classList.remove("border-4", "border-blue-500");
    }

    // Mark the current word as selected
    button.classList.add("border-4", "border-blue-500");
    setState('selectedWord', button);
};

export const dropWord = (dropzoneId) => {
    if (!state.selectedWord) return;

    const target = document.getElementById(dropzoneId).querySelector("div[role='region']");
    const existingWord = target.querySelector(".activity-item");

    if (existingWord) {
        handleDropExchange(existingWord, state.selectedWord, target);
        // Save to localStorage
        saveDropzoneState(dropzoneId, state.selectedWord);
        state.selectedWord.classList.remove("border-4", "border-blue-500");
        setState('selectedWord', null);
        playActivitySound('drop');
        return; // Exit early
    }

    // Check if selectedWord is already in a wrapper from another dropzone
    const currentWrapper = state.selectedWord.parentElement;
    if (currentWrapper && (currentWrapper.classList.contains('relative') || currentWrapper.classList.contains('inline-block'))) {
        // Get reference to the card before removing the wrapper
        const card = state.selectedWord;

        // Remove the wrapper
        currentWrapper.parentElement.removeChild(currentWrapper);

        // Update the selectedWord reference to the card
        state.selectedWord = card;
    }

    // No need for wrapper anymore, just add the card directly to target
    target.appendChild(state.selectedWord);

    // Apply card styling for dropzone
    applyCardStyling(state.selectedWord, true);

    // Save to localStorage
    saveDropzoneState(dropzoneId, state.selectedWord);

    state.selectedWord.classList.remove("border-4", "border-blue-500");
    setState('selectedWord', null);

    // Play sound for successful placement
    playActivitySound('drop');
};

export const allowDrop = (event) => {
    event.preventDefault();
};

export const drag = (event) => {
    event.dataTransfer.setData(
        "text",
        event.target.getAttribute("data-activity-item")
    );
};

export const drop = (event) => {
    event.preventDefault();
    const data = event.dataTransfer.getData("text");
    const target = event.currentTarget.querySelector("div[role='region']");
    let wordElement = document.querySelector(`.activity-item[data-activity-item='${data}']`);
    const existingWord = target.querySelector(".activity-item");

    // Check if the dropped element is the same as the existing element in the target
    if (existingWord && existingWord === wordElement) {
        return;
    }

    if (existingWord) {
        handleDropExchange(existingWord, wordElement, target);
        // Save to localStorage
        saveDropzoneState(event.currentTarget.id, wordElement);
        return; // Exit early since handleDropExchange did all the work
    }

    // Check if wordElement is already in a wrapper from another dropzone
    const currentWrapper = wordElement.parentElement;
    if (currentWrapper && (currentWrapper.classList.contains('relative') || currentWrapper.classList.contains('inline-block'))) {
        // Get reference to the card before removing the wrapper
        const card = wordElement;

        // Remove the wrapper
        currentWrapper.parentElement.removeChild(currentWrapper);

        // Update the wordElement reference to the card
        wordElement = card;
    }

    // No need for wrapper, add card directly to target
    target.appendChild(wordElement);

    // Apply card styling for dropzone
    applyCardStyling(wordElement, true);

    // Save to localStorage
    saveDropzoneState(event.currentTarget.id, wordElement);

    // Play sound feedback
    playActivitySound('drop');
};

// Función para obtener la clave única de la actividad
const getActivityLocalStorageKey = () => {
    const activityElement = document.querySelector('[data-aria-id]');
    if (!activityElement) {
        return null;
    }

    const activity = activityElement.getAttribute('data-aria-id');
    const activityId = location.pathname
        .substring(location.pathname.lastIndexOf("/") + 1)
        .split(".")[0];

    return `${activityId}_${activity}`;
};

const saveDropzoneState = (dropzoneId, wordElement) => {
    const localStorageKey = getActivityLocalStorageKey();

    let storedData = JSON.parse(localStorage.getItem(localStorageKey)) || {};

    const wordId = wordElement.getAttribute("data-activity-item") || wordElement.getAttribute("data-id");

    const dropzone = document.getElementById(dropzoneId);


    Object.keys(storedData).forEach(zoneId => {
        storedData[zoneId] = storedData[zoneId].filter(item => item !== wordId);
        if (storedData[zoneId].length === 0) delete storedData[zoneId];
    });

    storedData[dropzoneId] = [wordId];

    localStorage.setItem(localStorageKey, JSON.stringify(storedData));
};

// Add this new function to remove a word from localStorage
const removeDropzoneStateForWord = (wordId) => {
    const localStorageKey = getActivityLocalStorageKey();
    let storedData = JSON.parse(localStorage.getItem(localStorageKey)) || {};

    // Find and remove the word from any dropzone where it exists
    Object.keys(storedData).forEach(dropzoneId => {
        storedData[dropzoneId] = storedData[dropzoneId].filter(item => item !== wordId);
        // Remove the dropzone entry if it's now empty
        if (storedData[dropzoneId].length === 0) {
            delete storedData[dropzoneId];
        }
    });

    localStorage.setItem(localStorageKey, JSON.stringify(storedData));
};

export const loadDropzoneState = () => {
    const storedDataRaw = localStorage.getItem(getActivityLocalStorageKey());
    let storedData = {};
    if (storedDataRaw) {
        try {
            storedData = JSON.parse(storedDataRaw);
        } catch (error) {
            return;
        }
    }

    Object.entries(storedData).forEach(([dropzoneId, words]) => {
        let dropzone = document.querySelector(`#${dropzoneId}`);

        if (!dropzone) {
            return;
        }

        const target = dropzone.querySelector("div[role='region']");

        words.forEach(wordId => {
            let wordElement = document.querySelector(`.activity-item[data-activity-item='${wordId}'], .activity-item[data-id='${wordId}']`);

            if (!wordElement) {
                return;
            }

            // Apply card styling for hover effect
            applyCardStyling(wordElement);

            // Check if wordElement is already in a wrapper from another dropzone
            const currentWrapper = wordElement.parentElement;
            if (currentWrapper && (currentWrapper.classList.contains('relative') || currentWrapper.classList.contains('inline-block'))) {
                // Get reference to the card before removing the wrapper
                const card = wordElement;

                // Remove the wrapper
                currentWrapper.parentElement.removeChild(currentWrapper);

                // Update the wordElement reference to the card
                wordElement = card;
            }

            if (!target.contains(wordElement)) {
                // Add card directly to target without wrapper
                target.appendChild(wordElement);

                // Apply card styling for dropzone
                applyCardStyling(wordElement, true);
            }
        });
    });
};

//  load data the localstorage
loadDropzoneState();



const handleDropExchange = (existingWord, newWordElement, target) => {
    // First, check if newWordElement is in a dropzone
    const newWordDropzone = newWordElement.closest(".dropzone");
    const isNewWordInDropzone = newWordDropzone !== null && newWordDropzone !== target.closest(".dropzone");

    if (isNewWordInDropzone) {
        // Get the parent containers for both cards
        const newWordRegion = newWordDropzone.querySelector("div[role='region']");

        // Perform the exchange directly

        // 1. Remove both cards from their current positions
        if (newWordElement.parentNode) {
            newWordElement.parentNode.removeChild(newWordElement);
        }

        if (existingWord.parentNode) {
            existingWord.parentNode.removeChild(existingWord);
        }

        // 2. Add them to their new positions
        target.appendChild(newWordElement);
        newWordRegion.appendChild(existingWord);

        // 3. Apply styling to both cards
        applyCardStyling(existingWord, true);
        applyCardStyling(newWordElement, true);

        // 4. Update localStorage for both dropzones
        const targetDropzoneId = target.closest('.dropzone').id;
        const sourceDropzoneId = newWordDropzone.id;

        // Save the new positions in localStorage
        saveDropzoneState(targetDropzoneId, newWordElement);
        saveDropzoneState(sourceDropzoneId, existingWord);

        // Play sound for successful swap
        playActivitySound('drop');
    } else {
        // Original scenario - new word is coming from outside any dropzone
        const originalContainer = document.querySelector(".original-word-list") ||
            document.querySelector(".grid:not(.dropzone)");

        // Move the existing card to the original container
        originalContainer.appendChild(existingWord);

        // Clean up classes from the card that's going back to original container
        existingWord.classList.remove(
            "placed-in-dropzone",
            "hover:scale-105",
            "transition-transform",
            "duration-200",
            "hover:shadow-md"
        );

        // Apply card styling for hover effect
        applyCardStyling(existingWord);

        // Add the new element to the target
        target.appendChild(newWordElement);

        // Apply card styling for dropzone
        applyCardStyling(newWordElement, true);

        // Save to localStorage 
        const targetDropzoneId = target.closest('.dropzone').id;
        saveDropzoneState(targetDropzoneId, newWordElement);

        // Remove the original card from any dropzone storage
        removeDropzoneStateForWord(existingWord.getAttribute("data-activity-item"));
    }
};

const returnCardToOriginalPosition = (card) => {
    // First, find the original list container
    const originalParent = document.querySelector(".original-word-list") ||
        document.querySelector(".grid:not(.dropzone)");

    if (originalParent && card) {
        // Remove Tailwind styling classes - but preserve hover and scale effects
        card.classList.remove(
            "border-4",
            "border-blue-500",
            "placed-in-dropzone",
            "hover:shadow-md"
        );

        // Make sure we don't remove these classes
        // "hover:bg-yellow-300", "hover:scale-105", "transition-transform", "duration-200"

        // Apply card styling for hover effect
        applyCardStyling(card);

        // If this card was the selected word, clear that state
        if (state.selectedWord === card) {
            setState('selectedWord', null);
        }

        // Move the card back to the original container
        originalParent.appendChild(card);

        // Play a sound effect for feedback
        playActivitySound('click');
    }
};

export const checkMatching = () => {
    let correctCount = 0;
    resetDropzones();

    const activityId = location.pathname
        .substring(location.pathname.lastIndexOf("/") + 1)
        .split(".")[0];
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

    Object.keys(correctAnswers).forEach((item) => {
        const wordElement = document.querySelector(
            `.activity-item[data-activity-item='${item}']`
        );

        if (wordElement) {
            const parentDropzone = wordElement.closest(".dropzone");
            handleDropzoneValidation(parentDropzone, item, correctAnswers[item], () => correctCount++);
        }
    });

    updateFeedback(correctCount);
};

const resetDropzones = () => {
    // Remove background colors from dropzones if any
    const dropzones = document.querySelectorAll(".dropzone");
    dropzones.forEach((dropzone) => {
        dropzone.classList.remove("bg-green-200", "bg-red-200");
    });

    // Remove all validation marks
    removeValidationIcons();

    // Reset card styles but preserve original styling
    const cards = document.querySelectorAll('.activity-item');
    cards.forEach(card => {
        // Only remove the validation-specific classes
        card.classList.remove(
            'border',
            'border-green-300',
            'border-red-300'
        );
    });
};

const removeValidationIcons = () => {
    const validationElements = document.querySelectorAll('.validation-icon, .validation-mark');
    validationElements.forEach(el => el.remove());
};

const handleDropzoneValidation = (parentDropzone, item, correctAnswer, onCorrect) => {
    if (parentDropzone) {
        const wordElement = parentDropzone.querySelector(`.activity-item[data-activity-item='${item}']`);
        const isCorrect = parentDropzone.querySelector("div[role='region']").id === correctAnswer;

        if (wordElement) {
            // Remove any existing validation icons
            const existingIcon = wordElement.querySelector('.validation-icon, .validation-mark');
            if (existingIcon) {
                existingIcon.remove();
            }

            // Don't change the background color of the card
            // Only add a subtle border to make the validation mark stand out
            if (isCorrect) {
                wordElement.classList.add('border', 'border-green-300');
                onCorrect();
            } else {
                wordElement.classList.add('border', 'border-red-300');
            }

            // Create the mark as an inline element rather than absolutely positioned
            const mark = document.createElement('span');
            mark.classList.add(
                'validation-mark',
                'ml-2',  // margin-left to give some space between text and mark
                'inline-flex',
                'align-middle',
                'font-bold'
            );

            // Style mark based on correctness
            if (isCorrect) {
                mark.textContent = '✓';
                mark.classList.add('text-green-700');
            } else {
                mark.textContent = '✗';
                mark.classList.add('text-red-700');
            }

            // Simply append the mark to the word element's content
            wordElement.appendChild(mark);
        }
    }
};

const updateFeedback = (correctCount) => {
    const feedback = document.getElementById("feedback");
    const totalItems = Object.keys(correctAnswers).length;
    const isAllCorrect = correctCount === totalItems;


    playActivitySound(isAllCorrect ? 'success' : 'error');

    if (isAllCorrect) {
        // Obtener el ID de la actividad desde la URL
        const activityId = location.pathname
            .substring(location.pathname.lastIndexOf("/") + 1)
            .split(".")[0];
        const storedActivities = localStorage.getItem("completedActivities");
        let key = activityId + "-intentos";
        let intentCount = localStorage.getItem(key);
        let completedActivities = storedActivities ? JSON.parse(storedActivities) : [];

        const namePage = localStorage.getItem("namePage");
        const timeDone = new Date().toLocaleString("es-ES");
        const newActivityId = `${activityId}-${namePage}-${intentCount}-${timeDone}`;

        // Remover cualquier entrada anterior con el mismo activityId
        completedActivities = completedActivities.filter(id => !id.startsWith(`${activityId}-`));

        // Agregar la nueva entrada actualizada
        completedActivities.push(newActivityId);

        // Guardar en localStorage
        localStorage.setItem("completedActivities", JSON.stringify(completedActivities));

        localStorage.setItem("namePage", document.querySelector("h1")?.innerText ?? "unknown_page");

        executeMail(ActivityTypes.MATCHING);
    }

    if (feedback) {
        updateFeedbackText(feedback, isAllCorrect, correctCount);
    }

    updateSubmitButtonAndToast(
        isAllCorrect,
        translateText("next-activity"),
        ActivityTypes.MATCHING
    );
};

const updateFeedbackText = (feedback, isAllCorrect, correctCount) => {
    if (isAllCorrect) {
        feedback.textContent = translateText("matching-correct-answers");
        feedback.classList.remove("text-red-500");
        feedback.classList.add("text-green-500");
    } else {
        feedback.textContent = translateText("matching-correct-answers-count", {
            correctCount: correctCount,
        });
        feedback.classList.remove("text-green-500");
        feedback.classList.add("text-red-500");
    }
};

export const resetActivity = () => {
    // Get original container to return all cards to
    const originalContainer = document.querySelector(".original-word-list") ||
        document.querySelector(".grid:not(.dropzone)");

    if (!originalContainer) return;

    // Find all cards in dropzones
    const cardsInDropzones = document.querySelectorAll(".dropzone .activity-item");

    // Return each card to the original container
    cardsInDropzones.forEach(card => {
        // Remove dropzone-specific classes
        card.classList.remove(
            "border-4",
            "border-blue-500",
            "placed-in-dropzone",
            "hover:shadow-md"
        );

        // Re-apply basic card styling
        applyCardStyling(card);

        // Move the card back to the original container
        originalContainer.appendChild(card);
    });

    // Reset dropzone styling and remove validation icons
    resetDropzones();

    // Clear any selected state
    if (state.selectedWord) {
        state.selectedWord.classList.remove("border-4", "border-blue-500");
        setState('selectedWord', null);
    }

    // Clear local storage for this activity
    const localStorageKey = getActivityLocalStorageKey();
    localStorage.removeItem(localStorageKey);  // Replace setItem with removeItem

    // Reset feedback message if present
    const feedback = document.getElementById("feedback");
    if (feedback) {
        feedback.textContent = "";
        feedback.classList.remove("text-red-500", "text-green-500");
    }

    // Play sound effect
    playActivitySound('click');
};