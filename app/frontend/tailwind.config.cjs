/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        'success-bg': 'var(--color-success-bg)',
        'success-text': 'var(--color-success-text)',
        'error-bg': 'var(--color-error-bg)',
        'error-text': 'var(--color-error-text)',
        'warning-bg': 'var(--color-warning)',
        'warning-text': 'var(--color-warning-text)',
      },
    },
  },
  plugins: [],
};
