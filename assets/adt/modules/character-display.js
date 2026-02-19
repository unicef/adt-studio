// Character display script for index page
import { generateRandomCharacterName, getCharacterGreeting, generateStudentID } from './character-generator.js';
import { setState } from './state.js';
import { announceToScreenReader } from './ui_utils.js';
import { translateText } from './translations.js';

/**
 * Generate a new character and update the display and localStorage
 */
function regenerateCharacter() {
  // Generate a new character
  const character = generateRandomCharacterName();

  // Get the existing student ID (don't regenerate it)
  const studentID = localStorage.getItem('studentID');

  // Save to localStorage
  localStorage.setItem('characterInfo', JSON.stringify(character));
  localStorage.setItem('nameUser', character.fullName);

  // Update state
  setState('characterName', character.fullName);
  setState('characterEmoji', character.emoji);
  setState('studentID', studentID);

  //   // Generate a new greeting
  //   const greeting = getCharacterGreeting(character.fullName);
  //   setState('characterGreeting', greeting);

  // Update UI elements
  updateCharacterDisplay(character, studentID);

  // Also update the character in the sidebar
  updateSidebarCharacter(character, studentID);

  // // Announce the new character to screen readers
  // announceToScreenReader(
  //   `Nuevo personaje generado: ${character.fullName}`
  // );

  // Announce the new character to screen readers

  announceToScreenReader(
    translateText("character-regenerated-announcement") + character.fullName
  );

  // Add a small animation to the emoji
  const emojiElement = document.getElementById('character-emoji');
  if (emojiElement) {
    emojiElement.classList.add('animate-bounce');
    setTimeout(() => {
      emojiElement.classList.remove('animate-bounce');
    }, 1000);
  }
}

/**
 * Update the character display with the given character info
 */
function updateCharacterDisplay(character, studentID) {
  // Find all character-name elements (there might be multiple on the page)
  const nameElements = document.querySelectorAll('#character-name');
  const emojiElements = document.querySelectorAll('#character-emoji');
  const studentIDElements = document.querySelectorAll('#student-id');
  //const messageElement = document.getElementById('character-message');

  // Update all name elements
  nameElements.forEach(element => {
    if (element) element.textContent = character.fullName;
  });

  // Update all emoji elements
  emojiElements.forEach(element => {
    if (element) element.textContent = character.emoji;
  });

  // Update student ID elements
  studentIDElements.forEach(element => {
    if (element) element.textContent = studentID;
  });

  // Update the message element
  //   if (messageElement) {
  //     messageElement.textContent = greeting;
  //   }
}

/**
 * Update the character display in the sidebar
 */
function updateSidebarCharacter(character, studentID) {
  // Update the character name in the sidebar
  const sidebarNameElement = document.getElementById('settings-character-name');
  if (sidebarNameElement) {
    sidebarNameElement.textContent = character.fullName;
  }

  // Update the character emoji in the sidebar
  const sidebarEmojiElement = document.getElementById('settings-character-emoji');
  if (sidebarEmojiElement) {
    sidebarEmojiElement.textContent = character.emoji;
  }

  // The student ID is already updated in updateCharacterDisplay function
  // as it selects all elements with the ID 'student-id'
}

/**
 * Initializes the character display on the index page
 */
function initCharacterDisplay() {
  // Check if we already have a student ID in localStorage
  let studentID = localStorage.getItem('studentID');

  // If no student ID exists, generate and save one
  if (!studentID) {
    studentID = generateStudentID();
    localStorage.setItem('studentID', studentID);
  }

  // Store the student ID in state
  setState('studentID', studentID);

  // Check if we already have a character in localStorage
  const existingCharacter = localStorage.getItem('characterInfo');
  let character;

  if (existingCharacter) {
    // Use the existing character
    character = JSON.parse(existingCharacter);
  } else {
    // Generate a new character and save to localStorage
    character = generateRandomCharacterName();
    localStorage.setItem('characterInfo', JSON.stringify(character));

    // Also save the character name as nameUser for the send-email.js function
    localStorage.setItem('nameUser', character.fullName);
  }

  // Store the character in state for use across the application
  setState('characterName', character.fullName);
  setState('characterEmoji', character.emoji);

  //   // Generate a greeting with the character name
  //   const greeting = getCharacterGreeting(character.fullName);
  //   setState('characterGreeting', greeting);

  // Update the display
  updateCharacterDisplay(character, studentID);

  // Also update the sidebar character display
  updateSidebarCharacter(character, studentID);

  // Set up the refresh button event handler
  const refreshButton = document.getElementById('refresh-character');
  if (refreshButton) {
    refreshButton.addEventListener('click', regenerateCharacter);
  }
}

export { initCharacterDisplay, regenerateCharacter };