/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      colors: {
        brand: {
          50:  "#f0f4ff",
          100: "#dce6fd",
          200: "#b9cefb",
          300: "#8baef8",
          400: "#5b87f3",
          500: "#3b63ed",
          600: "#2947e0",
          700: "#2035c8",
          800: "#1d2ea2",
          900: "#1d2e80",
        },
      },
      animation: {
        "gradient-x":    "gradient-x 8s ease infinite",
        "float":         "float 6s ease-in-out infinite",
        "pulse-slow":    "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow":          "glow 2s ease-in-out infinite alternate",
        "slide-up":      "slide-up 0.3s ease-out",
        "fade-in":       "fade-in 0.4s ease-out",
        "number-spin":   "number-spin 0.6s ease-out",
      },
      keyframes: {
        "gradient-x": {
          "0%, 100%": { "background-position": "0% 50%" },
          "50%":      { "background-position": "100% 50%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-10px)" },
        },
        glow: {
          from: { "box-shadow": "0 0 20px rgba(59, 99, 237, 0.3)" },
          to:   { "box-shadow": "0 0 40px rgba(59, 99, 237, 0.6), 0 0 80px rgba(59, 99, 237, 0.2)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
      },
      backgroundSize: {
        "300%": "300%",
      },
    },
  },
  plugins: [],
};
