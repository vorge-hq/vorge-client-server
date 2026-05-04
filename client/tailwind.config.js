export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F1F2F4",
        brand: {
          DEFAULT: "#1E3A5F",
          hover: "#16294A",
          muted: "#EFF4FB",
          "muted-border": "#C5D5E8",
          accent: "#F59E0B"
        },
        vantage: {
          ink: "#16294A",
          navy: "#1E3A5F",
          slate: "#1e293b",
          blue: "#1E3A5F",
          sky: "#0284c7",
          teal: "#0f766e",
          amber: "#b45309",
          green: "#15803d",
          red: "#b91c1c"
        },
        risk: {
          low: "#15803d",
          "low-bg": "#dcfce7",
          medium: "#a16207",
          "medium-bg": "#fef9c3",
          high: "#c2410c",
          "high-bg": "#ffedd5",
          "very-high": "#991b1b",
          "very-high-bg": "#fee2e2"
        },
        state: {
          draft: "#475569",
          "draft-bg": "#e2e8f0",
          review: "#1d4ed8",
          "review-bg": "#dbeafe",
          approval: "#7c3aed",
          "approval-bg": "#ede9fe",
          approved: "#15803d",
          "approved-bg": "#dcfce7"
        }
      },
      fontFamily: {
        sans: [
          "Geist",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ],
        mono: ["Geist Mono", "ui-monospace", "monospace"]
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(24, 24, 27, 0.04), 0 1px 3px 0 rgba(24, 24, 27, 0.06)",
        elevated: "0 10px 15px -3px rgba(24, 24, 27, 0.08), 0 4px 6px -4px rgba(24, 24, 27, 0.05)"
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "0.875rem"
      }
    }
  },
  plugins: []
};
