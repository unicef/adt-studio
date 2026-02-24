import { state, setState } from '../state.js';
import { playActivitySound, gatherAudioElements, stopAudio } from '../audio.js';
import { updateSubmitButtonAndToast, ActivityTypes } from '../utils.js';
import { translateText } from '../translations.js';
import { executeMail } from './send-email.js';
import { updateResetButtonVisibility } from '../../activity.js';
import { highlightElement, unhighlightElement, updatePlayPauseIcon } from '../ui_utils.js';

const QUIZ_SECTION_SELECTOR = 'section[role="activity"][data-section-type="activity_quiz"]';
const CORRECT_ANSWERS_SCRIPT_ID = 'quiz-correct-answers';
const EXPLANATIONS_SCRIPT_ID = 'quiz-explanations';
const QUIZ_SHORTCUT_KEYS = ['1', '2', '3'];
let quizShortcutHandlerRegistered = false;

const getSubmitButton = () => document.getElementById('submit-button');

const disableQuizSubmitButton = () => {
  const submitButton = getSubmitButton();
  if (!submitButton) {
    return;
  }

  submitButton.setAttribute('disabled', 'true');
  submitButton.setAttribute('aria-disabled', 'true');
  submitButton.setAttribute('tabindex', '-1');
  submitButton.classList.add('opacity-50', 'cursor-not-allowed');
};

const enableQuizSubmitButton = () => {
  const submitButton = getSubmitButton();
  if (!submitButton) {
    return;
  }

  submitButton.removeAttribute('disabled');
  submitButton.removeAttribute('aria-disabled');
  submitButton.removeAttribute('tabindex');
  submitButton.classList.remove('opacity-50', 'cursor-not-allowed');
};
const focusQuizSubmitButton = () => {
  const submitButton = getSubmitButton();
  if (!submitButton) {
    return;
  }

  submitButton.classList.remove('hidden');
  submitButton.removeAttribute('aria-hidden');
  submitButton.removeAttribute('tabindex');

  requestAnimationFrame(() => {
    if (typeof submitButton.focus === 'function') {
      try {
        submitButton.focus({ preventScroll: true });
      } catch (_error) {
        submitButton.focus();
      }
    }
  });
};

const focusFirstQuizOption = () => {
  const quizSection = document.querySelector(QUIZ_SECTION_SELECTOR);
  if (!quizSection) {
    return;
  }

  const firstOption = quizSection.querySelector('.activity-option');
  if (!firstOption) {
    return;
  }

  const radio = firstOption.querySelector('input[type="radio"]');
  const target = radio || firstOption;

  requestAnimationFrame(() => {
    if (typeof target.focus === 'function') {
      try {
        target.focus({ preventScroll: true });
      } catch (_error) {
        target.focus();
      }
    }
  });
};

const ensureValidationLiveRegion = () => {
  if (document.getElementById('validation-results-announcement')) {
    return;
  }

  const announcement = document.createElement('div');
  announcement.id = 'validation-results-announcement';
  announcement.className = 'sr-only';
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  document.body.appendChild(announcement);
};

const applyQuizBackground = () => {
  document.body.style.backgroundColor = '#FFFAF5';
};

const parseJsonScriptContent = (elementId) => {
  const scriptElement = document.getElementById(elementId);

  if (!scriptElement || !scriptElement.textContent) {
    return null;
  }

  try {
    return JSON.parse(scriptElement.textContent);
  } catch (error) {
    console.warn(`activity_quiz: unable to parse JSON for ${elementId}`, error);
    return null;
  }
};

const mergeIntoWindow = (targetKey, data) => {
  if (!data || typeof data !== 'object') {
    return;
  }

  const existing = window[targetKey] || {};
  window[targetKey] = { ...existing, ...data };
};

const hydrateQuizData = () => {
  const correctAnswers = parseJsonScriptContent(CORRECT_ANSWERS_SCRIPT_ID);
  mergeIntoWindow('correctAnswers', correctAnswers);

  const explanations = parseJsonScriptContent(EXPLANATIONS_SCRIPT_ID);
  mergeIntoWindow('multipleChoiceExplanations', explanations);
};

const getQuizActivityId = () =>
  location.pathname.substring(location.pathname.lastIndexOf('/') + 1).split('.')[0];

const getAreaId = (element) =>
  element.closest('[data-area-id]')?.getAttribute('data-area-id') || 'default';

const restoreQuizSubmitButtonToValidate = () => {
  const submitButton = document.getElementById('submit-button');
  if (!submitButton || submitButton.dataset.submitState !== 'retry') {
    return;
  }

  submitButton.textContent = translateText('submit-text');
  submitButton.setAttribute('aria-label', translateText('submit-text'));
  submitButton.dataset.submitState = 'submit';

  if (state.retryHandler) {
    submitButton.removeEventListener('click', state.retryHandler);
    state.retryHandler = null;
  }

  if (state.validateHandler) {
    submitButton.removeEventListener('click', state.validateHandler);
    submitButton.addEventListener('click', state.validateHandler);
  }
};

const saveQuizSelectionState = (option) => {
  const activityId = getQuizActivityId();
  const areaId = getAreaId(option);
  const storageKey = `${activityId}_${areaId}_quiz`;

  const selectedData = {
    question: option.getAttribute('data-activity-item'),
    value: option.querySelector('input[type="radio"]').value,
    areaId
  };

  localStorage.setItem(storageKey, JSON.stringify(selectedData));
};

const restoreQuizSelection = (section) => {
  const activityId = getQuizActivityId();
  const areaId = section.querySelector('[data-area-id]')?.getAttribute('data-area-id') || 'default';
  const storageKey = `${activityId}_${areaId}_quiz`;

  const savedSelection = localStorage.getItem(storageKey);
  if (savedSelection) {
    const { value } = JSON.parse(savedSelection);
    const selectedOption = [...section.querySelectorAll('.activity-option')].find((option) =>
      option.querySelector('input[type="radio"]').value === value
    );

    if (selectedOption) {
      markQuizSelection(selectedOption);
      setState('quizSelectedOption', selectedOption);
      enableQuizSubmitButton();
      return;
    }
  }

  disableQuizSubmitButton();
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

const clearQuizValidationStyling = () => {
  const quizSection = document.querySelector(QUIZ_SECTION_SELECTOR) || document;
  let audioBindingsCleared = false;

  quizSection.querySelectorAll('.validation-mark').forEach((mark) => {
    mark.classList.add('hidden');
    mark.textContent = '';
  });

  quizSection.querySelectorAll('.activity-option').forEach((option) => {
    option.classList.remove('bg-green-50', 'bg-red-50', 'selected-option');
    option.removeAttribute('aria-invalid');

    const feedback = option.querySelector('.feedback-container');
    if (feedback) {
      feedback.classList.add('hidden');
      const feedbackIcon = feedback.querySelector('.feedback-icon');
      const feedbackText = feedback.querySelector('.feedback-text');

      if (feedbackIcon) {
    const shadowInput = option.querySelector('input[type="radio"]');
    if (shadowInput) {
      shadowInput.setAttribute('tabindex', '-1');
    }
        feedbackIcon.className = 'feedback-icon';
        feedbackIcon.textContent = '';
      }

      if (feedbackText) {
        feedbackText.className = 'feedback-text';
        feedbackText.textContent = '';
        if (feedbackText.hasAttribute('data-id')) {
          feedbackText.removeAttribute('data-id');
          audioBindingsCleared = true;
        }
      }
    }

    setLetterAppearance(
      option,
      'w-8 h-8 aspect-square rounded-full border-2 border-gray-300 flex items-center justify-center',
      'option-letter text-gray-500'
    );
  });

  const validationResults = document.getElementById('validation-results-announcement');
  if (validationResults) {
    validationResults.textContent = translateText('selection-changed-resubmit');
  }

  if (audioBindingsCleared) {
    gatherAudioElements();
  }
};

const resetQuizOptions = (radioGroup) => {
  radioGroup.querySelectorAll('.activity-option').forEach((option) => {
    option.setAttribute('aria-checked', 'false');

    setLetterAppearance(
      option,
      'w-8 h-8 aspect-square rounded-full border-2 border-gray-300 flex items-center justify-center',
      'option-letter text-gray-500'
    );

    option.classList.remove('bg-green-50', 'bg-red-50', 'selected-option');

    const feedback = option.querySelector('.feedback-container');
    if (feedback) {
      feedback.classList.add('hidden');
    }
  });
};

const markQuizSelection = (option) => {
  const input = option.querySelector('input[type="radio"]');
  if (input) {
    input.checked = true;
  }

  option.setAttribute('aria-checked', 'true');

  setLetterAppearance(
    option,
    'w-8 h-8 aspect-square rounded-full border-2 border-blue-500 bg-blue-500 flex items-center justify-center',
    'option-letter text-white'
  );

  option.classList.add('selected-option');
};

const getQuizActivityItem = (element) => {
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

const translateExplanationById = (explanationId) => {
  if (!explanationId) {
    return null;
  }

  const translated = translateText(explanationId);

  if (!translated) {
    return null;
  }

  if (state?.translations && Object.prototype.hasOwnProperty.call(state.translations, explanationId)) {
    return translated;
  }

  return translated !== explanationId ? translated : null;
};

const resolveQuizExplanation = (option) => {
  if (!option) {
    return { text: null, id: null };
  }

  const explanationId = option.getAttribute('data-explanation-id');
  const translatedFromId = translateExplanationById(explanationId);
  if (translatedFromId) {
    console.debug('activity_quiz: resolved explanation via data attribute', {
      explanationId,
      source: 'data-explanation-id'
    });
    return { text: translatedFromId, id: explanationId };
  }

  const activityItem = getQuizActivityItem(option);
  const globalExplanationKey = window?.multipleChoiceExplanations?.[activityItem];

  const translatedFromGlobal = translateExplanationById(globalExplanationKey);
  if (translatedFromGlobal) {
    console.debug('activity_quiz: resolved explanation via global map', {
      activityItem,
      explanationId: globalExplanationKey
    });
    return { text: translatedFromGlobal, id: globalExplanationKey };
  }

  if (globalExplanationKey) {
    console.debug('activity_quiz: using untranslated global explanation', {
      activityItem,
      explanationId: globalExplanationKey
    });
    return { text: globalExplanationKey, id: null };
  }

  const fallbackExplanation = option.getAttribute('data-explanation');
  if (fallbackExplanation) {
    console.debug('activity_quiz: using inline fallback explanation', {
      activityItem,
      fallbackExplanation
    });
  }
  return { text: fallbackExplanation || null, id: null };
};

const bindQuizFeedbackAudioId = (feedbackText, explanationId) => {
  if (!feedbackText) {
    return false;
  }

  const previousId = feedbackText.getAttribute('data-id');
  const normalizedExplanationId = explanationId ?? null;

  if (explanationId) {
    feedbackText.setAttribute('data-id', explanationId);
  } else {
    feedbackText.removeAttribute('data-id');
  }

  const changed = previousId !== normalizedExplanationId;
  if (changed) {
    console.debug('activity_quiz: updated feedback audio binding', {
      previousId,
      explanationId: normalizedExplanationId
    });
  }
  return changed;
};

const resolveQuizExplanationAudioSrc = (explanationId) => {
  if (!explanationId || !state?.audioFiles) {
    return null;
  }

  const filename = state.audioFiles[explanationId];
  if (!filename) {
    return null;
  }

  const currentLanguage =
    state.currentLanguage ||
    (window.appConfig && window.appConfig.languages && window.appConfig.languages.default) ||
    'es';

  return `content/i18n/${currentLanguage}/audio/${filename}`;
};

const playQuizExplanationAudio = (feedbackText, explanationId) => {
  if (!feedbackText) {
    return false;
  }

  const audioSrc = resolveQuizExplanationAudioSrc(explanationId);
  if (!audioSrc) {
    console.debug('activity_quiz: explanation audio unavailable', {
      explanationId,
      hasAudioFiles: Boolean(state?.audioFiles)
    });
    return false;
  }

  stopAudio();

  const explanationAudio = new Audio(audioSrc);
  explanationAudio.playbackRate = parseFloat(state.audioSpeed) || 1;
  const shouldShowTtsUi = Boolean(state.readAloudMode);

  if (!shouldShowTtsUi) {
    console.debug('activity_quiz: playing explanation audio with read aloud disabled');
  }

  if (shouldShowTtsUi) {
    highlightElement(feedbackText);
  }
  setState('currentAudio', explanationAudio);
  setState('isPlaying', true);
  if (shouldShowTtsUi) {
    updatePlayPauseIcon(true);
  }
  console.debug('activity_quiz: playing explanation audio', {
    explanationId,
    audioSrc,
    playbackRate: explanationAudio.playbackRate
  });

  const cleanup = () => {
    if (shouldShowTtsUi) {
      unhighlightElement(feedbackText);
      updatePlayPauseIcon(false);
    }
    if (state.currentAudio === explanationAudio) {
      setState('currentAudio', null);
    }
    setState('isPlaying', false);
  };

  explanationAudio.addEventListener('ended', cleanup, { once: true });
  explanationAudio.addEventListener('error', cleanup, { once: true });

  explanationAudio.play().catch((error) => {
    console.warn('activity_quiz: explanation audio playback failed', error);
    cleanup();
  });

  return true;
};

const updateVisibleQuizFeedbackLanguage = () => {
  const quizSection = document.querySelector(QUIZ_SECTION_SELECTOR);
  if (!quizSection) {
    return;
  }

  let bindingsChanged = false;

  quizSection.querySelectorAll('.activity-option').forEach((option) => {
    const feedbackContainer = option.querySelector('.feedback-container');
    if (!feedbackContainer || feedbackContainer.classList.contains('hidden')) {
      return;
    }

    const feedbackText = feedbackContainer.querySelector('.feedback-text');
    if (!feedbackText) {
      return;
    }

    const { text: explanation, id: explanationId } = resolveQuizExplanation(option);
    const ariaInvalid = option.getAttribute('aria-invalid');
    const isCorrect = ariaInvalid === 'false';
    const fallbackCopy = translateText(
      isCorrect ? 'multiple-choice-correct-answer' : 'multiple-choice-try-again'
    );

    feedbackText.textContent = explanation || fallbackCopy;
    console.debug('activity_quiz: feedback text reapplied during language change', {
      optionId: option.getAttribute('data-activity-item'),
      explanationId,
      text: feedbackText.textContent
    });
    const changed = bindQuizFeedbackAudioId(feedbackText, explanationId);
    bindingsChanged = bindingsChanged || changed;
  });

  if (bindingsChanged) {
    gatherAudioElements();
  }
};

const announceQuizSelection = (option) => {
  const optionLetter = option.querySelector('.option-letter')?.textContent?.trim() || '';
  const optionText = option.querySelector('.option-text')?.textContent?.trim() || '';
  const liveRegion = document.getElementById('validation-results-announcement');
  if (!liveRegion) {
    return;
  }

  liveRegion.setAttribute('aria-live', 'polite');
  if (optionLetter) {
    liveRegion.textContent = `Option ${optionLetter} selected`;
  } else if (optionText) {
    liveRegion.textContent = `Selected ${optionText}`;
  } else {
    liveRegion.textContent = 'Option selected';
  }
  setTimeout(() => {
    liveRegion.textContent = '';
  }, 1000);
};

const handleQuizOptionSelection = (option) => {
  clearQuizValidationStyling();

  const radioGroup = option.closest('[role="radiogroup"]') || option.closest('[role="group"]');
  if (!radioGroup) {
    return;
  }

  resetQuizOptions(radioGroup);
  markQuizSelection(option);
  setState('quizSelectedOption', option);
  playActivitySound('drop');

  radioGroup.querySelectorAll('.activity-option').forEach((opt) => opt.setAttribute('aria-checked', 'false'));
  option.setAttribute('aria-checked', 'true');

  announceQuizSelection(option);
  saveQuizSelectionState(option);
  enableQuizSubmitButton();
  focusQuizSubmitButton();
  restoreQuizSubmitButtonToValidate();
};

const isTypingTarget = (target) => {
  if (!target) {
    return false;
  }

  const tagName = target.tagName?.toLowerCase();
  const interactiveTags = ['input', 'textarea', 'select'];
  if (interactiveTags.includes(tagName)) {
    return true;
  }

  return Boolean(target.isContentEditable);
};

const handleQuizShortcutKeydown = (event) => {
  if (!QUIZ_SHORTCUT_KEYS.includes(event.key)) {
    return;
  }

  if (isTypingTarget(event.target)) {
    return;
  }

  const quizSection = document.querySelector(QUIZ_SECTION_SELECTOR);
  if (!quizSection) {
    return;
  }

  const options = quizSection.querySelectorAll('.activity-option');
  const index = Number(event.key) - 1;
  const option = options[index];
  if (!option) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  handleQuizOptionSelection(option);
};

const registerQuizShortcutHandler = () => {
  if (quizShortcutHandlerRegistered) {
    return;
  }

  document.addEventListener('keydown', handleQuizShortcutKeydown);
  quizShortcutHandlerRegistered = true;
};

export const resetQuizActivity = (activityId) => {
  const quizSection = document.querySelector(QUIZ_SECTION_SELECTOR);
  if (!quizSection) {
    return;
  }

  quizSection.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.checked = false;
  });

  quizSection.querySelectorAll('.activity-option').forEach((option) => {
    option.setAttribute('aria-checked', 'false');
  });

  clearQuizValidationStyling();
  setState('quizSelectedOption', null);
  disableQuizSubmitButton();

  Object.keys(localStorage)
    .filter((key) => key.startsWith(`${activityId}_`) && key.endsWith('_quiz'))
    .forEach((key) => localStorage.removeItem(key));
};

const attachQuizRetryHandler = () => {
  const submitButton = document.getElementById('submit-button');
  if (!submitButton) {
    return;
  }

  if (state.retryHandler) {
    submitButton.removeEventListener('click', state.retryHandler);
  }

  const quizRetryHandler = () => {
    playActivitySound('reset');
    const activityId = getQuizActivityId();
    resetQuizActivity(activityId);
    restoreQuizSubmitButtonToValidate();
    focusFirstQuizOption();
  };

  state.retryHandler = quizRetryHandler;
  submitButton.addEventListener('click', quizRetryHandler, { once: false });
};

export const prepareQuiz = (section) => {
  setState('quizSelectedOption', null);
  restoreQuizSelection(section);

  const activityOptions = section.querySelectorAll('.activity-option');
  activityOptions.forEach((option) => {
    const newOption = option.cloneNode(true);
    option.parentNode.replaceChild(newOption, option);
  });

  section.querySelectorAll('.activity-option').forEach((option) => {
    option.addEventListener('click', () => handleQuizOptionSelection(option));
    option.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleQuizOptionSelection(option);
      }
    });

    const optionText = option.querySelector('.option-text')?.textContent?.trim() || '';
    const imgAlt = option.querySelector('img')?.alt?.trim() || '';
    const shadowInput = option.querySelector('input[type="radio"]');
    if (shadowInput) {
      shadowInput.setAttribute('tabindex', '-1');
    }

    const labelParts = [];
    if (optionText) {
      labelParts.push(optionText);
    }
    if (imgAlt && imgAlt !== optionText) {
      labelParts.push(imgAlt);
    }

    const ariaLabel = labelParts.join(' ').trim() || 'Option';
    option.setAttribute('aria-label', ariaLabel);
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', 'false');

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

    const label = option.querySelector('span');
    if (label) {
      label.classList.add('px-4', 'py-2', 'rounded-full', 'font-medium', 'transition-colors', 'duration-200');
    }
  });

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

  registerQuizShortcutHandler();
};

export const checkQuiz = () => {
  if (!state.quizSelectedOption) {
    const announcement = document.getElementById('validation-results-announcement');
    if (announcement) {
      announcement.setAttribute('aria-live', 'assertive');
      announcement.textContent = translateText('select-option-first');
      setTimeout(() => {
        announcement.textContent = '';
      }, 3000);
    }
    return;
  }

  const dataActivityItem = getQuizActivityItem(state.quizSelectedOption);
  const isCorrect = correctAnswers[dataActivityItem];

  styleQuizOption(state.quizSelectedOption, isCorrect);
  showQuizFeedback(state.quizSelectedOption, isCorrect);

  if (typeof updateResetButtonVisibility === 'function') {
    updateResetButtonVisibility();
  }

  updateSubmitButtonAndToast(isCorrect, translateText('next-activity'), ActivityTypes.QUIZ);

  if (!isCorrect) {
    attachQuizRetryHandler();
  }
};

const styleQuizOption = (option, isCorrect) => {
  option.classList.remove('selected-option');

  setLetterAppearance(
    option,
    `w-8 h-8 aspect-square rounded-full border-2 flex items-center justify-center ${
      isCorrect ? 'border-green-500 bg-green-500 text-white' : 'border-red-500 bg-red-500 text-white'
    }`,
    'option-letter text-white'
  );

  option.classList.add(isCorrect ? 'bg-green-50' : 'bg-red-50');
  option.setAttribute('aria-invalid', isCorrect ? 'false' : 'true');
};

const playQuizFeedbackAudioSequence = (isCorrect, feedbackText, explanationId) => {
  const soundKey = isCorrect ? 'success' : 'error';
  const soundEffect = playActivitySound(soundKey);

  if (!state.readAloudMode) {
    return;
  }

  const startExplanationPlayback = () => {
    playQuizExplanationAudio(feedbackText, explanationId);
  };

  if (soundEffect && typeof soundEffect.addEventListener === 'function') {
    soundEffect.addEventListener('ended', startExplanationPlayback, { once: true });
  } else {
    startExplanationPlayback();
  }
};

const showQuizFeedback = (option, isCorrect) => {
  const feedbackContainer = option.querySelector('.feedback-container');
  if (!feedbackContainer) {
    return;
  }

  const feedbackIcon = feedbackContainer.querySelector('.feedback-icon');
  const feedbackText = feedbackContainer.querySelector('.feedback-text');
  if (!feedbackIcon || !feedbackText) {
    return;
  }

  feedbackContainer.classList.remove('hidden');

  const activityId = getQuizActivityId();
  const attemptKey = `${activityId}-intentos`;
  let attemptCount = parseInt(localStorage.getItem(attemptKey) || '0', 10);
  attemptCount += 1;
  localStorage.setItem(attemptKey, attemptCount.toString());

  const { text: explanation, id: explanationId } = resolveQuizExplanation(option);
  let bindingsChanged = false;

  if (isCorrect) {
    feedbackIcon.className = 'feedback-icon hidden';
    feedbackIcon.textContent = '';
    feedbackText.className = 'feedback-text text-lg font-semibold text-green-800';
    feedbackText.textContent = explanation || translateText('multiple-choice-correct-answer');
    bindingsChanged = bindQuizFeedbackAudioId(feedbackText, explanationId) || bindingsChanged;

    feedbackContainer.setAttribute('role', 'status');
    feedbackContainer.setAttribute('aria-live', 'polite');

    const storedActivities = localStorage.getItem('completedActivities');
    let completedActivities = storedActivities ? JSON.parse(storedActivities) : [];
    const namePage = localStorage.getItem('namePage');
    const timeDone = new Date().toLocaleString('es-ES');
    const newActivityId = `${activityId}-${namePage}-${attemptCount}-${timeDone}`;

    completedActivities = completedActivities.filter((id) => !id.startsWith(`${activityId}-`));
    completedActivities.push(newActivityId);
    localStorage.setItem('completedActivities', JSON.stringify(completedActivities));

    const heading = document.querySelector('h1');
    if (heading) {
      localStorage.setItem('namePage', heading.innerText);
    }

    executeMail(ActivityTypes.QUIZ);
  } else {
    feedbackIcon.className = 'feedback-icon hidden';
    feedbackIcon.textContent = '';
    feedbackText.className = 'feedback-text text-lg font-semibold text-red-800';
    feedbackText.textContent = explanation || translateText('multiple-choice-try-again');
    bindingsChanged = bindQuizFeedbackAudioId(feedbackText, explanationId) || bindingsChanged;

    feedbackContainer.setAttribute('role', 'alert');
  }

  if (bindingsChanged) {
    gatherAudioElements();
  }

  playQuizFeedbackAudioSequence(isCorrect, feedbackText, explanationId);
};

export const initializeQuizActivity = () => {
  const quizSection = document.querySelector(QUIZ_SECTION_SELECTOR);

  if (!quizSection) {
    return;
  }

  applyQuizBackground();
  ensureValidationLiveRegion();
  disableQuizSubmitButton();
  hydrateQuizData();
};

document.addEventListener('adt-language-changed', updateVisibleQuizFeedbackLanguage);

export default {
  initializeQuizActivity,
  resetQuizActivity,
  prepareQuiz,
  checkQuiz
};
