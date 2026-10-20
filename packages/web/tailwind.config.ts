import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        civic: {
          950: "#0B1120",
          900: "#0F172A",
          800: "#1E293B",
          700: "#334155",
          600: "#475569",
          500: "#64748B",
          400: "#94A3B8",
          300: "#CBD5E1",
          200: "#E2E8F0",
          100: "#F1F5F9",
          50: "#F8FAFC",
        },
        saffron: {
          700: "#C2410C",
          600: "#EA580C",
          500: "#F97316",
          100: "#FFEDD5",
          50: "#FFF7ED",
        },
        emerald: {
          700: "#047857",
          600: "#059669",
          500: "#10B981",
          100: "#D1FAE5",
          50: "#ECFDF5",
        },
        friction: {
          700: "#B91C1C",
          600: "#DC2626",
          100: "#FEE2E2",
          50: "#FEF2F2",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        subtle: "0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)",
        card: "0 2px 6px -1px rgba(15, 23, 42, 0.07), 0 1px 4px -2px rgba(15, 23, 42, 0.05)",
      },
    },
  },
  plugins: [],
};
export default config;
