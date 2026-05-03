import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        }
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem"
      },
      boxShadow: {
        glow: "0 0 80px rgba(76, 130, 255, 0.22)",
        glass: "0 12px 40px rgba(5, 8, 26, 0.45)"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["'Space Grotesk'", "'Plus Jakarta Sans'", "sans-serif"]
      },
      backgroundImage: {
        "radial-premium":
          "radial-gradient(circle at 20% 10%, rgba(51, 88, 255, 0.22), transparent 50%), radial-gradient(circle at 85% 15%, rgba(98, 25, 255, 0.18), transparent 45%), radial-gradient(circle at 50% 90%, rgba(0, 209, 255, 0.16), transparent 50%)",
        "aurora":
          "radial-gradient(60% 50% at 50% 0%, rgba(99, 102, 241, 0.35), transparent 70%), radial-gradient(40% 40% at 80% 30%, rgba(34, 211, 238, 0.25), transparent 70%), radial-gradient(50% 50% at 20% 80%, rgba(168, 85, 247, 0.25), transparent 70%)",
        "shine":
          "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)"
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" }
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" }
        },
        marqueeReverse: {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" }
        },
        floatY: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" }
        },
        shine: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        },
        gradientMove: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" }
        }
      },
      animation: {
        pulseSoft: "pulseSoft 4s ease-in-out infinite",
        marquee: "marquee 40s linear infinite",
        marqueeSlow: "marquee 70s linear infinite",
        marqueeReverse: "marqueeReverse 50s linear infinite",
        floatY: "floatY 6s ease-in-out infinite",
        shine: "shine 3s linear infinite",
        gradientMove: "gradientMove 8s ease infinite"
      }
    }
  },
  plugins: []
};

export default config;
