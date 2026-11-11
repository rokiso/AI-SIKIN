import type { Config } from "tailwindcss";

// Shared visual roles: feature screens use these tokens instead of local values.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      primary: {
        50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0",
        500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46", 900: "#064e3b",
      },
      neutral: {
        50: "#fafafa", 100: "#f5f5f5", 200: "#e5e5e5", 300: "#d4d4d4",
        400: "#a3a3a3", 500: "#737373", 600: "#525252", 700: "#404040",
        800: "#262626", 900: "#171717", 950: "#0a0a0a",
      },
      surface: { DEFAULT: "#ffffff", muted: "#f8fafc" },
      status: {
        warning: "#92400e", "warning-surface": "#fffbeb",
        danger: "#9f1239", "danger-surface": "#fff1f2",
      },
    },
    fontFamily: {
      sans: ["Noto Sans KR Variable", "Noto Sans KR", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "sans-serif"],
    },
    extend: {
      borderRadius: { xl: "12px", "2xl": "16px" },
      boxShadow: { shell: "0 0 48px rgb(23 23 23 / 0.04)" },
    },
  },
  plugins: [],
} satisfies Config;
