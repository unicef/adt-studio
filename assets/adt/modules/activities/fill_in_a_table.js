import { playActivitySound } from '../audio.js';
import { ActivityTypes, updateSubmitButtonAndToast, provideFeedback } from '../utils.js';
import { countUnfilledInputs } from './fill_in_the_blank.js';
import { translateText } from '../translations.js';
import { checkForGibberish } from './validation.js';
import { executeMail } from './send-email.js';
import TextValidator from './textvalidator.js';

export const prepareFillInTable = (section) => {
    const inputs = section.querySelectorAll('input[type="text"]:not(#filter-input), textarea:not(#filter-input)');
    setupTableInputs(inputs);
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


const setupTableInputs = (inputs) => {
    inputs.forEach(input => {
        input.addEventListener('input', handleTableInputChange);
        input.addEventListener('focus', handleTableInputFocus);
        input.addEventListener('blur', handleTableInputBlur);

        // Add table-specific styling
        input.classList.add(
            'border',
            'border-gray-300',
            'rounded',
            'p-2',
            'w-full',
            'transition-colors',
            'duration-200'
        );
    });
};

const handleTableInputChange = (event) => {
    const input = event.target;
    clearTableInputValidationFeedback(input);

    saveTableInputState(input);

    // Reset the cell and input styling completely
    const cell = input.closest('td, th');
    if (cell) {
        cell.classList.remove('bg-red-50', 'bg-green-50', 'border-red-300', 'border-green-300');
    }

    // Remove all validation styling from the input itself
    input.classList.remove(
        'border-green-500', 'focus:border-green-500', 'focus:ring-green-200',
        'border-red-500', 'focus:border-red-500', 'focus:ring-red-200',
        'border-orange-500', 'focus:border-orange-500', 'focus:ring-orange-200',
        'focus:ring'
    );

    //validateTableInput(input);

};

const handleTableInputFocus = (event) => {
    const input = event.target;
    input.classList.add('border-blue-500', 'ring-2', 'ring-blue-200');

    // Highlight related cells if they exist
    highlightRelatedCells(input);
};

const handleTableInputBlur = (event) => {
    const input = event.target;
    input.classList.remove('border-blue-500', 'ring-2', 'ring-blue-200');

    // Remove highlight from related cells
    unhighlightRelatedCells(input);
};

export const checkTableInputs = () => {

    const inputs = document.querySelectorAll('section input[type="text"]:not(#filter-input), section textarea:not(#filter-input)');
    clearTableFeedback();

    const validationResult = validateTableInputs(inputs);
    const hasGibberish = checkForGibberish(inputs);

    // Add gibberish check to validation result object
    const enhancedValidationResult = {
        ...validationResult,
        hasGibberish,
        // Calculate a final validity result that includes both checks
        isValid: validationResult.allFilled && hasGibberish
    };

    handleTableValidationResult(enhancedValidationResult);
};

const clearTableFeedback = () => {
    document.querySelectorAll(".feedback").forEach(el => el.remove());
    document.querySelectorAll(".cell-highlight").forEach(el => {
        el.classList.remove('cell-highlight', 'bg-blue-50');
    });
};

const validateTableInputs = (inputs) => {
    let allFilled = true;
    let unfilledCount = 0;
    let correctCount = 0;
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

    // Check filled-not-required class is on the table.
    const filledNotRequired = document.getElementsByClassName("filled-not-required").length > 0;

    inputs.forEach(input => {
        const validation = validateSingleTableInput(input);
        if (!validation.isFilled) {
            allFilled = false;
            unfilledCount++;
        }
        if (validation.isCorrect) {
            correctCount++;
        }
    });

    if (filledNotRequired) {
        allFilled = true;
        unfilledCount = 0;
    }

    return { allFilled, unfilledCount, correctCount };
};

const validateSingleTableInput = (input) => {
    const value = input.value.trim();
    const dataActivityItem = input.getAttribute("data-activity-item");
    const dataAriaId = input.getAttribute("data-aria-id");

    // Check if this table is "filled-not-required"
    const filledNotRequired = document.getElementsByClassName("filled-not-required").length > 0;

    let correctAnswer;
    try {
        // First check if we have a global correctAnswers object
        if (typeof correctAnswers !== 'undefined' && correctAnswers[dataActivityItem]) {
            correctAnswer = correctAnswers[dataActivityItem];
        } else if (typeof correctAnswers !== 'undefined' && correctAnswers[dataAriaId]) {
            // Try using data-aria-id if data-activity-item didn't work
            correctAnswer = correctAnswers[dataAriaId];
            // } else if (input.getAttribute("data-correct-answer")) {
            //     // Otherwise check for inline data-correct-answer attribute
            //     correctAnswer = input.getAttribute("data-correct-answer");
        } else {
            // If no correct answer is defined, accept any non-empty input
            correctAnswer = null;
        }
    } catch (error) {
        console.warn("Could not retrieve correct answer:", error);
        correctAnswer = null;
    }

    // Determine if the input is valid
    const isFilled = value !== "";

    // For tables with filled-not-required, we should treat empty fields as valid
    const isCorrect = filledNotRequired && !isFilled ?
        true : // Empty is fine when not required
        (correctAnswer ? correctAnswer.toLowerCase() === value.toLowerCase() : isFilled);

    if (!(filledNotRequired && !isFilled)) {
        // Only provide feedback for filled fields or when filling is required
        provideFeedback(
            input,
            isCorrect,
            correctAnswer,
            ActivityTypes.FILL_IN_A_TABLE
        );

        // Update styling only for filled fields or when filling is required
        updateTableCellStyle(input, isFilled, isCorrect);
    } else {
        // For empty fields in optional tables, clear any validation styling
        clearTableInputValidationFeedback(input);
    }

    return { isFilled, isCorrect: filledNotRequired ? true : isCorrect };
};

const updateTableCellStyle = (input, isFilled, isCorrect) => {
    const cell = input.closest('td, th');
    if (!cell) return;

    // Remover clases previamente aplicadas
    cell.classList.remove('bg-red-50', 'bg-green-50', 'border-red-300', 'border-green-300');

    if (isFilled) {
        if (isCorrect) {
            cell.classList.add('bg-green-50', 'border-green-300');
        } else {
            cell.classList.add('bg-red-50', 'border-red-300');
        }
    }
};

// Add this function to clear validation feedback specifically for table inputs

const clearTableInputValidationFeedback = (input) => {
    // Get identifiers
    const dataActivityItem = input.getAttribute("data-activity-item");
    const dataAriaId = input.getAttribute("data-aria-id");
    const inputId = input.id || '';

    // Clear icon feedback
    const selectors = [
        `.feedback-icon-for-${dataActivityItem}`,
        `.feedback-icon-for-${dataAriaId}`,
        `.feedback-icon-for-${inputId}`
    ];

    selectors.forEach(selector => {
        const icons = document.querySelectorAll(selector);
        icons.forEach(icon => {
            if (icon && (icon.parentNode === input.parentNode || icon.closest('td') === input.closest('td'))) {
                icon.remove();
            }
        });
    });

    // Reset input styling
    input.classList.remove(
        "border-green-500", "focus:border-green-500", "focus:ring-green-200",
        "border-red-500", "focus:border-red-500", "focus:ring-red-200",
        "focus:ring"
    );

    // Reset cell styling
    const cell = input.closest('td, th');
    if (cell) {
        cell.classList.remove('bg-red-50', 'bg-green-50', 'border-red-300', 'border-green-300');
    }

    // Reset ARIA attributes
    input.removeAttribute("aria-invalid");
    const originalLabel = input.getAttribute("aria-label") || "";
    if (originalLabel.includes(" - ")) {
        input.setAttribute("aria-label", originalLabel.split(" - ")[0]);
    }

    // Remove padding if it was added
    input.style.paddingRight = '';
};

const handleTableValidationResult = (validationResult) => {
    const { allFilled, unfilledCount, correctCount, hasGibberish, isValid } = validationResult;

    if (allFilled && isValid) {
        playActivitySound('success');
        localStorage.setItem("namePage", document.querySelector("h1")?.innerText ?? "unknown_page")

        // Obtener el ID de la actividad desde la URL
        const activityId = location.pathname
            .substring(location.pathname.lastIndexOf("/") + 1)
            .split(".")[0];


        // Recuperar el arreglo de actividades completadas del localStorage
        let key = activityId + "-intentos";
        let intentCount = localStorage.getItem(key);
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

        executeMail(ActivityTypes.FILL_IN_A_TABLE);
    } else {
        playActivitySound('error');
    }

    updateSubmitButtonAndToast(
        allFilled && isValid,
        translateText("next-activity"),
        ActivityTypes.FILL_IN_A_TABLE,
        unfilledCount,
    );
};

const validateTableInput = (input) => {
    const value = input.value.trim();
    const dataActivityItem = input.getAttribute("data-activity-item");

    let correctAnswer;
    try {
        correctAnswer = correctAnswers?.[dataActivityItem] ?? null;
    } catch (error) {
        correctAnswer = null;
    }

    const isFilled = value !== "";
    const isValid = correctAnswer ? correctAnswer.toLowerCase() === value.toLowerCase() : isFilled;

    updateTableInputValidationStyle(input, isValid);
};

const updateTableInputValidationStyle = (input, isValid) => {
    const cell = input.closest('td, th');
    if (!cell) return;

    input.classList.remove('border-red-500', 'border-green-500');
    cell.classList.remove('bg-red-50', 'bg-green-50');

    if (input.value.trim() !== "") {
        input.classList.add(isValid ? 'border-green-500' : 'border-red-500');
        cell.classList.add(isValid ? 'bg-green-50' : 'bg-red-50');
    }
};

const saveTableInputState = (input) => {
    const activityId = location.pathname
        .substring(location.pathname.lastIndexOf("/") + 1)
        .split(".")[0];

    // Use data-aria-id as the primary identifier, fall back to id or data-activity-item
    const inputId = input.getAttribute("data-aria-id") || input.id || input.getAttribute("data-activity-item");

    if (!inputId) {
        console.warn("Input element has no identifier for storage:", input);
        return;
    }

    const localStorageKey = `${activityId}_${inputId}`;
    localStorage.setItem(localStorageKey, input.value);
};

const loadInputState = (inputs) => {
    inputs.forEach((input) => {
        const activityId = location.pathname
            .substring(location.pathname.lastIndexOf("/") + 1)
            .split(".")[0];

        // Use data-aria-id as the primary identifier, fall back to id or data-activity-item
        const inputId = input.getAttribute("data-aria-id") || input.id || input.getAttribute("data-activity-item");

        if (!inputId) {
            console.warn("Input element has no identifier for loading:", input);
            return;
        }

        const localStorageKey = `${activityId}_${inputId}`;
        const savedValue = localStorage.getItem(localStorageKey);

        if (savedValue !== null) {
            input.value = savedValue;

            // Optionally validate the input after loading to show feedback
            // This makes the saved state visually validated immediately on page load
            validateTableInput(input);
        }
    });

    // Store the page name for activity completion tracking
    localStorage.setItem("namePage", document.querySelector("h1")?.innerText || document.title);
};

const highlightRelatedCells = (input) => {
    const cell = input.closest('td, th');
    if (!cell) return;

    const rowIndex = cell.parentElement.rowIndex;
    const cellIndex = cell.cellIndex;
    const table = cell.closest('table');

    if (!table) return;

    // Highlight row
    const row = table.rows[rowIndex];
    Array.from(row.cells).forEach(cell => {
        cell.classList.add('bg-blue-50', 'cell-highlight');
    });

    // Highlight column
    Array.from(table.rows).forEach(row => {
        const cell = row.cells[cellIndex];
        if (cell) {
            cell.classList.add('bg-blue-50', 'cell-highlight');
        }
    });
};

const unhighlightRelatedCells = (input) => {
    document.querySelectorAll('.cell-highlight').forEach(cell => {
        cell.classList.remove('bg-blue-50', 'cell-highlight');
    });
};

// Export utility functions that might be needed by other modules
export {
    validateTableInput,
    saveTableInputState,
    countUnfilledInputs
};