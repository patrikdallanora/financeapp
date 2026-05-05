/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0ea5e9',
        danger: '#ef4444',
        success: '#22c55e',
        warning: '#f59e0b'
      }
    }
  },
  plugins: [],
}