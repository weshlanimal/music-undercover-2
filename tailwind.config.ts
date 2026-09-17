import type { Config } from "tailwindcss";

// ---------------------------------------------------------------------------
// Toutes les couleurs référencent des variables CSS (définies dans
// globals.css, en triplets "R G B" pour supporter les modificateurs
// d'opacité Tailwind comme `/40`). Ça permet de faire vivre un thème clair
// ET un thème sombre sous les MÊMES noms de classes déjà utilisés partout
// dans l'app (bg-ink-elevated, text-signal, border-wave/50…) — pas besoin
// de retoucher un seul composant pour que le re-skin visuel + le bascule
// clair/sombre s'appliquent partout d'un coup.
// ---------------------------------------------------------------------------
function withOpacity(cssVar: string) {
  return `rgb(var(${cssVar}) / <alpha-value>)`;
}

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: withOpacity("--ink"),
          elevated: withOpacity("--ink-elevated"),
          raised: withOpacity("--ink-raised"),
          border: withOpacity("--ink-border")
        },
        signal: {
          DEFAULT: withOpacity("--signal"),
          soft: withOpacity("--signal-soft"),
          dim: withOpacity("--signal-dim")
        },
        wave: {
          DEFAULT: withOpacity("--wave"),
          soft: withOpacity("--wave-soft"),
          dim: withOpacity("--wave-dim")
        },
        alert: {
          DEFAULT: withOpacity("--alert"),
          dim: withOpacity("--alert-dim")
        },
        paper: {
          DEFAULT: withOpacity("--paper"),
          muted: withOpacity("--paper-muted"),
          faint: withOpacity("--paper-faint")
        }
      },
      fontFamily: {
        // Empilement système uniquement (aucune police téléchargée) : un build
        // hors-ligne ou sur réseau restreint ne doit jamais dépendre d'un
        // appel réseau vers Google Fonts. Serif pour les titres — c'est ce
        // détail, plus que la couleur, qui casse le "air de site généré par IA".
        display: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "Times", "serif"],
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
        glow: "0 0 40px -10px rgb(var(--signal) / 0.5)",
        glowTeal: "0 0 40px -10px rgb(var(--wave) / 0.45)",
        card: "0 1px 0 0 rgb(var(--paper) / 0.04) inset, 0 20px 50px -24px rgb(0 0 0 / 0.6)"
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
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        }
      },
      animation: {
        "pulse-ring": "pulse-ring 2.2s cubic-bezier(0.2,0.6,0.4,1) infinite",
        rise: "rise 0.35s ease-out",
        shimmer: "shimmer 3.5s linear infinite"
      }
    }
  },
  plugins: []
};

export default config;
