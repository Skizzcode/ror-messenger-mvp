/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0A0B0E",
        accent: "#ffffff",
      },
      borderRadius: {
        'xl2': '1.5rem',
      },
    },
  },
  plugins: [],
};
