/**
 * @module error_utils
 * @description
 * Utilities for error handling, displaying error toasts, and safely showing main content.
 */

/**
 * Handles initialization errors gracefully.
 * @param {Error} error - The error that occurred during initialization.
 */
export const handleInitializationError = (error) => {
    console.error('Application initialization failed:', error?.message || 'Unknown error');

    // Show main content even if initialization fails
    showMainContent();

    // Show specific error message based on error type
    let errorMessage = 'Error initializing application. Some features may be unavailable.';

    if (error instanceof ReferenceError) {
        errorMessage = 'Application configuration error. Please refresh the page.';
    } else if (error instanceof TypeError) {
        errorMessage = 'Interface elements not found. Please check your connection.';
    } else if (error.message?.includes('fetch')) {
        errorMessage = 'Failed to load required components. Please check your connection.';
    }

    showErrorToast(errorMessage);
};

/**
 * Displays an error message in a toast notification.
 * @param {string} message - Error message to display.
 */
export const showErrorToast = (message) => {
    try {
        const toast = document.getElementById("toast");
        if (!toast) {
            // Create toast element if it doesn't exist
            createToastElement(message);
            return;
        }

        updateToast(toast, message);
    } catch (error) {
        // Fallback error display
        console.error('Failed to show error toast:', error);
        alert(message);
    }
};

/**
 * Creates a toast element if it doesn't exist and displays a message.
 * @private
 * @param {string} message - Message to display.
 */
const createToastElement = (message) => {
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'fixed bottom-20 right-5 px-4 py-2 rounded-md shadow-lg z-50';
    document.body.appendChild(toast);
    updateToast(toast, message);
};

/**
 * Updates toast content and styling.
 * @private
 * @param {HTMLElement} toast - Toast element.
 * @param {string} message - Message to display.
 */
const updateToast = (toast, message) => {
    toast.textContent = message;
    toast.classList.remove("hidden");
    toast.classList.add("bg-red-200", "text-red-700");

    setTimeout(() => {
        toast.classList.add("hidden");
    }, 5000);
};

/**
 * Shows the main content by removing hiding classes and making containers visible.
 */
export const showMainContent = () => {
    try {
        // Remove hidden class from body immediately
        document.body.classList.remove('hidden');

        // Show main content
        const mainContent = document.querySelector('.container');
        if (mainContent) {
            mainContent.classList.remove('opacity-0', 'invisible', 'hidden');
            mainContent.classList.add('opacity-100', 'visible');
        }

        // Also ensure any potential container is visible
        const container = document.getElementById('content');
        if (container) {
            container.classList.remove('hidden', 'opacity-0', 'invisible');
            container.classList.add('visible', 'opacity-100');
        }

        // Remove any other hiding classes that might be present
        document.querySelectorAll('.initial-hidden').forEach(el => {
            el.classList.remove('initial-hidden', 'hidden');
        });

    } catch (error) {
        console.error('Error showing main content:', error);
        // Fallback: Brute force show everything
        document.body.style.display = 'block';
        document.body.style.opacity = '1';
        document.body.style.visibility = 'visible';
    }
};

// Force show content after a timeout as a fallback
const SHOW_CONTENT_TIMEOUT = 2000; // 2 seconds
setTimeout(() => {
    if (document.body.classList.contains('hidden')) {
        console.warn('Forcing content display after timeout');
        showMainContent();
    }
}, SHOW_CONTENT_TIMEOUT);

/**
 * Safely finds an element by ID and executes a callback if it exists.
 * @param {string} elementId - ID of the element to find.
 * @param {Function} callback - Function to execute if element exists.
 * @returns {boolean} - Whether the operation was successful.
 */
export const safeElementCall = (elementId, callback) => {
    try {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`Element with id '${elementId}' not found`);
            return false;
        }
        if (typeof callback !== 'function') {
            console.warn('Invalid callback provided');
            return false;
        }

        callback(element);
        return true;
    } catch (error) {
        console.error(`Error in safeElementCall for '${elementId}':`, error);
        return false;
    }
};