/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lumon: {
          ink: "#0b1110",
          panel: "#111a18",
          line: "#24322e",
          mint: "#7ef0c0",
          mintDim: "#2f6f59",
          amber: "#f5c86b",
          danger: "#f27c7c",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        tremor: {
          "0%, 100%": { transform: "translate(0, 0)" },
          "25%": { transform: "translate(0.4px, -0.4px)" },
          "50%": { transform: "translate(-0.4px, 0.3px)" },
          "75%": { transform: "translate(0.3px, 0.4px)" },
        },
      },
      animation: {
        tremor: "tremor 220ms infinite linear",
      },
    },
  },
  plugins: [],
};
