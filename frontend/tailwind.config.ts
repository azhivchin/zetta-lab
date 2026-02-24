import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        zetta: {
          50: "#E8FAF8",
          100: "#D1F5F0",
          200: "#A3EBE1",
          300: "#75E0D2",
          400: "#47D6C3",
          500: "#2EC4B6",
          600: "#1A9E93",
          700: "#14776E",
          800: "#0D504A",
          900: "#072925",
        },
        dark: "#1A1A2E",
      },
    },
  },
  plugins: [],
};
export default config;
