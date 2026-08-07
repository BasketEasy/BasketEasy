const preset = require('@basketeasy/ui/tailwind-preset');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [preset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/@basketeasy/ui/src/**/*.{ts,tsx}',
  ],
};
