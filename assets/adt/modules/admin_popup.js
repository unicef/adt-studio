import { state, setState, getFullState } from './state.js';
import { setCookie } from './cookies.js';

let adminPopupVisible = false;

export const initializeAdminPopup = () => {
    createPopupElement();
    setupKeyboardShortcut();
};

const createPopupElement = () => {
    if (!document.getElementById('admin-popup')) {
        const popup = document.createElement('div');
        popup.id = 'admin-popup';
        // Fixed positioning and size
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 320px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            z-index: 9999;
            display: none;
        `;

        popup.innerHTML = `
            <div style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; background: white; border-top-left-radius: 8px; border-top-right-radius: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <h2 style="font-size: 16px; font-weight: 600; color: #1f2937;">State Manager</h2>
                    <span style="background: #dbeafe; color: #1e40af; padding: 2px 6px; border-radius: 4px; font-size: 12px;">Ctrl + Shift + A</span>
                </div>
                <button id="close-admin-popup" style="padding: 4px 8px; color: #6b7280; cursor: pointer; border-radius: 4px;">×</button>
            </div>
            
            <div id="admin-state-container" style="max-height: 60vh; overflow-y: auto; padding: 8px 0;">
                <!-- State controls will be inserted here -->
            </div>
        `;

        document.body.appendChild(popup);

        const overlay = document.createElement('div');
        overlay.id = 'admin-popup-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9998;
            display: none;
        `;
        document.body.appendChild(overlay);

        document.getElementById('close-admin-popup').addEventListener('click', toggleAdminPopup);
        overlay.addEventListener('click', toggleAdminPopup);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && adminPopupVisible) {
                toggleAdminPopup();
            }
        });
    }
};

const setupKeyboardShortcut = () => {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            toggleAdminPopup();
        }
    });
};

export const toggleAdminPopup = () => {
    const popup = document.getElementById('admin-popup');
    const overlay = document.getElementById('admin-popup-overlay');

    if (!popup || !overlay) return;

    adminPopupVisible = !adminPopupVisible;

    if (adminPopupVisible) {
        popup.style.display = 'block';
        overlay.style.display = 'block';
        updateStateDisplay();
    } else {
        popup.style.display = 'none';
        overlay.style.display = 'none';
    }
};

const updateStateDisplay = () => {
    const container = document.getElementById('admin-state-container');
    if (!container) return;

    const currentState = getFullState();
    container.innerHTML = '';

    // Filter and sort entries
    const entries = Object.entries(currentState)
        .filter(([_, value]) => typeof value === 'boolean' || typeof value === 'number')
        .sort(([, a], [, b]) => {
            if (typeof a === typeof b) return 0;
            return typeof a === 'boolean' ? -1 : 1;
        });

    entries.forEach(([key, value]) => {
        const type = typeof value;
        const row = document.createElement('div');
        row.style.cssText = `
            padding: 12px 16px;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: white;
        `;

        const formattedKey = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase());

        if (type === 'boolean') {
            row.innerHTML = `
                <span style="font-size: 14px; color: #374151;">${formattedKey}</span>
                <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
                    <input type="checkbox" 
                           data-key="${key}"
                           data-type="boolean" 
                           ${value ? 'checked' : ''}
                           style="opacity: 0; width: 0; height: 0;">
                    <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; 
                                background-color: ${value ? '#2563eb' : '#e5e7eb'}; transition: .4s; border-radius: 24px;">
                        <span style="position: absolute; content: ''; height: 18px; width: 18px; left: 3px; bottom: 3px;
                                   background-color: white; transition: .4s; border-radius: 50%;
                                   transform: ${value ? 'translateX(20px)' : 'translateX(0)'};">
                        </span>
                    </span>
                </label>
            `;
        } else if (type === 'number') {
            row.innerHTML = `
                <span style="font-size: 14px; color: #374151;">${formattedKey}</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="decrement" style="width: 24px; height: 24px; border: 1px solid #e5e7eb; border-radius: 4px;">−</button>
                    <input type="number" 
                           data-key="${key}"
                           data-type="number"
                           value="${value}"
                           step="0.1"
                           style="width: 60px; text-align: center; border: 1px solid #e5e7eb; border-radius: 4px; padding: 2px;">
                    <button class="increment" style="width: 24px; height: 24px; border: 1px solid #e5e7eb; border-radius: 4px;">+</button>
                </div>
            `;
        }

        container.appendChild(row);

        // Add event listeners
        if (type === 'boolean') {
            const input = row.querySelector(`input[data-key="${key}"]`);
            input.addEventListener('change', handleStateChange);
        } else if (type === 'number') {
            const input = row.querySelector(`input[data-key="${key}"]`);
            const decrement = row.querySelector('.decrement');
            const increment = row.querySelector('.increment');

            input.addEventListener('change', handleStateChange);
            decrement.addEventListener('click', () => adjustNumberValue(input, -0.1));
            increment.addEventListener('click', () => adjustNumberValue(input, 0.1));
        }
    });
};

const handleStateChange = (event) => {
    const key = event.target.dataset.key;
    const type = event.target.dataset.type;
    let value;

    if (type === 'boolean') {
        value = event.target.checked;

        // Update toggle appearance immediately
        const toggleSpan = event.target.nextElementSibling;
        toggleSpan.style.backgroundColor = value ? '#2563eb' : '#e5e7eb';
        toggleSpan.querySelector('span').style.transform = value ? 'translateX(20px)' : 'translateX(0)';
    } else if (type === 'number') {
        value = parseFloat(event.target.value) || 0;
    }

    // Update state and cookie
    setState(key, value);
    setCookie(key, value.toString(), 7);

    // Visual feedback
    const row = event.target.closest('div');
    const originalBackground = row.style.background;
    row.style.background = '#eff6ff';
    setTimeout(() => {
        row.style.background = originalBackground;
    }, 300);
};

const adjustNumberValue = (input, delta) => {
    const currentValue = parseFloat(input.value) || 0;
    const newValue = Math.round((currentValue + delta) * 10) / 10;
    input.value = newValue;
    input.dispatchEvent(new Event('change'));
};

