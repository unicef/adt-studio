    /** @type {import('tailwindcss').Config} */
    module.exports = {
    content: ["../adt/*.{html,js}", "../adt/assets/*.{html,js}", "../adt/assets/**/*.{html,js}", "../adt/content/**/*.{html,js}"],
    theme: {
        extend: {
        keyframes: {
            tutorialPopIn: {
            '0%': { opacity: '0', transform: 'scale(0.9)' },
            '100%': { opacity: '1', transform: 'scale(1)' },
            },
            pulseBorder: {
            '0%': { boxShadow: '0 0 0 0 rgba(49,130,206,0.7)' },
            '70%': { boxShadow: '0 0 0 10px rgba(49,130,206,0)' },
            '100%': { boxShadow: '0 0 0 0 rgba(49,130,206,0)' },
            },
        },
        animation: {
            tutorialPopIn: 'tutorialPopIn 0.3s ease-out forwards',
            pulseBorder: 'pulseBorder 2s infinite',
        },
        boxShadow: {
            'tutorial': '0 0 0 4px rgba(49,130,206,0.3)',
        }
        },
    },
    plugins: [],
    }
    