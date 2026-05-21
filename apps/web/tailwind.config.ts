import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--color-surface)",
        "surface-elevated": "var(--color-surface-elevated)",
        border: "var(--color-border)",
        accent: "var(--color-accent)",
        aid: "var(--color-aid)",
        obstacleMild: "var(--color-obstacle-mild)",
      },
      spacing: {
        tap: "var(--target-min)",
      },
      borderRadius: {
        tokenSm: "var(--radius-sm)",
        tokenMd: "var(--radius-md)",
        tokenLg: "var(--radius-lg)",
      },
      boxShadow: {
        modal: "var(--elevation-modal)",
      },
    },
  },
  plugins: [],
};

export default config;
