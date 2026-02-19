import { playActivitySound } from '../audio.js';
import { updateSubmitButtonAndToast, provideFeedback, ActivityTypes } from '../utils.js';
import { clearInputValidationFeedback } from './fill_in_the_blank.js';
import TextValidator from './textvalidator.js';

const validator = new TextValidator();

export const prepareOpenEnded = (section) => {
    const inputs = section.querySelectorAll('input[type="text"], textarea');
    setupInputListeners(inputs);
    loadInputState(inputs);
    initializeDictionary();
    return inputs;
};

async function initializeDictionary() {
    // Initialize the TextValidator dictionary early
    const textValidator = new TextValidator();
    await textValidator.ensureInitialized();

    // Store the validator in a global property so it can be accessed elsewhere
    window.globalTextValidator = textValidator;
}

const setupInputListeners = (inputs) => {
    inputs.forEach(input => {
        // Remove existing listeners to prevent duplicates
        input.removeEventListener('input', handleInputChange);
        input.removeEventListener('focus', handleInputFocus);
        input.removeEventListener('blur', handleInputBlur);

        // Add listeners
        input.addEventListener('input', handleInputChange);
        input.addEventListener('focus', handleInputFocus);
        input.addEventListener('blur', handleInputBlur);
    });
};

const handleInputChange = (event) => {
    const input = event.target;

    // Clear validation feedback when input changes
    clearInputValidationFeedback(input);

    saveInputState(input);
};

const handleInputFocus = (event) => {
    event.target.classList.add('border-blue-500', 'ring-2', 'ring-blue-200');
};

const handleInputBlur = (event) => {
    event.target.classList.remove('border-blue-500', 'ring-2', 'ring-blue-200');
};

const saveInputState = (input) => {
    const activityId = location.pathname
        .substring(location.pathname.lastIndexOf("/") + 1)
        .split(".")[0];
    const inputId = input.getAttribute("data-aria-id");
    const localStorageKey = `${activityId}_${inputId}`;

    localStorage.setItem(localStorageKey, input.value);
};

export const loadInputState = (inputs) => {
    inputs.forEach((input) => {
        const activityId = location.pathname
            .substring(location.pathname.lastIndexOf("/") + 1)
            .split(".")[0];
        const inputId = input.getAttribute("data-aria-id");
        const localStorageKey = `${activityId}_${inputId}`;

        // Only replace content if there's a saved value in localStorage
        const savedValue = localStorage.getItem(localStorageKey);
        if (savedValue !== null) {
            input.value = savedValue;
        }
        // Otherwise, keep the pre-filled content
    });
    localStorage.setItem("namePage", document.querySelector("h1")?.innerText ?? "unknown_page")
};

export const countUnfilledInputs = (inputs) => {
    let unfilledCount = 0;
    let firstUnfilledInput = null;

    // First, clear any existing feedback to avoid duplication or inconsistencies
    inputs.forEach(input => {
        clearInputValidationFeedback(input);
    });

    // Process each input in sequence
    inputs.forEach((input, index) => {
        const isFilled = input.value.trim() !== "";

        // Apply feedback directly without setTimeout to avoid race conditions
        provideFeedback(input, isFilled, "", ActivityTypes.OPEN_ENDED_ANSWER);

        if (!isFilled) {
            unfilledCount++;
            if (!firstUnfilledInput) {
                firstUnfilledInput = input;
            }
        }

        // Only focus the first unfilled input after all feedback is applied
        if (index === inputs.length - 1 && firstUnfilledInput) {
            setTimeout(() => {
                firstUnfilledInput.focus();
            }, 50);
        }
    });

    return unfilledCount;
};