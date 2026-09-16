import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0F0D17",
          elevated: "#1B1726",
          raised: "#251F35",
          border: "#332C48"
        },
        signal: {
          DEFAULT: "#FF3D77",
          soft: "#FF6E9B",
          dim: "#4A1B2E"
        },
        wave: {
          DEFAULT: "#4FD6C0",
          soft: "#8CE8DA",
          dim: "#123A35"
        },
        alert: {
          DEFAULT: "#FFB020",
          dim: "#3A2C10"
        },
        paper: {
          DEFAULT: "#EDEAF6",
          muted: "#B7B0D1",
          faint: "#8B84A6"
        }
      },
      fontFamily: {
        display: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ],
        body: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ]
      },
      boxShadow: {
        glow: "0 0 40px -12px rgba(255, 61, 119, 0.45)",
        glowTeal: "0 0 40px -12px rgba(79, 214, 192, 0.45)"
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "70%": { transform: "scale(1.4)", opacity: "0" },
          "100%": { transform: "scale(1.4)", opacity: "0" }
        },
        rise: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" }
        }
      },
      animation: {
        "pulse-ring": "pulse-ring 2.2s cubic-bezier(0.2,0.6,0.4,1) infinite",
        rise: "rise 0.35s ease-out"
      }
    }
  },
  plugins: []
};

export default config;
