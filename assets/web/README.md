## Directory Structure
```
/
├── assets/
│   ├── base.js              # Main application entry point
│   ├── activity.js          # Activity management entry point
│   │
│   └── modules/
│       ├── state.js            # Centralized state management
│       ├── audio.js            # Audio playback and control
│       ├── cookies.js          # Cookie management
│       ├── error_utils.js       # Error handling utilities
│       ├── interface.js        # UI management
│       ├── navigation.js       # Page navigation
│       ├── translations.js     # Language/translations
│       ├── font_utils.js        # Font loading/management
│       ├── ui_utils.js          # UI utilities
│       │
│       └── activities/         # Activity type handlers
│           ├── multipleChoice.js
│           ├── sorting.js
│           ├── matching.js
│           ├── true_false.js
│           ├── fill_in_the_blank.js
│           ├── fill_in_a_table.js
│           └── validation.js
```

## Core Features

### 1. Accessibility Features
- Text-to-speech with speed control
- Easy read mode
- Image descriptions
- Keyboard navigation
- ARIA attributes support

### 2. State Management
The application uses a centralized state management system:
```javascript
// state.js
const initialState = {
    readAloudMode: false,
    easyReadMode: false,
    // ... other state properties
};

export const setState = (key, value) => {
    state[key] = value;
    return state[key];
};
```

### 3. UI Components
- Universal AI sidebar with accessibility controls
- Interactive activity interface
- Navigation controls
- Audio playback controls

### 4. Activity Types
- Multiple choice questions
- Sorting activities
- Matching exercises
- True/False questions
- Fill in the blank
- Fill in table

## Adding New Features

### 1. Adding a New Activity Type
1. Create a new file in `modules/activities/`
2. Follow the activity module pattern:
```javascript
import { state, setState } from '../state.js';
import { ActivityTypes } from '../utils.js';

export const prepareNewActivity = (section) => {
    // Setup logic
};

export const checkNewActivity = () => {
    // Validation logic
};
```
3. Update `ActivityTypes` in utils.js
4. Add activity handling in activity.js

### 2. Adding UI Components
1. Add HTML markup in interface.html
2. Create UI handlers in interface.js:
```javascript
export const newUIFeature = () => {
    // UI logic
    initializeComponent();
    attachEventListeners();
    updateState();
};
```
3. Add state management in state.js
4. Add any necessary translations

### 3. Adding Translations
1. Update translation files structure:
```javascript
{
    "texts": {
        "new-feature-text": "Translation",
        "new-feature-label": "Label Translation"
    },
    "audioFiles": {
        "new-feature-audio": "path/to/audio.mp3"
    }
}
```
2. Add translation keys in relevant modules
3. Update interface translations if needed

## Guidelines for Development

### 1. State Management
- Always use setState for state modifications
- Keep state immutable where possible
- Initialize state in state.js
- Use state subscriptions for UI updates

### 2. Error Handling
```javascript
try {
    await performAction();
} catch (error) {
    console.error('Action failed:', error);
    showErrorToast('User-friendly error message');
}
```

### 3. Audio Handling
- Always check for user interaction before playing audio
- Handle audio cleanup properly
- Use the audio queue system for sequential playback
- Support speed controls

### 4. UI Development
- Use Tailwind CSS utilities
- Maintain accessibility standards
- Follow responsive design principles
- Test across different screen sizes

### 5. Activity Development
- Implement proper validation
- Include error feedback
- Support keyboard navigation
- Add appropriate ARIA labels

## Performance Considerations

### 1. Audio Loading
- Load audio files on demand
- Clean up unused audio resources
- Handle playback errors gracefully

### 2. State Updates
- Batch state updates when possible
- Use debouncing for frequent updates
- Clean up event listeners

### 3. UI Performance
- Use CSS transitions for animations
- Lazy load components when possible
- Optimize render cycles



## Testing

### 1. Component Testing
- Test UI interactions
- Validate state changes
- Check accessibility features
- Test error scenarios

### 2. Activity Testing
- Validate correct answers
- Test error states
- Check feedback mechanisms
- Test keyboard navigation


## Contributing
1. Follow the modular structure
2. Maintain coding standards
3. Include documentation
4. Add appropriate tests

## Future Development
- Consider additional activity types
- Enhance accessibility features
- Improve performance
- Add analytics support
