import { state, setState } from '../state.js';
import { playActivitySound } from '../audio.js';
import { updateSubmitButtonAndToast } from '../utils.js';
import { translateText } from '../translations.js';
import { ActivityTypes } from '../utils.js';
import { executeMail } from './send-email.js';


export const prepareTrueFalse = (section) => {

    initializeAudio();
    enhanceKeyboardAccessibility(section);
    setupRadioButtons(section);
};

const initializeAudio = () => {
    playActivitySound(''); // Initialize audio system
};

if (document.getElementsByTagName("h1").length < 0) {
    localStorage.setItem("namePage", document.getElementsByTagName("h2")[0].innerText);
} else if (document.getElementsByTagName("h1").length > 0) {
    localStorage.setItem("namePage", document.querySelector("h1")?.innerText ?? "unknown_page");
}

// Inside the enhanceKeyboardAccessibility function
const enhanceKeyboardAccessibility = (section) => {
    // Ensure each fieldset has the proper keyboard navigation
    const fieldsets = section.querySelectorAll('fieldset');

    fieldsets.forEach(fieldset => {
        const radios = Array.from(fieldset.querySelectorAll('input[type="radio"]'));
        const legendText = fieldset.querySelector('legend span')?.textContent || '';

        if (radios.length > 0) {
            // We'll enhance all radio buttons with proper key handling
            radios.forEach(radio => {
                // First remove any existing listeners to avoid duplicates
                const newRadio = radio.cloneNode(true);
                radio.parentNode.replaceChild(newRadio, radio);

                // Now add our enhanced listeners
                newRadio.addEventListener('keydown', (event) => {
                    // Handle Enter key for selection
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        newRadio.checked = true;

                        // Announce the selection with question context
                        announceSelectionWithContext(newRadio, legendText);

                        // Trigger change event
                        const changeEvent = new Event('change', { bubbles: true });
                        newRadio.dispatchEvent(changeEvent);
                    }

                    // Handle arrow keys
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' ||
                        event.key === 'ArrowUp' || event.key === 'ArrowDown') {

                        event.preventDefault(); // Prevent default scroll behavior
                        event.stopPropagation(); // Prevent bubbling to page navigation

                        let nextIndex;
                        const currentIndex = radios.indexOf(newRadio);

                        // Determine which radio button to focus next
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                            nextIndex = currentIndex === 0 ? radios.length - 1 : currentIndex - 1;
                        } else {
                            nextIndex = currentIndex === radios.length - 1 ? 0 : currentIndex + 1;
                        }

                        // Focus and select the next radio button
                        radios[nextIndex].focus();
                        radios[nextIndex].checked = true;

                        // Announce the selection with question context
                        announceSelectionWithContext(radios[nextIndex], legendText);

                        // Trigger the change event to handle any logic tied to selection
                        const changeEvent = new Event('change', { bubbles: true });
                        radios[nextIndex].dispatchEvent(changeEvent);
                    }
                });

                // Also enhance the onFocus event to announce the full context
                newRadio.addEventListener('focus', () => {
                    // When a radio button gets focus, announce the question and current state
                    const optionText = newRadio.value === 'yes' ? 'Sí' : 'No';
                    const isChecked = newRadio.checked ? 'seleccionado' : 'no seleccionado';

                    // Find or create an announcement element
                    const focusAnnouncement = document.getElementById('focus-announcement') || createFocusAnnouncement();
                    focusAnnouncement.textContent = `${legendText} - Opción: ${optionText}, ${isChecked}`;
                });
            });
        }
    });
};

// Helper function to announce selection with question context
const announceSelectionWithContext = (radio, questionText) => {
    const optionText = radio.value === 'yes' ? 'Sí' : 'No';

    // Find or create the announcement element
    const announcement = document.getElementById('keyboard-action-announcement') || createKeyboardActionAnnouncement();
    announcement.textContent = `${questionText} - ${optionText} seleccionado`;
};

// Helper to create announcement element
const createKeyboardActionAnnouncement = () => {
    const announcement = document.createElement('div');
    announcement.id = 'keyboard-action-announcement';
    announcement.className = 'sr-only';
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'assertive');
    document.body.appendChild(announcement);
    return announcement;
};

// Helper to create focus announcement element
const createFocusAnnouncement = () => {
    const announcement = document.createElement('div');
    announcement.id = 'focus-announcement';
    announcement.className = 'sr-only';
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    document.body.appendChild(announcement);
    return announcement;
};

const setupRadioButtons = (section) => {
    const buttons = section.querySelectorAll("input[type='radio']");

    buttons.forEach((button, index) => {
        restorePreviousSelection(button);
        addButtonListener(button);

        // Ensure label and input are properly associated
        const buttonId = button.id || `tf-radio-${button.name}-${button.value}-${index}`;
        button.id = buttonId;

        const label = button.closest('label');
        if (label) {
            label.setAttribute('for', buttonId);
        }
    });
};

const restorePreviousSelection = (button) => {
    const activityId = location.pathname
        .substring(location.pathname.lastIndexOf("/") + 1)
        .split(".")[0];


    const areaId = button.closest("[data-area-id]")?.getAttribute("data-area-id") || "default";
    const storageKey = `${activityId}_${areaId}_${button.name}`;


    const savedSelection = localStorage.getItem(storageKey);
    if (savedSelection) {
        const { value } = JSON.parse(savedSelection);
        if (button.value === value) {
            button.checked = true; // Restaurar la selección guardada
        }
    }
};

const addButtonListener = (button) => {
    button.addEventListener("change", () => {
        playActivitySound('drop');

        // Clear validation styling when changing selection
        clearFeedbackForQuestion(button.name);

        const activityId = location.pathname
            .substring(location.pathname.lastIndexOf("/") + 1)
            .split(".")[0];


        const areaId = button.closest("[data-area-id]")?.getAttribute("data-area-id") || "default";
        const storageKey = `${activityId}_${areaId}_${button.name}`;

        const selectedData = {
            question: button.name,
            value: button.value,
            dataActivityItem: button.getAttribute("data-activity-item"),
            areaId: areaId
        };

        // Guardar en localStorage con `activityId` y `data-area-id`
        localStorage.setItem(storageKey, JSON.stringify(selectedData));

        setState('selectedButton', button);
    });
};

// Add a new function to clear feedback for a specific question
const clearFeedbackForQuestion = (questionName) => {
    // Find all radio buttons for this question
    const radioButtons = document.querySelectorAll(`section input[name="${questionName}"]`);

    radioButtons.forEach(radio => {
        // Get the label containing this radio button
        const parentLabel = radio.closest('label');
        if (!parentLabel) {
            console.warn("No parent label found for radio button");
            return;
        }

        // Reset validation mark - it's inside the div, not directly under the parentLabel
        const buttonDiv = parentLabel.querySelector('div');
        if (buttonDiv) {
            const validationMark = buttonDiv.querySelector(".validation-mark");
            if (validationMark) {
                validationMark.classList.add('hidden');
                validationMark.textContent = '';
            } else {
                console.warn("No validation mark found in button div");
            }

            // Reset button styling - need to remove ALL color classes
            buttonDiv.classList.remove(
                'bg-green-500', 'bg-red-500',
                'text-white', 'text-green-700', 'text-red-700'
            );

            // Restore original styling
            buttonDiv.classList.add('bg-gray-200');

            // If this button is checked, apply the blue style
            if (radio.checked) {
                buttonDiv.classList.add('bg-blue-500', 'text-white');
            } else {
                // Make sure peer-checked styles are applied correctly
                buttonDiv.classList.add('peer-checked:bg-blue-500', 'peer-checked:text-white');
            }
        } else {
            console.warn("No button div found for radio");
        }

        // Remove any aria attributes and screen reader feedback
        parentLabel.removeAttribute('aria-invalid');
        const srFeedback = parentLabel.querySelector('.sr-validation-feedback');
        if (srFeedback) {
            srFeedback.remove();
        }
    });

    // Announce the change to screen readers
    const announcement = document.getElementById('validation-results-announcement');
    if (announcement) {
        announcement.textContent = translateText('selection-changed-resubmit');
    }
};

export const checkTrueFalse = () => {
    clearPreviousFeedback();
    const allQuestions = [1, 2, 3, 4, 5];
    const validationResults = validateAllQuestions(allQuestions);

    playAppropriateSound(validationResults.allCorrect);
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

    // Announce results to screen readers
    const resultsAnnouncement = document.getElementById('validation-results-announcement') ||
        createResultsAnnouncementElement();

    if (validationResults.allCorrect) {
        resultsAnnouncement.textContent = translateText("Todas las respuestas son correctas");
        // Obtener el ID de la actividad desde la URL
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

        executeMail(ActivityTypes.TRUE_FALSE);

    } else {
        // Count incorrect answers
        const incorrectCount = validationResults.incorrectQuestions?.length || 0;

        if (incorrectCount > 0) {
            resultsAnnouncement.textContent = translateText("Hay " + incorrectCount + " respuestas incorrectas. Por favor, revisa tus respuestas e intenta de nuevo.");
        } else {
            resultsAnnouncement.textContent = translateText("Hay algunas respuestas sin contestar. Por favor, completa todas las preguntas.");
        }
    }
    updateSubmitButtonAndToast(
        validationResults.allCorrect,
        translateText("next-activity"),
        ActivityTypes.TRUE_FALSE
    );


};

// Create an element to announce results to screen readers
const createResultsAnnouncementElement = () => {
    const announcementElement = document.createElement('div');
    announcementElement.id = 'validation-results-announcement';
    announcementElement.className = 'sr-only';
    announcementElement.setAttribute('role', 'status');
    announcementElement.setAttribute('aria-live', 'assertive');
    document.body.appendChild(announcementElement);
    return announcementElement;
};

const clearPreviousFeedback = () => {
    document.querySelectorAll(".feedback").forEach(el => el.remove());
    document.querySelectorAll(".validation-mark").forEach(mark => {
        mark.classList.add('hidden');
        mark.textContent = '';
    });
};

const validateAllQuestions = (allQuestions) => {
    let allCorrect = true;
    let allAnswered = true;
    const incorrectQuestions = [];

    allQuestions.forEach(questionNum => {
        const selectedButton = document.querySelector(
            `input[name="question${questionNum}"]:checked`
        );

        if (!selectedButton) {
            allCorrect = false;
            allAnswered = false;
            return;
        }

        const validationResult = validateQuestion(selectedButton);
        if (!validationResult) {
            allCorrect = false;
            incorrectQuestions.push(questionNum);
        }
    });

    return { allCorrect, allAnswered, incorrectQuestions };
};

const validateQuestion = (selectedButton) => {
    const dataActivityItem = selectedButton.getAttribute("data-activity-item");
    const selectedValue = selectedButton.value;
    const expectedAnswer = correctAnswers[dataActivityItem];
    const isCorrect = expectedAnswer === selectedValue;

    updateValidationDisplay(selectedButton, isCorrect);

    return isCorrect;
};

const updateValidationDisplay = (selectedButton, isCorrect) => {
    const validationMark = getValidationMark(selectedButton);
    if (validationMark) {
        updateValidationMark(validationMark, isCorrect);
    }

    updateButtonStyling(selectedButton, isCorrect);

    // Add accessible text for screen readers
    updateScreenReaderFeedback(selectedButton, isCorrect);
};

const updateScreenReaderFeedback = (button, isCorrect) => {
    // Find the parent label or closest container
    const parentLabel = button.closest('label');

    if (parentLabel) {
        // Add screen reader feedback
        let srFeedback = parentLabel.querySelector('.sr-validation-feedback');

        if (!srFeedback) {
            srFeedback = document.createElement('span');
            srFeedback.className = 'sr-only sr-validation-feedback';
            parentLabel.appendChild(srFeedback);
        }

        srFeedback.textContent = isCorrect ?
            translateText("Esta respuesta es correcta") :
            translateText("Esta respuesta es incorrecta");
    }
};

const getValidationMark = (button) => {
    const validationMark = button.parentElement.querySelector(".validation-mark");
    if (validationMark) {
        validationMark.classList.remove('hidden');
    }
    return validationMark;
};

const updateValidationMark = (mark, isCorrect) => {
    const baseClasses = 'text-lg font-bold bg-white rounded-full w-6 h-6 flex items-center justify-center';

    if (isCorrect) {
        mark.textContent = '✓';
        mark.className = `validation-mark ${baseClasses} text-green-600`;
        // Add aria-label to mark for screen readers
        mark.setAttribute('aria-label', translateText("Respuesta correcta"));
    } else {
        mark.textContent = '✗';
        mark.className = `validation-mark ${baseClasses} text-red-600`;
        // Add aria-label to mark for screen readers
        mark.setAttribute('aria-label', translateText("Respuesta incorrecta"));
    }
};

const updateButtonStyling = (button, isCorrect) => {
    const buttonDiv = button.parentElement.querySelector('div');
    if (buttonDiv) {
        buttonDiv.classList.remove('bg-gray-200', 'bg-green-500', 'bg-red-500', 'peer-checked:bg-blue-500');
        buttonDiv.classList.add(isCorrect ? 'bg-green-500' : 'bg-red-500');

        // Set the proper ARIA attributes
        const parentLabel = button.closest('label');
        if (parentLabel) {
            parentLabel.setAttribute('aria-invalid', isCorrect ? 'false' : 'true');
        }
    }
};

const playAppropriateSound = (allCorrect) => {
    playActivitySound(allCorrect ? 'success' : 'error');
};

export const retryTrueFalse = () => {
    clearPreviousFeedback();
    resetButtonStates();
    setState('selectedButton', null);

    // Clear screen reader announcements
    const resultsAnnouncement = document.getElementById('validation-results-announcement');
    if (resultsAnnouncement) {
        resultsAnnouncement.textContent = '';
    }

    // Remove SR feedback elements
    document.querySelectorAll('.sr-validation-feedback').forEach(el => el.remove());
};

const resetButtonStates = () => {
    document.querySelectorAll("section input[type='radio']").forEach(button => {
        button.checked = false;
        const buttonDiv = button.parentElement.querySelector('div');
        if (buttonDiv) {
            buttonDiv.classList.remove('bg-green-500', 'bg-red-500');
            buttonDiv.classList.add('bg-gray-200', 'peer-checked:bg-blue-500');
        }

        // Reset ARIA attributes
        const parentLabel = button.closest('label');
        if (parentLabel) {
            parentLabel.removeAttribute('aria-invalid');
        }
    });
};