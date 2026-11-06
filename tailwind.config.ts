import type { Config } from "tailwindcss";

// Paleta Patagonia Digital
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pd: {
          navy: "#1a2332",
          slate: "#4a5568",
          light: "#f7f8fa",
          line: "#e3e7ee",
          blue: "#2563eb",
          cyan: "#06b6d4",
          green: "#10b981",
          orange: "#f59e0b",
          red: "#dc2626",
        },
      },
      fontFamily: {
        display: ["Montserrat", "Arial Black", "sans-serif"],
        sans: ["'Open Sans'", "Arial", "sans-serif"],
        mono: ["'Source Code Pro'", "ui-monospace", "monospace"],
      },
      boxShadow: { card: "0 1px 2px rgba(26,35,50,.06), 0 4px 16px rgba(26,35,50,.05)" },
      borderRadius: { card: "8px" },
    },
  },
  plugins: [],
} satisfies Config;
