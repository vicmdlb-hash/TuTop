/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        background: '#050A13', surface: '#0D1522', primary: '#7C3AED', accent: '#A855F7', success: '#22C55E',
      },
    },
  },
  plugins: [],
};
