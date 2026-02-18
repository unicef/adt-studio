import { state, setState } from './modules/state.js';
import { ActivityTypes } from './modules/utils.js'; // Import ActivityTypes first
import { initializeActivityAudioElements, playActivitySound } from './modules/audio.js';
import { prepareMultipleChoice } from './modules/activities/multiple_choice.js';
import { prepareQuiz, resetQuizActivity } from './modules/activities/quiz.js';
import { prepareSorting } from './modules/activities/sorting.js';
import { prepareMatching } from './modules/activities/matching.js';
import { prepareTrueFalse } from './modules/activities/true_false.js';
import { validateInputs } from './modules/activities/validation.js';
import { preparefillInBlank } from './modules/activities/fill_in_the_blank.js';
import { prepareFillInTable } from './modules/activities/fill_in_a_table.js';
import { prepareOpenEnded } from './modules/activities/open_ended.js';
import { translateText } from './modules/translations.js';
import { nextPage } from './modules/navigation.js';

// Constants for class names and selectors
const CLASS_NAMES = {
    VALIDATION: {
        SUCCESS: ["border-green-500", "focus:border-green-500", "focus:ring-green-200"],
        ERROR: ["border-red-500", "focus:border-red-500", "focus:ring-red-200"],
        WARNING: ["border-orange-500", "focus:border-orange-500", "focus:ring-orange-200"]
    },
    FEEDBACK: {
        SUCCESS: ["bg-green-100", "border-green-300"],
        ERROR: ["bg-red-100", "border-red-300"]
    }
};

const SELECTORS = {
    FILL_IN_THE_BLANK: 'section[data-section-type="activity_fill_in_the_blank"]',
    FILL_IN_A_TABLE: 'section[data-section-type="activity_fill_in_a_table"]',
    MULTIPLE_CHOICE: 'section[data-section-type="activity_multiple_choice"]',
    QUIZ: 'section[data-section-type="activity_quiz"]',
    TRUE_FALSE: 'section[data-section-type="activity_true_false"]',
    OPEN_ENDED: 'section[data-section-type="activity_open_ended_answer"]'
};

// Helper function to get activity ID from path
const getActivityIdFromPath = () => {
    return location.pathname
        .substring(location.pathname.lastIndexOf("/") + 1)
        .split(".")[0];
};

// Check if any inputs matching the selector have non-empty values
const hasNonEmptyInputs = (selector) => {
    const inputs = document.querySelectorAll(selector);
    return Array.from(inputs).some(input => input.value.trim() !== '');
};

// Checks if an activity has user data based on activity type
const activityHasUserData = (activityType) => {
    const activityId = getActivityIdFromPath();

    // Common checks for localStorage data
    const hasLocalStorageData = Object.keys(localStorage).some(key =>
        key.startsWith(`${activityId}_`) &&
        key !== `${activityId}_success`
    );

    if (!hasLocalStorageData) {
        // Use a function lookup pattern instead of switch
        if (activityType === 'activity_open_ended_answer') {
            return hasNonEmptyInputs('section textarea, section input[type="text"]');
        }
        else if (activityType === 'activity_fill_in_the_blank') {
            return hasNonEmptyInputs('section .blank-input, section input[type="text"]:not(#filter-input)');
        }
        else if (activityType === 'activity_fill_in_a_table') {
            return hasNonEmptyInputs('section td input[type="text"], section td textarea');
        }
        else if (activityType === 'activity_multiple_choice') {
            return document.querySelectorAll('section input[type="radio"]:checked').length > 0;
        }
        else if (activityType === 'activity_quiz') {
            return document.querySelectorAll('section input[type="radio"]:checked').length > 0;
        }
        else if (activityType === 'activity_true_false') {
            return document.querySelectorAll('section input[type="radio"]:checked').length > 0;
        }
        else if (activityType === 'activity_sorting') {
            const placedItems = document.querySelectorAll('section .placed-word');
            return placedItems.length > 0 || hasLocalStorageData;
        }
        else if (activityType === 'activity_matching') {
            const matchedItems = document.querySelectorAll('section .matching-item.matched');
            return matchedItems.length > 0 || hasLocalStorageData;
        }
    } else {
        // If localStorage has data, we assume user data exists
        return true;
    }
};

// Simplified function to check for user data
export const checkForUserData = () => {
    const activitySection = document.querySelector('section[role="activity"]');
    if (!activitySection) return false;

    const activityType = activitySection.dataset.sectionType;
    return activityHasUserData(activityType);
};

// Update the reset button visibility based on whether there's user data
export const updateResetButtonVisibility = () => {
    const resetButton = document.getElementById("reset-button");
    if (!resetButton) return;
    
    const activitySection = document.querySelector('section[role="activity"]');
    const activityType = activitySection?.dataset.sectionType;
    const resetSupportedTypes = new Set([
        ActivityTypes.OPEN_ENDED_ANSWER,
        ActivityTypes.FILL_IN_THE_BLANK,
        ActivityTypes.SORTING,
        ActivityTypes.FILL_IN_A_TABLE,
        ActivityTypes.MATCHING
    ]);

    if (!resetSupportedTypes.has(activityType)) {
        resetButton.classList.add("hidden");
        return;
    }

    // Check if there's any user data for this activity
    const hasUserData = checkForUserData();

    // Toggle visibility
    resetButton.classList.toggle("hidden", !hasUserData);
};

// Helper function to reset inputs
const resetInputs = (inputs, activityId) => {
    inputs.forEach(input => {
        input.value = '';
        input.classList.remove(
            ...CLASS_NAMES.VALIDATION.SUCCESS,
            ...CLASS_NAMES.VALIDATION.ERROR,
            ...CLASS_NAMES.VALIDATION.WARNING
        );

        const inputId = input.getAttribute("data-aria-id") || input.getAttribute("data-activity-item");
        if (inputId) {
            const localStorageKey = `${activityId}_${inputId}`;
            localStorage.removeItem(localStorageKey);
        }
    });
};

// Helper function to clear feedback elements
const clearFeedbackElements = () => {
    document.querySelectorAll("[class^='feedback-icon-for-']").forEach(icon => {
        icon.remove();
    });
    document.querySelectorAll(".feedback-container").forEach(container => {
        container.innerHTML = '';
    });
};

// Helper function for resetting selection-based activities
const resetSelectionInputs = (radioButtons) => {
    radioButtons.forEach(radio => {
        radio.checked = false;
    });
};

const submitActivityClasses = [
    'min-w-[180px]',
    'px-8',
    'py-3',
    'rounded-2xl',
    'text-lg',
    'font-semibold',
    'shadow-lg'
];

const resetActivityClasses = [
    'px-6',
    'py-3',
    'rounded-2xl',
    'text-lg',
    'font-medium'
];

const relocateActionButtons = (section) => {
    const target = section?.querySelector('[data-submit-target]');
    const submitButton = document.getElementById('submit-button');
    const resetButton = document.getElementById('reset-button');
    const originalContainer = document.getElementById('submit-reset-container');

    if (!submitButton || !originalContainer) {
        return;
    }

    const applyActivityStyles = () => {
        submitActivityClasses.forEach(cls => submitButton.classList.add(cls));
        resetButton && resetActivityClasses.forEach(cls => resetButton.classList.add(cls));
        submitButton.dataset.submitLocation = 'activity';
    };

    const removeActivityStyles = () => {
        submitActivityClasses.forEach(cls => submitButton.classList.remove(cls));
        resetButton && resetActivityClasses.forEach(cls => resetButton.classList.remove(cls));
        submitButton.dataset.submitLocation = 'interface';
    };

    if (target) {
        if (!target.contains(submitButton)) {
            target.appendChild(submitButton);
            if (resetButton) {
                target.appendChild(resetButton);
            }
            applyActivityStyles();
        }
        originalContainer.classList.add('hidden');
    } else {
        if (!originalContainer.contains(submitButton)) {
            originalContainer.appendChild(submitButton);
            if (resetButton) {
                originalContainer.appendChild(resetButton);
            }
        }
        removeActivityStyles();
        originalContainer.classList.remove('hidden');
    }
};

// Clear localStorage for an activity
const clearActivityLocalStorage = (activityId) => {
    Object.keys(localStorage)
        .filter(key => key.startsWith(`${activityId}_`))
        .forEach(key => localStorage.removeItem(key));
};

// Helper function to reset the submit button
const resetSubmitButton = () => {
    const submitButton = document.getElementById("submit-button");
    if (submitButton) {
        submitButton.textContent = translateText("submit-text");
        submitButton.setAttribute("aria-label", translateText("submit-text"));
        submitButton.removeEventListener("click", nextPage);
        submitButton.dataset.submitState = 'submit';

        if (state.validateHandler) {
            submitButton.addEventListener("click", state.validateHandler);
        }
    }
};

// Clear all feedback elements and styling
const clearAllFeedback = () => {
    // Elements to remove completely
    const elementsToRemove = [
        ".feedback-icon",
        "[class^='feedback-icon-for-']",
        ".mark",
        ".validation-mark",
        ".sr-only"
    ].join(", ");

    document.querySelectorAll(elementsToRemove).forEach(el => el.remove());

    // Elements to clear content
    document.querySelectorAll(".feedback-container").forEach(container => {
        container.innerHTML = '';
    });

    // Clear validation styling on inputs
    document.querySelectorAll("input, textarea").forEach(input => {
        input.classList.remove(
            ...CLASS_NAMES.VALIDATION.SUCCESS,
            ...CLASS_NAMES.VALIDATION.ERROR,
            ...CLASS_NAMES.VALIDATION.WARNING
        );

        ["aria-invalid", "aria-describedby", "data-has-gibberish-feedback", "data-has-profanity-feedback"]
            .forEach(attr => input.removeAttribute(attr));
    });

    // Clear styling on activity options
    document.querySelectorAll(".activity-option span, .statement-option, .placed-word").forEach(el => {
        el.classList.remove(
            ...CLASS_NAMES.FEEDBACK.SUCCESS,
            ...CLASS_NAMES.FEEDBACK.ERROR,
            "border-green-600", "border-red-600",
            "border-2"
        );
    });

    // Reset toast
    const toast = document.getElementById("toast");
    if (toast) {
        toast.textContent = "";
        toast.classList.add("hidden");
        toast.classList.remove(
            "bg-red-200", "text-red-700",
            "bg-green-200", "text-green-700",
            "bg-orange-200", "text-orange-700"
        );
    }

    // Reset feedback element
    const feedbackElement = document.getElementById("feedback");
    if (feedbackElement) {
        feedbackElement.textContent = "";
        feedbackElement.classList.remove("text-red-500", "text-green-500");
    }
};

// Base reset function for activity types
const resetActivityBase = (activityId, { sectionSelector, inputSelector, additionalReset }) => {
    const activitySection = document.querySelector(sectionSelector);
    const inputs = activitySection ?
        activitySection.querySelectorAll(inputSelector) :
        document.querySelectorAll(inputSelector);

    resetInputs(inputs, activityId);

    if (additionalReset && typeof additionalReset === 'function') {
        additionalReset(activityId);
    }

    clearFeedbackElements();
};

// Initialize handlers using a function that will be called after module load
function initializeActivityHandlers() {
    // Define activity reset handlers
    const activityResetHandlers = {};

    // Add handlers to the object using ActivityTypes (now safe to use)
    activityResetHandlers[ActivityTypes.FILL_IN_THE_BLANK] = (activityId) => {
        resetActivityBase(activityId, {
            sectionSelector: SELECTORS.FILL_IN_THE_BLANK,
            inputSelector: 'input[type="text"]:not(#filter-input)'
        });
    };

    activityResetHandlers[ActivityTypes.FILL_IN_A_TABLE] = (activityId) => {
        resetActivityBase(activityId, {
            sectionSelector: SELECTORS.FILL_IN_A_TABLE,
            inputSelector: 'input[type="text"]:not(#filter-input), textarea:not(#filter-input)'
        });
    };

    activityResetHandlers[ActivityTypes.MULTIPLE_CHOICE] = (activityId) => {
        const activitySection = document.querySelector(SELECTORS.MULTIPLE_CHOICE);
        const radioButtons = activitySection ?
            activitySection.querySelectorAll('input[type="radio"]') :
            document.querySelectorAll('input[type="radio"]');

        resetSelectionInputs(radioButtons);

        document.querySelectorAll(".activity-option span").forEach(option => {
            option.classList.remove(
                ...CLASS_NAMES.FEEDBACK.SUCCESS,
                ...CLASS_NAMES.FEEDBACK.ERROR,
                "border-green-600", "border-red-600", "border-2"
            );

            const mark = option.querySelector(".mark");
            if (mark) mark.remove();

            const srText = option.querySelector(".sr-only");
            if (srText) srText.remove();
        });

        localStorage.removeItem(`${activityId}_selectedOption`);
    };

    activityResetHandlers[ActivityTypes.QUIZ] = (activityId) => {
        resetQuizActivity(activityId);
    };

    activityResetHandlers[ActivityTypes.TRUE_FALSE] = (activityId) => {
        const activitySection = document.querySelector(SELECTORS.TRUE_FALSE);
        const radioButtons = activitySection ?
            activitySection.querySelectorAll('input[type="radio"]') :
            document.querySelectorAll('input[type="radio"]');

        resetSelectionInputs(radioButtons);

        document.querySelectorAll(".statement-option").forEach(option => {
            option.classList.remove(
                ...CLASS_NAMES.FEEDBACK.SUCCESS,
                ...CLASS_NAMES.FEEDBACK.ERROR
            );

            const icon = option.querySelector(".feedback-icon");
            if (icon) icon.remove();
        });

        Object.keys(localStorage)
            .filter(key => key.startsWith(`${activityId}_tf_`))
            .forEach(key => localStorage.removeItem(key));
    };

    activityResetHandlers[ActivityTypes.OPEN_ENDED_ANSWER] = (activityId) => {
        resetActivityBase(activityId, {
            sectionSelector: SELECTORS.OPEN_ENDED,
            inputSelector: 'textarea, input[type="text"]'
        });
    };

    activityResetHandlers[ActivityTypes.SORTING] = (activityId) => {
        import('./modules/activities/sorting.js').then(module => {
            if (module.resetActivity) {
                module.resetActivity(activityId);
            }
        });
    };

    activityResetHandlers[ActivityTypes.MATCHING] = (activityId) => {
        import('./modules/activities/matching.js').then(module => {
            if (module.resetActivity) {
                module.resetActivity(activityId);
            }
        });
    };

    // Define activity setup handlers
    const activityHandlers = {};

    activityHandlers[ActivityTypes.MULTIPLE_CHOICE] = {
        setup: prepareMultipleChoice,
        validate: () => validateInputs(ActivityTypes.MULTIPLE_CHOICE)
    };

    activityHandlers[ActivityTypes.QUIZ] = {
        setup: prepareQuiz,
        validate: () => validateInputs(ActivityTypes.QUIZ)
    };

    activityHandlers[ActivityTypes.FILL_IN_THE_BLANK] = {
        setup: preparefillInBlank,
        validate: () => validateInputs(ActivityTypes.FILL_IN_THE_BLANK)
    };

    activityHandlers[ActivityTypes.OPEN_ENDED_ANSWER] = {
        setup: prepareOpenEnded,
        validate: () => validateInputs(ActivityTypes.OPEN_ENDED_ANSWER)
    };

    activityHandlers[ActivityTypes.SORTING] = {
        setup: prepareSorting,
        validate: () => validateInputs(ActivityTypes.SORTING)
    };

    activityHandlers[ActivityTypes.MATCHING] = {
        setup: prepareMatching,
        validate: () => validateInputs(ActivityTypes.MATCHING)
    };

    activityHandlers[ActivityTypes.TRUE_FALSE] = {
        setup: prepareTrueFalse,
        validate: () => validateInputs(ActivityTypes.TRUE_FALSE)
    };

    activityHandlers[ActivityTypes.FILL_IN_A_TABLE] = {
        setup: prepareFillInTable,
        validate: () => validateInputs(ActivityTypes.FILL_IN_A_TABLE)
    };

    return { activityResetHandlers, activityHandlers };
}

// Store the handlers in state when prepareActivity is called
let activityResetHandlers;
let activityHandlers;

// Function to handle activity reset
const handleResetActivity = () => {
    // Make sure handlers are initialized
    if (!activityResetHandlers) {
        const handlers = initializeActivityHandlers();
        activityResetHandlers = handlers.activityResetHandlers;
        activityHandlers = handlers.activityHandlers;
    }

    const activityId = getActivityIdFromPath();
    clearActivityLocalStorage(activityId);

    const activitySection = document.querySelector('section[role="activity"]');
    if (activitySection) {
        const activityType = activitySection.dataset.sectionType;
        const resetHandler = activityResetHandlers[activityType];

        if (resetHandler) {
            resetHandler(activityId);
        } else {
            console.warn(`No reset handler found for activity type: ${activityType}`);
        }
    }

    playActivitySound('reset');
    resetSubmitButton();
    clearAllFeedback();
    updateResetButtonVisibility();
};

// Setup an activity section with the appropriate handlers
const setupActivitySection = (section, activityType, submitButton) => {
    // Make sure handlers are initialized
    if (!activityHandlers) {
        const handlers = initializeActivityHandlers();
        activityResetHandlers = handlers.activityResetHandlers;
        activityHandlers = handlers.activityHandlers;
    }

    const handler = activityHandlers[activityType];

    if (handler) {
        handler.setup(section);
        setState('validateHandler', handler.validate);
    } else {
        console.error("Unknown activity type:", activityType);
    }

    if (state.validateHandler) {
        submitButton.removeEventListener("click", state.validateHandler);
        submitButton.addEventListener("click", state.validateHandler);
    }

    relocateActionButtons(section);
};

// Main activity preparation function - make sure this is at the end of the file
export const prepareActivity = () => {
    // Initialize the handlers
    const handlers = initializeActivityHandlers();
    activityResetHandlers = handlers.activityResetHandlers;
    activityHandlers = handlers.activityHandlers;

    initializeActivityAudioElements();
    const activitySections = document.querySelectorAll('section[role="activity"]');
    const submitButton = document.getElementById("submit-button");
    const resetButton = document.getElementById("reset-button");

    if (activitySections.length === 0) {
        if (submitButton) submitButton.classList.add("hidden");
        if (resetButton) resetButton.classList.add("hidden");
        return;
    } else {
        if (submitButton) submitButton.classList.remove("hidden");
        if (resetButton) resetButton.classList.remove("hidden");
    }

    if (!submitButton) {
        console.warn("Submit button not found");
        return;
    }

    activitySections.forEach((section) => {
        const activityType = section.dataset.sectionType;
        setupActivitySection(section, activityType, submitButton);
    });

    if (resetButton) {
        resetButton.addEventListener("click", handleResetActivity);
    }

    updateResetButtonVisibility();
};