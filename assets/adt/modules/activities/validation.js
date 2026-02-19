import { ActivityTypes, updateSubmitButtonAndToast } from '../utils.js';
import { translateText } from '../translations.js';
import { playActivitySound } from '../audio.js';
import { checkMultipleChoice } from './multiple_choice.js';
import { checkQuiz } from './quiz.js';
import { checkFillInTheBlank, clearInputValidationFeedback } from './fill_in_the_blank.js';
import { checkMatching } from './matching.js';
import { checkSorting } from './sorting.js';
import { checkTrueFalse } from './true_false.js';
import { checkTableInputs } from './fill_in_a_table.js';
import { isLikelySpanish } from './gibberish_detector.js';
import { executeMail } from './send-email.js';
import { containsProfanity } from './profanity_detector.js';
import TextValidator from './textvalidator.js';

/**
 * Central validation handler for all activity types
 * @param {string} activityType - Type of activity to validate
 * @returns {void}
 */
export const validateInputs = (activityType) => {
    try {
        switch (activityType) {
            case ActivityTypes.MULTIPLE_CHOICE:
                checkMultipleChoice();
                break;

            case ActivityTypes.QUIZ:
                checkQuiz();
                break;

            case ActivityTypes.FILL_IN_THE_BLANK:
                checkFillInTheBlank();
                break;

            case ActivityTypes.OPEN_ENDED_ANSWER:
                validateOpenEndedAnswer();
                break;

            case ActivityTypes.SORTING:
                checkSorting();
                break;

            case ActivityTypes.MATCHING:
                checkMatching();
                break;

            case ActivityTypes.TRUE_FALSE:
                checkTrueFalse();
                break;

            case ActivityTypes.FILL_IN_A_TABLE:
                checkTableInputs();
                break;

            default:
                console.error("Unknown validation type:", activityType);
                throw new Error(`Unsupported activity type: ${activityType}`);
        }
    } catch (error) {
        console.error(`Validation error for ${activityType}:`, error);
        handleValidationError(error);
    }
};

// Also ensure the open-ended text inputs clear validation on input
const setupOpenEndedInputListeners = () => {
    const inputs = document.querySelectorAll('section input[type="text"], section textarea');
    inputs.forEach(input => {
        // Remove existing listener to avoid duplicates
        input.removeEventListener('input', handleOpenEndedInputChange);
        // Add the listener
        input.addEventListener('input', handleOpenEndedInputChange);
    });
};

const handleOpenEndedInputChange = (event) => {
    const input = event.target;
    clearInputValidationFeedback(input);
};

/**
 * Validates text inputs for open-ended answers
 */
const validateOpenEndedAnswer = async () => {
    // First, set up the input listeners to clear validation on change
    setupOpenEndedInputListeners();

    // Only select inputs within the activity section, not from the entire page
    const activitySection = document.querySelector('[data-section-type="activity_open_ended_answer"]');
    if (!activitySection) {
        console.error("No open-ended activity section found");
        return;
    }

    const textInputs = activitySection.querySelectorAll('input[type="text"]:not(#filter-input), textarea:not(#filter-input)');

    // First, clear any existing feedback to avoid duplication
    textInputs.forEach(input => {
        clearInputValidationFeedback(input);
    });

    const unfilledCount = countUnfilledTextInputs(textInputs);

    // Check for gibberish in filled inputs - now async
    const hasInvalidContent = await checkForGibberish(textInputs);

    const allValid = unfilledCount === 0 && !hasInvalidContent;

    playActivityFeedback(allValid);
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

    if (allValid) {
        const activityId = location.pathname
            .substring(location.pathname.lastIndexOf("/") + 1)
            .split(".")[0];

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

        executeMail(ActivityTypes.OPEN_ENDED_ANSWER);
    }

    updateActivityFeedback(allValid, unfilledCount, hasInvalidContent);
};

/**
 * Counts unfilled text inputs
 * @param {NodeList} inputs - Collection of input elements
 * @returns {number} Number of unfilled inputs
 */

const countUnfilledTextInputs = (inputs) => {
    let unfilledCount = 0;
    let firstUnfilledInput = null;

    // Process each input directly
    Array.from(inputs).forEach((input) => {
        const isFilled = input.value.trim() !== "";

        // Apply regular validation feedback to all inputs
        provideFeedback(input, isFilled);

        if (!isFilled) {
            unfilledCount++;
            if (!firstUnfilledInput) {
                firstUnfilledInput = input;
            }
        }
    });

    // Focus first unfilled input 
    if (firstUnfilledInput) {
        setTimeout(() => {
            firstUnfilledInput.focus();
        }, 50);
    }

    return unfilledCount;
};

// /**
//  * Checks if any filled text inputs contain gibberish instead of Spanish
//  * @param {NodeList} inputs - Collection of input elements
//  * @returns {boolean} True if gibberish detected
//  */

// // Update the checkForGibberish function to also check for profanity
// export const checkForGibberish = (inputs) => {
//     let hasGibberish = false;
//     let hasProfanity = false;
//     let firstGibberishInput = null;
//     let firstProfanityInput = null;

//     inputs.forEach((input) => {
//         const text = input.value.trim();
//         if (text.length > 0) {
//             // Check for gibberish first
//             const isSpanish = isLikelySpanish(text);

//             if (!isSpanish) {
//                 hasGibberish = true;
//                 provideFeedbackForGibberish(input);

//                 if (!firstGibberishInput) {
//                     firstGibberishInput = input;
//                 }
//             } else {
//                 // Only check for profanity if the text passed the Spanish test
//                 const containsExplicitContent = containsProfanity(text);

//                 if (containsExplicitContent) {
//                     hasProfanity = true;
//                     provideFeedbackForProfanity(input);

//                     if (!firstProfanityInput) {
//                         firstProfanityInput = input;
//                     }
//                 }
//             }
//         }
//     });

//     // Prioritize focusing profanity issues over gibberish
//     if (firstProfanityInput) {
//         firstProfanityInput.focus();
//     } else if (firstGibberishInput) {
//         firstGibberishInput.focus();
//     }

//     return hasGibberish || hasProfanity;
// };

/**
 * Checks if any filled text inputs contain gibberish instead of Spanish/English
 * Updated to use the multilingual TextValidator
 * @param {NodeList} inputs - Collection of input elements
 * @returns {boolean} True if gibberish or profanity detected
 */
export const checkForGibberish = async (inputs) => {
    let hasGibberish = false;
    let hasProfanity = false;
    let firstGibberishInput = null;
    let firstProfanityInput = null;

    // Use the globally pre-initialized validator if available
    const textValidator = window.globalTextValidator || new TextValidator();

    if (!window.globalTextValidator) {
        await textValidator.ensureInitialized();
    }

    // Convert NodeList to Array to use async/await properly
    const inputsArray = Array.from(inputs);

    // Process each input
    for (const input of inputsArray) {
        const text = input.value.trim();
        if (text.length > 0) {
            try {
                const containsExplicitContent = containsProfanity(text);

                if (containsExplicitContent) {
                    hasProfanity = true;
                    provideFeedbackForProfanity(input);

                    if (!firstProfanityInput) {
                        firstProfanityInput = input;
                    }
                } else {

                    // Skip gibberish validation for inputs with do-not-validate class
                    const skipGibberishValidation = input.classList.contains("do-not-validate");
                    if (skipGibberishValidation) {
                        continue;
                    }
                    // Use our pre-initialized validator instance
                    const isValidText = await textValidator.isValidText(text);

                    if (!isValidText) {
                        hasGibberish = true;
                        provideFeedbackForGibberish(input);

                        if (!firstGibberishInput) {
                            firstGibberishInput = input;
                        }
                    }
                }
            } catch (error) {
                console.error("Error validating text:", error);
                // On error, fall back to the original isLikelySpanish as a backup
                const isSpanish = isLikelySpanish(text);

                if (!isSpanish) {
                    hasGibberish = true;
                    provideFeedbackForGibberish(input);

                    if (!firstGibberishInput) {
                        firstGibberishInput = input;
                    }
                } else {
                    // Check for profanity
                    const containsExplicitContent = containsProfanity(text);

                    if (containsExplicitContent) {
                        hasProfanity = true;
                        provideFeedbackForProfanity(input);

                        if (!firstProfanityInput) {
                            firstProfanityInput = input;
                        }
                    }
                }
            }
        }
    }

    // Prioritize focusing profanity issues over gibberish
    if (firstProfanityInput) {
        firstProfanityInput.focus();
    } else if (firstGibberishInput) {
        firstGibberishInput.focus();
    }

    return hasGibberish || hasProfanity;
};

// Add new function for profanity feedback
const provideFeedbackForProfanity = (input) => {

    // First, clear any existing validation icons
    clearInputValidationFeedback(input);

    // Create feedback element
    const feedback = createFeedbackElement();
    feedback.classList.add("text-red-600");
    feedback.textContent = translateText("validation-inappropriate-language") || "Inappropriate language";
    feedback.style.display = "block";
    feedback.style.width = "100%";
    feedback.style.textAlign = "left";

    //  // Add proper spacing and visual cues
    //  feedback.classList.add("mt-2", "pl-2", "border-l-4", "border-red-500", "bg-red-50", "p-2", "rounded");

    // Clear any existing styles and add red border to match the profanity feedback
    input.classList.remove(
        "border-green-500", "focus:border-green-500", "focus:ring-green-200",
        "border-orange-500", "focus:border-orange-500", "focus:ring-orange-200"
    );
    input.classList.add("border-red-500", "focus:border-red-500", "focus:ring-red-200", "focus:ring");

    // Add ARIA attributes for accessibility
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-label", `${input.value} - ${translateText("validation-inappropriate-language") || "Inappropriate language"}`);
    input.setAttribute("data-has-profanity-feedback", "true");

    // Ensure input has proper padding if we're going to add an icon
    input.style.paddingRight = '30px';

    // // Remove any existing feedback icons for this input
    // const existingIcons = document.querySelectorAll(`.feedback-icon-for-${input.id || 'profanity'}`);
    // existingIcons.forEach(icon => icon.remove());

    // Create an icon element for visual feedback
    const iconElement = document.createElement("div");
    // Use both ID and data-activity-item for more reliable cleanup
    const dataAriaId = input.getAttribute('data-aria-id') || '';
    const dataActivityItem = input.getAttribute('data-activity-item') || '';
    iconElement.className = `feedback-icon-for-${dataAriaId || input.id || dataActivityItem || 'profanity'}`;

    iconElement.style.position = "absolute";
    iconElement.style.pointerEvents = "none";
    iconElement.style.zIndex = "10";

    // Add the warning icon
    const icon = document.createElement("i");
    icon.className = "fas fa-exclamation-circle text-red-600 feedback-icon";
    icon.setAttribute("aria-hidden", "true");
    iconElement.appendChild(icon);

    // Position the icon element
    const rect = input.getBoundingClientRect();
    const parentRect = input.parentNode.getBoundingClientRect();

    // Calculate position relative to the parent
    const top = rect.top - parentRect.top + (rect.height - 24) / 2;
    const right = parentRect.right - rect.right + 10;

    // Set the position
    iconElement.style.top = `${top}px`;
    iconElement.style.right = `${right}px`;

    // Make sure parent has position relative or absolute
    const parentPosition = window.getComputedStyle(input.parentNode).position;
    if (parentPosition === 'static') {
        input.parentNode.style.position = 'relative';
    }

    // Add the icon after the input
    input.parentNode.insertBefore(iconElement, input.nextSibling);

    // Add text feedback after the parent div containing the input
    const textParent = findAppropriateParentForFeedback(input);
    textParent.appendChild(feedback);

    //appendFeedback(input, feedback);
    setupAriaAttributes(input, feedback);
};

// Add a helper function to find the appropriate parent element for the feedback text
export const findAppropriateParentForFeedback = (input) => {
    // Start with the direct parent
    let parent = input.parentNode;

    // In 17_0_adt.html, the structure is typically:
    // <div class="bg-blue-50 p-4 rounded-lg flex items-center">
    //   <img ...>
    //   <textarea ...></textarea>
    // </div>

    // Check if we're in a flex container
    const isFlexContainer = window.getComputedStyle(parent).display === 'flex';

    // Special case for grid layouts like in 16_2_adt.html
    const isGridContainer = window.getComputedStyle(parent).display === 'grid';

    if (isFlexContainer || isGridContainer) {
        // Instead of creating a wrapper inside the flex container,
        // look for the parent of the flex container to place feedback after it
        const containerParent = parent.parentNode;

        // Create a feedback container that will be placed AFTER the flex container
        const feedbackContainer = document.createElement('div');
        feedbackContainer.className = 'feedback-container w-full mt-2';
        feedbackContainer.style.marginTop = '0.5rem';

        // Insert the feedback container after the container
        if (containerParent.lastChild === parent) {
            containerParent.appendChild(feedbackContainer);
        } else {
            containerParent.insertBefore(feedbackContainer, parent.nextSibling);
        }

        return feedbackContainer;
    }

    // Special case for textareas in 16_2_adt.html that aren't in flex containers
    // but still need feedback positioned afterward
    if (input.tagName.toLowerCase() === 'textarea') {
        // Create a wrapper div if one doesn't exist
        const wrapper = document.createElement('div');
        wrapper.className = 'feedback-container w-full';

        // Insert the wrapper after the textarea
        parent.insertBefore(wrapper, input.nextSibling);
        return wrapper;
    }

    // If not in a special container, just return the parent
    return parent;
};

/**
 * Provides feedback for gibberish detection
 * @param {HTMLElement} input - Input element with gibberish
 */
const provideFeedbackForGibberish = (input) => {
    // First, clear any existing validation icons
    clearInputValidationFeedback(input);

    const feedback = createFeedbackElement();
    feedback.classList.add("text-orange-500");
    feedback.textContent = translateText("validation-check-spelling") || "Check your spelling";
    feedback.style.display = "block";
    feedback.style.width = "100%";
    feedback.style.textAlign = "left";

    // Clear any existing styles and add orange border to match the gibberish feedback
    input.classList.remove(
        "border-green-500", "focus:border-green-500", "focus:ring-green-200",
        "border-red-500", "focus:border-red-500", "focus:ring-red-200"
    );
    input.classList.add("border-orange-500", "focus:border-orange-500", "focus:ring-orange-200", "focus:ring");

    // Add ARIA attributes for accessibility
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-label", `${input.value} - ${translateText("validation-check-spelling") || "Check your spelling"}`);
    input.setAttribute("data-has-gibberish-feedback", "true"); // Mark this input as having gibberish feedback

    // Ensure input has proper padding if we're going to add an icon
    input.style.paddingRight = '30px';

    // // Remove any existing feedback icons for this input
    // const existingIcons = document.querySelectorAll(`.feedback-icon-for-${input.id || 'gibberish'}`);
    // existingIcons.forEach(icon => icon.remove());

    // Create an icon element for visual feedback
    const iconElement = document.createElement("div");
    // Use data-aria-id as primary identifier
    const dataAriaId = input.getAttribute('data-aria-id') || '';
    iconElement.className = `feedback-icon-for-${dataAriaId || input.id || 'gibberish'}`;

    iconElement.style.position = "absolute";
    iconElement.style.pointerEvents = "none";
    iconElement.style.zIndex = "10";

    // Add the warning icon
    const icon = document.createElement("i");
    icon.className = "fas fa-question-circle text-orange-500 feedback-icon";
    icon.setAttribute("aria-hidden", "true");
    iconElement.appendChild(icon);

    // Position the icon element
    const rect = input.getBoundingClientRect();
    const parentRect = input.parentNode.getBoundingClientRect();

    // Calculate position relative to the parent
    const top = rect.top - parentRect.top + (rect.height - 24) / 2;
    const right = parentRect.right - rect.right + 10;

    // Set the position
    iconElement.style.top = `${top}px`;
    iconElement.style.right = `${right}px`;

    // Make sure parent has position relative or absolute
    const parentPosition = window.getComputedStyle(input.parentNode).position;
    if (parentPosition === 'static') {
        input.parentNode.style.position = 'relative';
    }

    // Add the icon after the input
    input.parentNode.insertBefore(iconElement, input.nextSibling);

    // Find appropriate container and add the text feedback
    // This will place it outside the flex container
    const textParent = findAppropriateParentForFeedback(input);
    textParent.appendChild(feedback);

    //appendFeedback(input, feedback);
    setupAriaAttributes(input, feedback);
};

/**
 * Provides feedback for input validation
 * @param {HTMLElement} input - Input element to validate
 * @param {boolean} isValid - Validation state
 */
const provideFeedback = (input, isValid) => {
    // We'll directly apply the provideFeedback from utils.js
    const utils = window.utils || {};
    if (utils.provideFeedback) {
        utils.provideFeedback(input, isValid, "", ActivityTypes.OPEN_ENDED_ANSWER);
    } else {
        // Direct application if utils not available
        applyFeedbackToInput(input, isValid);
    }

    //const feedback = createFeedbackElement();

    // if (isValid) {
    //     applyValidFeedbackStyles(feedback);
    // } else {
    //     applyInvalidFeedbackStyles(feedback);
    // }

    // appendFeedback(input, feedback);
    // setupAriaAttributes(input, feedback);

    // We're actually going to use the utils.provideFeedback which will call handleTextInputFeedback
    // This ensures consistent styling across all activity types
    // import('../utils.js').then(utils => {
    //     utils.provideFeedback(input, isValid, "", ActivityTypes.OPEN_ENDED_ANSWER);
    // });
};

// Add a direct feedback application function
const applyFeedbackToInput = (input, isValid) => {
    // Ensure element has padding to accommodate the icon
    input.style.paddingRight = '30px';

    // Remove any existing feedback icons first
    const existingIconClass = `.feedback-icon-for-${input.id || 'feedback'}`;
    const existingIcon = document.querySelector(existingIconClass);
    if (existingIcon) existingIcon.remove();

    // Create an icon element
    const iconElement = document.createElement("div");
    // Use data-aria-id as primary identifier
    const dataAriaId = input.getAttribute('data-aria-id') || '';
    iconElement.className = `feedback-icon-for-${dataAriaId || input.id || 'feedback'}`;

    // Position the icon absolutely within the input's coordinate space
    iconElement.style.position = "absolute";
    iconElement.style.pointerEvents = "none";
    iconElement.style.zIndex = "10";

    // Add the Font Awesome icon
    const icon = document.createElement("i");
    icon.className = isValid ?
        "fas fa-check-circle text-green-600 feedback-icon" :
        "fas fa-times-circle text-red-600 feedback-icon";
    icon.setAttribute("aria-hidden", "true");

    iconElement.appendChild(icon);

    // Add appropriate ARIA attributes for accessibility
    if (isValid) {
        input.setAttribute("aria-invalid", "false");
        input.setAttribute("aria-label", `${input.value} - ${translateText("fill-in-the-blank-correct-answer")}`);

        // Add matching green border and focus styles to input
        input.classList.remove("border-red-500", "focus:border-red-500", "focus:ring-red-200");
        input.classList.add("border-green-500", "focus:border-green-500", "focus:ring-green-200", "focus:ring");
    } else {
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-label", `${input.value} - ${translateText("fill-in-the-blank-try-again")}`);

        // Add matching red border and focus styles to input
        input.classList.remove("border-green-500", "focus:border-green-500", "focus:ring-green-200");
        input.classList.add("border-red-500", "focus:border-red-500", "focus:ring-red-200", "focus:ring");
    }

    // Position the icon element absolutely related to the input
    const rect = input.getBoundingClientRect();
    const parentRect = input.parentNode.getBoundingClientRect();

    // Calculate position relative to the parent
    const top = rect.top - parentRect.top + (rect.height - 24) / 2; // Center icon vertically (24px is approx icon height)
    const right = parentRect.right - rect.right + 10;

    // Set the position
    iconElement.style.top = `${top}px`;
    iconElement.style.right = `${right}px`;

    // Make sure parent has position relative or absolute
    const parentPosition = window.getComputedStyle(input.parentNode).position;
    if (parentPosition === 'static') {
        input.parentNode.style.position = 'relative';
    }

    // Add the icon after the input (as a sibling)
    input.parentNode.insertBefore(iconElement, input.nextSibling);
}

/**
 * Creates a feedback element with base styles
 * @returns {HTMLElement} Styled feedback element
 */
const createFeedbackElement = () => {
    const feedback = document.createElement("span");
    feedback.classList.add(
        "feedback",
        // "ml-2",
        // "px-2",
        // "py-1",
        // "rounded-full",
        "text-base",
        "text-nowrap",
        "font-medium",
        "transition-colors",
        "duration-200"
    );
    feedback.setAttribute("role", "alert");
    return feedback;
};

/**
 * Applies styles for valid feedback
 * @param {HTMLElement} feedback - Feedback element
 */
const applyValidFeedbackStyles = (feedback) => {
    feedback.classList.add("bg-green-100", "text-green-800");
    feedback.textContent = "✓";
};

/**
 * Applies styles for invalid feedback
 * @param {HTMLElement} feedback - Feedback element
 */
const applyInvalidFeedbackStyles = (feedback) => {
    feedback.classList.add("bg-red-100", "text-red-800");
    feedback.textContent = "×";
};

/**
 * Appends feedback element to input container
 * @param {HTMLElement} input - Input element
 * @param {HTMLElement} feedback - Feedback element
 */
const appendFeedback = (input, feedback) => {
    const container = input.parentElement;
    const existingFeedback = container.querySelector(".feedback");

    if (existingFeedback && container) {
        try {
            container.removeChild(existingFeedback);
        } catch (e) {
            console.warn("Could not remove feedback node:", e);
        }
    }

    container.appendChild(feedback);
};

/**
 * Sets up ARIA attributes for accessibility
 * @param {HTMLElement} input - Input element
 * @param {HTMLElement} feedback - Feedback element
 */
const setupAriaAttributes = (input, feedback) => {
    const feedbackId = `feedback-${Math.random().toString(36).substr(2, 9)}`;
    feedback.id = feedbackId;
    input.setAttribute("aria-describedby", feedbackId);
};

/**
 * Plays appropriate feedback sound
 * @param {boolean} isSuccess - Whether to play success or error sound
 */
const playActivityFeedback = (isSuccess) => {
    playActivitySound(isSuccess ? 'success' : 'error');
};

/**
 * Updates activity feedback and UI state
 * @param {boolean} isValid - Overall validation state
 * @param {number} unfilledCount - Number of unfilled inputs
 * @param {boolean} hasGibberish - Whether gibberish was detected
 */
// Update updateActivityFeedback to handle profanity cases
const updateActivityFeedback = (isValid, unfilledCount, hasInappropriateContent) => {
    updateSubmitButtonAndToast(
        isValid,
        translateText("next-activity"),
        ActivityTypes.OPEN_ENDED_ANSWER,
        unfilledCount
    );

    // Add specific feedback for inappropriate content
    if (hasInappropriateContent) {
        const toast = document.getElementById("toast");
        if (toast) {
            toast.classList.remove("hidden");
            toast.classList.add("text-orange-700");

            // Since both gibberish and profanity are merged into one flag now
            toast.textContent = translateText("validation-write-appropriate") ||
                "Please use appropriate language";

            setTimeout(() => {
                toast.classList.add("hidden");
            }, 3000);
        }
    }
};

/**
 * Handles validation errors
 * @param {Error} error - Error object
 */
const handleValidationError = (error) => {
    const toast = document.getElementById("toast");
    if (toast) {
        toast.textContent = translateText("validation-error");
        toast.classList.remove("hidden");
        toast.classList.add("bg-red-200", "text-red-700");

        setTimeout(() => {
            toast.classList.add("hidden");
        }, 3000);
    }
};