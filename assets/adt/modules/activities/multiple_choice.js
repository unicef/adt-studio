import { state, setState } from '../state.js';
import { playActivitySound } from '../audio.js';
import { updateSubmitButtonAndToast, ActivityTypes } from '../utils.js';
import { translateText } from '../translations.js';
import { executeMail } from './send-email.js';
import { updateResetButtonVisibility } from '../../activity.js';
import { isTypingTarget } from './shortcut-utils.js';

let multipleChoiceShortcutHandler = null;

const restoreSubmitButtonToValidate = () => {
    const submitButton = document.getElementById("submit-button");
    if (!submitButton || submitButton.dataset.submitState !== 'retry') {
        return;
    }

    submitButton.textContent = translateText("submit-text");
    submitButton.setAttribute("aria-label", translateText("submit-text"));
    submitButton.dataset.submitState = 'submit';

    if (state.retryHandler) {
        submitButton.removeEventListener("click", state.retryHandler);
        state.retryHandler = null;
    }

    if (state.validateHandler) {
        submitButton.removeEventListener("click", state.validateHandler);
        submitButton.addEventListener("click", state.validateHandler);
    }
};

export const prepareMultipleChoice = (section) => {
    restorePreviousSelection(section); // Restaurar selección previa

    const activityOptions = section.querySelectorAll(".activity-option");

    // Remove any previous event listeners
    activityOptions.forEach((option) => {
        const newOption = option.cloneNode(true);
        option.parentNode.replaceChild(newOption, option);
    });

    // Add new event listeners
    section.querySelectorAll(".activity-option").forEach((option) => {
        option.addEventListener("click", () => selectOption(option));

        // Keyboard event handling - Enter and Space trigger option selection
        option.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault(); // Prevent scrolling on space
                selectOption(option);
            }
        });

        // Set proper ARIA attributes
        const optionLetter = option.querySelector('.option-letter')?.textContent || '';
        const imgAlt = option.querySelector('img')?.alt || '';
        const shadowInput = option.querySelector('input[type="radio"]');
        if (shadowInput) {
            shadowInput.setAttribute('tabindex', '-1');
        }

        // Create a more descriptive label that includes the image description
        option.setAttribute('aria-label', `Option ${optionLetter}: ${imgAlt}`);
        option.setAttribute('role', 'radio');
        option.setAttribute('aria-checked', 'false');


        // Add hover effect classes
        option.classList.add(
            'cursor-pointer',
            'transition-all',
            'duration-200',
            'hover:shadow-md',
            'focus:outline-none',
            'focus:ring-2',
            'focus:ring-blue-500',
            'focus:ring-opacity-50'
        );

        // Style option label
        const label = option.querySelector("span");
        if (label) {
            label.classList.add(
                'px-4',
                'py-2',
                'rounded-full',
                'font-medium',
                'transition-colors',
                'duration-200'
            );
        }
    });

    // Set proper radiogroup role on the container
    const radioGroup = section.querySelector('[role="group"]');
    if (radioGroup) {
        radioGroup.setAttribute('role', 'radiogroup');
        radioGroup.setAttribute('aria-labelledby', 'question-label');

        let shortcutHint = radioGroup.querySelector('.quiz-shortcut-hint');
        if (!shortcutHint) {
            shortcutHint = document.createElement('p');
            shortcutHint.className = 'quiz-shortcut-hint sr-only';
            shortcutHint.setAttribute('aria-live', 'polite');
            radioGroup.prepend(shortcutHint);
        }

        shortcutHint.textContent = translateText('quiz-shortcut-hint');
    }

    // Allow digit keys (1-9) to select options, Enter to submit
    const options = [...section.querySelectorAll(".activity-option")];
    const keyHandler = (e) => {
        if (isTypingTarget(e.target)) {
            return;
        }

        const digit = parseInt(e.key, 10);
        if (digit >= 1 && digit <= options.length) {
            e.preventDefault();
            selectOption(options[digit - 1]);
        } else if (e.key === "Enter") {
            const submitButton = document.getElementById("submit-button");
            if (submitButton) {
                e.preventDefault();
                submitButton.click();
            }
        }
    };
    // Remove any previous handler before adding a new one
    if (multipleChoiceShortcutHandler) {
        document.removeEventListener("keydown", multipleChoiceShortcutHandler);
    }
    multipleChoiceShortcutHandler = keyHandler;
    document.addEventListener("keydown", multipleChoiceShortcutHandler);
};
const saveSelectionState = (option) => {
    const activityId = location.pathname
        .substring(location.pathname.lastIndexOf("/") + 1)
        .split(".")[0];

    const areaId = option.closest("[data-area-id]")?.getAttribute("data-area-id") || "default";
    const storageKey = `${activityId}_${areaId}_multipleChoice`;

    const selectedData = {
        question: option.getAttribute("data-activity-item"),
        value: option.querySelector('input[type="radio"]').value,
        areaId: areaId
    };

    localStorage.setItem(storageKey, JSON.stringify(selectedData));
};

const restorePreviousSelection = (section) => {
    const activityId = location.pathname
        .substring(location.pathname.lastIndexOf("/") + 1)
        .split(".")[0];

    const areaId = section.querySelector("[data-area-id]")?.getAttribute("data-area-id") || "default";
    const storageKey = `${activityId}_${areaId}_multipleChoice`;

    const savedSelection = localStorage.getItem(storageKey);
    if (savedSelection) {
        const { value } = JSON.parse(savedSelection);

        const selectedOption = [...section.querySelectorAll(".activity-option")].find(option =>
            option.querySelector('input[type="radio"]').value === value
        );

        if (selectedOption) {
            selectClickedOption(selectedOption);
            setState('selectedOption', selectedOption);
        }
    }
};

const isLetterHidden = (option) => {
    const letterElement = option.querySelector('.option-letter');
    const wrapper = letterElement?.parentElement;
    return (
        letterElement?.dataset.letterHidden === 'true' ||
        wrapper?.dataset.letterHidden === 'true'
    );
};

const setLetterAppearance = (option, circleClasses, letterClasses) => {
    const letterElement = option.querySelector('.option-letter');
    const circle = letterElement?.parentElement;

    if (!letterElement || !circle) {
        return;
    }

    if (isLetterHidden(option)) {
        circle.className = 'option-letter-wrapper sr-only';
        letterElement.className = 'option-letter sr-only';
        return;
    }

    if (circleClasses) {
        circle.className = circleClasses;
    }

    if (letterClasses) {
        letterElement.className = letterClasses;
    }
};


const selectOption = (option) => {
    // Clear all validation styling before selecting a new option
    clearAllValidationStyling();

    const activityItem = getActivityItem(option);

    const radioGroup = option.closest('[role="radiogroup"]') || option.closest('[role="group"]');
    if (!radioGroup) {
        return;
    }

    resetOptions(radioGroup);
    selectClickedOption(option);
    setState('selectedOption', option);

    // Update ARIA attributes
    radioGroup.querySelectorAll('.activity-option').forEach(opt => {
        opt.setAttribute('aria-checked', 'false');
    });
    option.setAttribute('aria-checked', 'true');

    // Announce selection to screen readers
    const optionLetter = option.querySelector('.option-letter')?.textContent || '';
    const liveRegion = document.getElementById('validation-results-announcement');
    if (liveRegion) {
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.textContent = `Option ${optionLetter} selected`;
        setTimeout(() => {
            liveRegion.textContent = '';
        }, 1000);
    }

    // Guardar en localStorage
    saveSelectionState(option);

    restoreSubmitButtonToValidate();

    const shortcutHint = radioGroup?.querySelector('.quiz-shortcut-hint');
    if (shortcutHint) {
        shortcutHint.textContent = translateText('quiz-shortcut-hint');
    }
};

// New function to clear all validation styling
const clearAllValidationStyling = () => {
    // Reset all validation marks
    document.querySelectorAll(".validation-mark").forEach(mark => {
        mark.classList.add('hidden');
        mark.textContent = '';
    });

    // Reset all option containers
    document.querySelectorAll(".activity-option").forEach(option => {
        option.classList.remove('bg-green-50', 'bg-red-50');
        option.removeAttribute('aria-invalid');

        // Reset all feedback containers
        const feedback = option.querySelector('.feedback-container');
        if (feedback) {
            feedback.classList.add('hidden');

            // Clear feedback content
            const feedbackIcon = feedback.querySelector('.feedback-icon');
            const feedbackText = feedback.querySelector('.feedback-text');

            if (feedbackIcon) {
                feedbackIcon.className = 'feedback-icon';
                feedbackIcon.textContent = '';
            }

            if (feedbackText) {
                feedbackText.className = 'feedback-text';
                feedbackText.textContent = '';
            }
        }
        
        // Reset the letter appearance
        setLetterAppearance(
            option,
            'w-8 h-8 aspect-square rounded-full border-2 border-gray-300 flex items-center justify-center',
            'option-letter text-gray-500'
        );

        option.classList.remove('selected-option');
    });

    // Announce change to screen readers
    const validationResults = document.getElementById('validation-results-announcement');
    if (validationResults) {
        validationResults.textContent = translateText('selection-changed-resubmit');
    }
};

const resetOptions = (radioGroup) => {
    radioGroup.querySelectorAll(".activity-option").forEach((opt) => {
        // Reset aria attributes
        opt.setAttribute('aria-checked', 'false');

        setLetterAppearance(
            opt,
            'w-8 h-8 aspect-square rounded-full border-2 border-gray-300 flex items-center justify-center',
            'option-letter text-gray-500'
        );

        // Reset option container
        opt.classList.remove('bg-green-50', 'bg-red-50');
    opt.classList.remove('selected-option');

        // Hide feedback
        const feedback = opt.querySelector('.feedback-container');
        if (feedback) {
            feedback.classList.add('hidden');
        }
    });
};

const selectClickedOption = (option) => {
    const input = option.querySelector('input[type="radio"]');
    if (input) {
        input.checked = true;
    }

    // Update ARIA state
    option.setAttribute('aria-checked', 'true');

    setLetterAppearance(
        option,
        'w-8 h-8 aspect-square rounded-full border-2 border-blue-500 bg-blue-500 flex items-center justify-center',
        'option-letter text-white'
    );

    option.classList.add('selected-option');
};

const getActivityItem = (element) => {
    let activityItem = element.getAttribute('data-activity-item');

    if (!activityItem) {
        const input = element.querySelector('input[type="radio"]');
        if (input) {
            activityItem = input.getAttribute('data-activity-item');
        }

        if (element.tagName === 'INPUT') {
            const label = element.closest('.activity-option');
            if (label) {
                activityItem = label.getAttribute('data-activity-item') || activityItem;
            }
        }
    }

    return activityItem;
};

export const checkMultipleChoice = () => {
    if (!state.selectedOption) {
        // Add announcement for screen readers
        const announcement = document.getElementById('validation-results-announcement');
        if (announcement) {
            announcement.setAttribute('aria-live', 'assertive');
            announcement.textContent = translateText("select-option-first");
            setTimeout(() => {
                announcement.textContent = '';
            }, 3000);
        }

        return;
    }

    const input = state.selectedOption.querySelector('input[type="radio"]');
    const dataActivityItem = getActivityItem(state.selectedOption);
    const isCorrect = correctAnswers[dataActivityItem];

    styleSelectedOption(state.selectedOption, isCorrect);
    showFeedback(state.selectedOption, isCorrect);
    // Add this line to update reset button visibility
    if (typeof updateResetButtonVisibility === 'function') {
        updateResetButtonVisibility();
    }
    updateSubmitButtonAndToast(
        isCorrect,
        translateText("next-activity"),
        ActivityTypes.MULTIPLE_CHOICE
    );
};

const styleSelectedOption = (option, isCorrect) => {
    option.classList.remove('selected-option');

    setLetterAppearance(
        option,
        `w-8 h-8 aspect-square rounded-full border-2 flex items-center justify-center ${isCorrect
            ? 'border-green-500 bg-green-500 text-white'
            : 'border-red-500 bg-red-500 text-white'
            }`,
        'option-letter text-white'
    );

    option.classList.add(isCorrect ? 'bg-green-50' : 'bg-red-50');

    // Update ARIA for feedback status
    option.setAttribute('aria-invalid', isCorrect ? 'false' : 'true');
};

const showFeedback = (option, isCorrect) => {
    const feedbackContainer = option.querySelector('.feedback-container');

    if (!feedbackContainer) {
        console.warn('Feedback container not found for option:', option);
        return;
    }

    const feedbackIcon = feedbackContainer.querySelector('.feedback-icon');
    const feedbackText = feedbackContainer.querySelector('.feedback-text');

    if (!feedbackIcon || !feedbackText) {
        console.warn('Feedback children missing for option:', option);
        return;
    }

    feedbackContainer.classList.remove('hidden');

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

    const dataExplanation = option.getAttribute('data-explanation');
    const globalExplanation = window?.multipleChoiceExplanations?.[getActivityItem(option)];
    const explanation = dataExplanation || globalExplanation;

    if (isCorrect) {
        feedbackIcon.className = 'feedback-icon hidden';
        feedbackIcon.textContent = '';

        feedbackText.className = 'feedback-text text-lg font-semibold text-green-800';
        if (explanation) {
            feedbackText.textContent = explanation;
        } else {
            feedbackText.textContent = translateText('multiple-choice-correct-answer');
        }
        
        // Set ARIA attributes for feedback
        feedbackContainer.setAttribute('role', 'status');
        feedbackContainer.setAttribute('aria-live', 'polite');

        playActivitySound('success');

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

        localStorage.setItem("namePage", document.querySelector("h1")?.innerText ?? "unknown_page");
        executeMail(ActivityTypes.MULTIPLE_CHOICE);
    } else {
        feedbackIcon.className = 'feedback-icon hidden';
        feedbackIcon.textContent = '';
        feedbackText.className = 'feedback-text text-lg font-semibold text-red-800';
        if (explanation) {
            feedbackText.textContent = explanation;
        } else {
            feedbackText.textContent = translateText('multiple-choice-try-again');
        }
        
        // Set ARIA attributes for feedback
        feedbackContainer.setAttribute('role', 'alert');

        playActivitySound('error');
    }
};
