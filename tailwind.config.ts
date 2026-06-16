import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
        display: ['"Space Grotesk"', '"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        rift: {
          bg: "#f5f7fe",
          surface: "#ffffff",
          ink: "#16203a",
          muted: "#67708c",
          line: "#e6eaf6",
          sky: "#5aa9ff",
          azure: "#2e7bf6",
          violet: "#8a7bff",
          mint: "#2fd0a6",
          rose: "#ff6b8b",
          amber: "#ffb02e",
        },
      },
      boxShadow: {
        soft: "0 10px 40px -18px rgba(46, 123, 246, 0.35)",
        glow: "0 0 60px -10px rgba(138, 123, 255, 0.45)",
        panel: "0 1px 2px rgba(22,32,58,0.04), 0 12px 40px -24px rgba(22,32,58,0.25)",
      },
      backgroundImage: {
        "rift-radial":
          "radial-gradient(1200px 600px at 50% -10%, rgba(138,123,255,0.18), transparent 60%), radial-gradient(900px 500px at 90% 10%, rgba(90,169,255,0.14), transparent 55%), radial-gradient(900px 600px at 5% 90%, rgba(47,208,166,0.12), transparent 55%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.95)", opacity: "0.6" },
          "70%": { transform: "scale(1.25)", opacity: "0" },
          "100%": { opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.4,0,0.6,1) infinite",
        shimmer: "shimmer 2.5s linear infinite",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
