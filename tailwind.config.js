/** @type {import('tailwindcss').Config} */
export default {
  // Only scan files in src/ — keeps Tailwind's JIT fast
  content: ["./src/**/*.{html,ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

