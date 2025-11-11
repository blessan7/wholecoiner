/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#ec9213",
        "background-light": "#f8f7f6",
        "background-dark": "#221a10",
        success: "#28a745",
        error: "#dc3545",
        "text-light": "#212529",
        "text-dark": "#f8f9fa",
        "muted-light": "#6c757d",
        "muted-dark": "#a0a0a0",
        "keypad-light": "#e9ecef",
        "keypad-dark": "#2c2216",
        positive: "#4CAF50",
        negative: "#F44336",
        "card-light": "#FFFFFF",
        "card-dark": "#2a2217",
        "text-primary-light": "#212121",
        "text-primary-dark": "#f0eade",
        "text-secondary-light": "#757575",
        "text-secondary-dark": "#a89987",
        "border-light": "#e0e0e0",
        "border-dark": "#483923",
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "1rem",
        lg: "1.5rem",
        xl: "3rem",
        full: "9999px",
      },
      boxShadow: {
        'soft': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
        'soft-md': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};

