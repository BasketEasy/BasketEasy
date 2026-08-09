/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        orange: {
          DEFAULT: '#D4622A',
          // Darker shade of brand orange for text/foreground use. `orange`
          // (#D4622A) only measures 3.47:1 against cream (#FAF5EF) — below
          // WCAG AA's 4.5:1 for normal text. This shade keeps the same hue
          // and saturation, just darker, and measures 5.03:1 against cream.
          // Use for orange text on light backgrounds, or as a fill under
          // cream text where `orange` itself would fail contrast.
          text: '#AA4F22',
        },
        'blue-green': '#1E5F74',
        cream: '#FAF5EF',
        charcoal: '#23201C',
        muted: '#5B564F',
        border: '#E7DECF',
        error: '#B23A2E',
        success: '#2F7D5C',
      },
      fontFamily: {
        heading: ['"Barlow Condensed"', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
