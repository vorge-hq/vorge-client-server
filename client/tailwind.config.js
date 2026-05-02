export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        vantage: {
          ink: "#0b1220",
          navy: "#0f172a",
          slate: "#1e293b",
          blue: "#1d4ed8",
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
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ]
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.06)",
        elevated:
          "0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)"
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem"
      }
    }
  },
  plugins: []
};
