import { setCookie, getCookie } from "./cookies.js";
import { state } from "./state.js";
import { translateText } from "./translations.js";

/**
 * @module notepad
 * @description
 * Utilities for managing the user notepad: toggling visibility, saving/loading notes, and persisting state.
 */

/**
 * Initializes the notepad button by making it visible if present.
 */
export const initializeNotepad = () => {
  // Show notepad button if not already shown
  const notepadButton = document.getElementById("notepad-button");
  if (notepadButton) {
    notepadButton.classList.remove("hidden");
  }
}

/**
 * Toggles the notepad open or closed, updates state and cookies, and saves/loads notes as needed.
 */
export const toggleNotepad = () => {
  const notepadContent = document.getElementById("notepad-content");
  const notepadButton = document.getElementById("notepad-button");

  if (notepadContent) {
    const isVisible = !notepadContent.classList.contains("hidden");

    if (isVisible) {
      state.notepadOpen = false; // Update state to indicate notepad is closed
      setCookie("notepadOpen", "false", 30); // Set cookie to indicate notepad is closed
      // Hide notepad
      notepadContent.classList.add("hidden");
      notepadButton.setAttribute("aria-expanded", "false");

      // Save notes when closing
      saveNotes();
    } else {
      state.notepadOpen = true; // Update state to indicate notepad is closed
      setCookie("notepadOpen", "true", 30); // Set cookie to indicate notepad is closed
      // Show notepad
      notepadContent.classList.remove("hidden");
      notepadButton.setAttribute("aria-expanded", "true");

      // Focus the textarea
      const textarea = document.getElementById("notepad-textarea");
      if (textarea) {
        setTimeout(() => textarea.focus(), 100);
      }

      // Load notes
      loadSavedNotes();
    }
  }
}

/**
 * Saves the current notes from the textarea to localStorage and shows a confirmation message.
 */
export const saveNotes = () => {
  const textarea = document.getElementById("notepad-textarea");
  const saveStatus = document.getElementById("notepad-save-status");

  if (textarea) {
    // Save to localStorage
    localStorage.setItem("user_notepad", textarea.value);

    // Show save confirmation
    if (saveStatus) {
      saveStatus.textContent = translateText("notepad-save-success");
      saveStatus.classList.remove("opacity-0");
      saveStatus.classList.add("opacity-100");

      // Hide confirmation after 2 seconds
      setTimeout(() => {
        saveStatus.classList.remove("opacity-100");
        saveStatus.classList.add("opacity-0");
      }, 2000);
    }
  }
}

/**
 * Loads saved notes from localStorage into the textarea, if any exist.
 */
export const loadSavedNotes = () => {
  const textarea = document.getElementById("notepad-textarea");

  if (textarea) {
    const savedNotes = localStorage.getItem("user_notepad");
    if (savedNotes !== null) {
      textarea.value = savedNotes;
    }
  }
}

/**
 * Loads the notepad state from cookies and opens the notepad if it was previously open.
 */
export const loadNotepad = () => {
  const notepadOpen = getCookie("notepadOpen") == "true";
  if (notepadOpen) {
    toggleNotepad();
  }
}