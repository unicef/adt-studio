import { playActivitySound } from '../audio.js';
import { updateSubmitButtonAndToast, provideFeedback, ActivityTypes } from '../utils.js';
import { loadInputState } from './open_ended.js';
import { translateText } from '../translations.js';
import { executeMail } from './send-email.js';
import { findAppropriateParentForFeedback } from './validation.js';
//import { correctAnswers } from './correct_answers.js';


export const preparefillInBlank = (section) => {
    const inputs = section.querySelectorAll('section input[type="text"]:not(#filter-input), section textarea:not(#filter-input)');
    setupInputListeners(inputs);
    loadInputState(inputs);
    return inputs;
};

const setupInputListeners = (inputs) => {
    inputs.forEach(input => {
        input.addEventListener('input', handleInputChange);
        input.addEventListener('focus', handleInputFocus);
        input.addEventListener('blur', handleInputBlur);
    });
};

export const handleInputChange = (event) => {
    const input = event.target;
    const dataActivityItem = input.getAttribute("data-activity-item");

    // Clear any existing validation feedback when the user makes changes
    clearInputValidationFeedback(input);

    // Validate the current input
    validateInput(input);
    saveInputState(input);

    // Check if this input is part of an interchangeable pair
    if (window.interchangeablePairs && window.interchangeablePairs[dataActivityItem]) {
        // Revalidate all linked inputs in the interchangeable pair
        const alternateItems = window.interchangeablePairs[dataActivityItem];
        for (const alternateItem of alternateItems) {
            const pairedInput = document.querySelector(`[data-activity-item="${alternateItem}"]`);
            if (pairedInput) {
                // Also clear validation feedback for paired inputs
                //clearInputValidationFeedback(pairedInput);
                validateInput(pairedInput);
            }
        }
    }

    // Show reset button when user starts typing (using the global function)
    if (window.updateResetButtonVisibility) {
        window.updateResetButtonVisibility(true);
    }
};

// Add a new function to clear validation feedback
export const clearInputValidationFeedback = (input) => {
    // Get the data-activity-item attribute to find related feedback elements
    const dataActivityItem = input.getAttribute("data-activity-item");
    const dataAriaId = input.getAttribute("data-aria-id");
    const inputId = input.id || '';

    // Remove validation icons by various selectors to ensure all are caught
    const selectors = [
        `.feedback-icon-for-${dataActivityItem}`,
        `.feedback-icon-for-${dataAriaId}`,
        `.feedback-icon-for-${inputId}`,
        `.feedback-icon-for-feedback`,
        `.feedback-icon-for-profanity`,
        `.feedback-icon-for-gibberish`
    ];

    // Use each selector to find and remove icons
    selectors.forEach(selector => {
        const icons = document.querySelectorAll(selector);
        icons.forEach(icon => {
            // Only remove if this icon is associated with this input
            if (icon && icon.parentNode === input.parentNode) {
                icon.remove();
            }
        });
    });

    // Also look for feedback containers that might be siblings of the flex container
    const parent = input.parentNode;
    if (parent) {
        // Check if we're in a flex container
        if (window.getComputedStyle(parent).display === 'flex') {
            // Look for feedback containers that might be siblings of the flex container
            const flexParent = parent.parentNode;
            if (flexParent) {
                const feedbackContainers = flexParent.querySelectorAll('.feedback-container');
                feedbackContainers.forEach(container => {
                    container.remove();
                });
            }
        }

        // Also remove any feedback elements inside the parent
        const feedbackElements = parent.querySelectorAll('.feedback');
        feedbackElements.forEach(el => {
            el.remove();
        });
    }

    // Reset input styling
    input.classList.remove(
        "border-green-500", "focus:border-green-500", "focus:ring-green-200",
        "border-red-500", "focus:border-red-500", "focus:ring-red-200",
        "border-orange-500", "focus:border-orange-500", "focus:ring-orange-200",
        "focus:ring"
    );

    // Reset ARIA attributes and data attributes
    input.removeAttribute("aria-invalid");
    input.removeAttribute("data-has-profanity-feedback");
    input.removeAttribute("data-has-gibberish-feedback");

    // Preserve enhanced accessibility aria-label with options list, but remove validation text
    const originalLabel = input.getAttribute("aria-label") || "";
    if (originalLabel.includes(" - ")) {
        // If the aria-label has validation text (contains " - "), remove only the validation part
        // but keep the options information
        const parts = originalLabel.split(" - ");
        if (parts[0].includes("Las opciones disponibles son:")) {
            // This is one of our enhanced labels, preserve the options info
            input.setAttribute("aria-label", parts[0]);
        } else {
            // Regular validation feedback, remove it
            input.setAttribute("aria-label", parts[0]);
        }
    }

    // Remove the right padding we added for the icon
    input.style.paddingRight = '';
}

export const handleInputFocus = (event) => {
    event.target.classList.add('border-blue-500', 'ring-2', 'ring-blue-200');
};

export const handleInputBlur = (event) => {
    event.target.classList.remove('border-blue-500', 'ring-2', 'ring-blue-200');
};

export const checkFillInTheBlank = () => {
    const inputs = document.querySelectorAll('section input[type="text"]:not(#filter-input), section textarea:not(#filter-input)');
    clearOldFeedback();

    const validationResult = validateAllInputs(inputs);

    handleValidationResult(validationResult);
};

const clearOldFeedback = () => {
    const oldFeedbacks = document.querySelectorAll(".feedback");
    oldFeedbacks.forEach(feedback => feedback.remove());
};

const validateAllInputs = (inputs) => {
    let allCorrect = true;
    let firstIncorrectInput = null;
    let unfilledCount = 0;
    inputs.forEach((input) => {
        const validation = validateSingleInput(input);
        if (!validation.isCorrect) {
            allCorrect = false;

            if (!firstIncorrectInput && !validation.isFilled) {
                firstIncorrectInput = input;
            }
        }

        if (!validation.isFilled) {
            unfilledCount++;
        }
    });

    return { allCorrect, firstIncorrectInput, unfilledCount };
};

// Fixed version of validateSingleInput function
const validateSingleInput = (input) => {
    const dataActivityItem = input.getAttribute("data-activity-item");
    const correctAnswer = correctAnswers[dataActivityItem];
    const inputValue = input.value.trim().toLowerCase();
    let isCorrect = false;
    const isFilled = inputValue !== "";

    if (correctAnswer && correctAnswer.includes('|')) {
        // Multiple correct answers separated by |
        const acceptableAnswers = correctAnswer.split('|');
        isCorrect = isFilled && acceptableAnswers.some(answer =>
            inputValue === answer.trim().toLowerCase());
    } else if (window.interchangeablePairs && window.interchangeablePairs[dataActivityItem]) {
        // This is part of an interchangeable pair
        const alternateItems = window.interchangeablePairs[dataActivityItem];
        const alternateAnswers = alternateItems.map(item => correctAnswers[item]);

        // Check against correct answer or any alternate answers
        isCorrect = (isFilled && correctAnswer && inputValue === correctAnswer.toLowerCase()) ||
            alternateAnswers.some(alt => alt && inputValue === alt.toLowerCase());

        // Check for duplicates if this field is valid
        if (isCorrect && alternateItems.length > 0) {
            // Get the paired fields
            for (const alternateItem of alternateItems) {
                const pairedInput = document.querySelector(`[data-activity-item="${alternateItem}"]`);
                if (pairedInput && pairedInput.value.trim().toLowerCase() === inputValue) {
                    // Found duplicate answer - mark as incorrect
                    isCorrect = false;
                    // Add special feedback for duplicate answers
                    provideFeedback(
                        input,
                        false,
                        "No puedes usar la misma palabra en ambos campos",
                        ActivityTypes.FILL_IN_THE_BLANK
                    );
                    return { isCorrect: false, isFilled };
                }
            }
        }
    } else {
        // Regular validation with a single correct answer
        isCorrect = isFilled &&
            correctAnswer &&
            correctAnswer.toLowerCase() === inputValue;
    }

    provideFeedback(
        input,
        isCorrect,
        correctAnswer,
        ActivityTypes.FILL_IN_THE_BLANK
    );

    if (!isCorrect) {
        setAriaAttributes(input, dataActivityItem);
    }

    return { isCorrect, isFilled };
};

const setAriaAttributes = (input, dataActivityItem) => {
    const feedbackElement = input.parentNode.querySelector(".feedback");
    if (feedbackElement) {
        feedbackElement.setAttribute("aria-live", "assertive");
        feedbackElement.id = `feedback-${dataActivityItem}`;
        input.setAttribute("aria-describedby", feedbackElement.id);
    }
};

const handleValidationResult = (validationResult) => {
    const { allCorrect, firstIncorrectInput, unfilledCount } = validationResult;

    if (firstIncorrectInput) {
        firstIncorrectInput.focus();
    }

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

    playActivitySound(allCorrect ? 'success' : 'error');

    if (allCorrect) {

        // Recuperar el arreglo de actividades completadas del localStorage
        const storedActivities = localStorage.getItem("completedActivities");
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


        localStorage.setItem("namePage", document.querySelector("h1")?.innerText ?? "unknown_page")
        executeMail(ActivityTypes.FILL_IN_THE_BLANK);
    }

    updateSubmitButtonAndToast(
        allCorrect,
        translateText("next-activity"),
        ActivityTypes.FILL_IN_THE_BLANK,
        unfilledCount
    );
};

export const validateInput = (input) => {
    const value = input.value.trim().toLowerCase();
    const dataActivityItem = input.getAttribute("data-activity-item");
    const correctAnswer = correctAnswers[dataActivityItem];

    // Remove any existing duplicate feedback first
    const existingFeedback = input.parentNode.querySelector(".feedback");
    if (existingFeedback && existingFeedback.textContent === "Palabra duplicada") {
        input.parentNode.removeChild(existingFeedback);
    }

    let isValid = false;
    let hasDuplicate = false;

    // Check if this is an interchangeable pair input
    if (window.interchangeablePairs && window.interchangeablePairs[dataActivityItem]) {
        // Get the alternate items and their correct answers
        const alternateItems = window.interchangeablePairs[dataActivityItem];
        const alternateAnswers = alternateItems.map(item => correctAnswers[item]);

        // First check if the value matches any valid answer for this input
        isValid = (value !== "" &&
            (value === correctAnswer.toLowerCase() ||
                alternateAnswers.some(alt => value === alt.toLowerCase())));

        // Then check for duplicates (the same answer used in multiple fields)
        if (isValid && value !== "") {
            for (const alternateItem of alternateItems) {
                const pairedInput = document.querySelector(`[data-activity-item="${alternateItem}"]`);
                if (pairedInput && pairedInput.value.trim().toLowerCase() === value) {
                    // Found duplicate, mark as invalid
                    isValid = false;
                    hasDuplicate = true;

                    // Show error message for duplicate
                    const feedback = document.createElement("span");
                    feedback.classList.add("feedback", "ml-2", "px-2", "py-1", "rounded-full",
                        "text-sm", "font-medium", "bg-red-100", "text-red-800");
                    feedback.textContent = "Palabra duplicada";
                    input.parentNode.appendChild(feedback);
                    break;
                }
            }
        }
    } else if (correctAnswer && correctAnswer.includes('|')) {
        // Handle pipe-separated multiple correct answers
        const acceptableAnswers = correctAnswer.split('|');
        isValid = value !== "" && acceptableAnswers.some(answer =>
            value === answer.trim().toLowerCase());
    } else {
        // Regular validation for non-interchangeable inputs
        isValid = value !== "" &&
            correctAnswer &&
            correctAnswer.toLowerCase() === value;
    }

    // Only update style if we didn't find a duplicate (which would have already set the style)
    updateInputValidationStyle(input, isValid);

    return { isValid, hasDuplicate };
};

const updateInputValidationStyle = (input, isValid) => {
    input.classList.remove('border-red-500', 'border-green-500');

    const trimmedValue = input.value.trim();
    if (trimmedValue !== "") {
        input.classList.add(isValid ? 'border-green-500' : 'border-red-500');

        // Get previous validation state
        const wasValid = input.dataset.wasValid === 'true';

        // Only play sounds if:
        // 1. The valid state changed to valid (for success sound)
        // 2. The valid state changed to invalid or was already invalid (for error sound)
        if (isValid && !wasValid && trimmedValue.length > 0) {
            playActivitySound('validate_success');
        } else if (!isValid) {
            playActivitySound('validate_error');
        }

        // Store current validation state for next time
        input.dataset.wasValid = isValid.toString();
    }
};

export const saveInputState = (input) => {
    const activityId = location.pathname
        .substring(location.pathname.lastIndexOf("/") + 1)
        .split(".")[0];
    const inputId = input.getAttribute("data-aria-id");
    const localStorageKey = `${activityId}_${inputId}`;

    localStorage.setItem(localStorageKey, input.value);
};

export const autofillCorrectAnswers = () => {
    const inputs = document.querySelectorAll('section input[type="text"]:not(#filter-input), section textarea:not(#filter-input)');
    inputs.forEach((input) => {
        const dataActivityItem = input.getAttribute("data-activity-item");
        const correctAnswer = correctAnswers[dataActivityItem];

        if (correctAnswer) {
            input.value = correctAnswer;
            validateInput(input);
            saveInputState(input);
        }
    });
};

export const countUnfilledInputs = (inputs) => {
    let unfilledCount = 0;
    let firstUnfilledInput = null;

    inputs.forEach((input) => {
        const isFilled = input.value.trim() !== "";
        provideFeedback(input, isFilled, "");

        if (!isFilled) {
            unfilledCount++;
            if (!firstUnfilledInput) {
                firstUnfilledInput = input;
            }
        }
    });

    if (firstUnfilledInput) {
        firstUnfilledInput.focus();
    }

    return unfilledCount;
};

