/**
 * Vantage tailwind config — v2
 * Extends Tailwind so devs can write utility classes against the
 * tokens defined in src/styles/index.css.
 *
 * Component code should prefer ROLE classes (bg-surface-base,
 * text-text-primary, border-border-default) over raw ramp classes
 * (bg-primary-500) wherever possible.
 */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        /* ----- shadcn-compatible role colors -----
         * Note: tokens in index.css are stored as hex (e.g. #1F3A5F),
         * so we wrap with var(...) directly rather than hsl(var(...)).
         */
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)"
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)"
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          /* Full ramp also exposed */
          10: "var(--primary-10)",
          50: "var(--primary-50)",
          100: "var(--primary-100)",
          200: "var(--primary-200)",
          300: "var(--primary-300)",
          400: "var(--primary-400)",
          500: "var(--primary-500)",
          600: "var(--primary-600)",
          700: "var(--primary-700)",
          800: "var(--primary-800)",
          900: "var(--primary-900)"
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
          10: "var(--secondary-10)",
          50: "var(--secondary-50)",
          100: "var(--secondary-100)",
          200: "var(--secondary-200)",
          300: "var(--secondary-300)",
          400: "var(--secondary-400)",
          500: "var(--secondary-500)",
          600: "var(--secondary-600)",
          700: "var(--secondary-700)",
          800: "var(--secondary-800)",
          900: "var(--secondary-900)"
        },
        tertiary: {
          10: "var(--tertiary-10)",
          50: "var(--tertiary-50)",
          100: "var(--tertiary-100)",
          200: "var(--tertiary-200)",
          300: "var(--tertiary-300)",
          400: "var(--tertiary-400)",
          500: "var(--tertiary-500)",
          600: "var(--tertiary-600)",
          700: "var(--tertiary-700)",
          800: "var(--tertiary-800)",
          900: "var(--tertiary-900)"
        },
        gray: {
          10: "var(--gray-10)",
          50: "var(--gray-50)",
          100: "var(--gray-100)",
          200: "var(--gray-200)",
          300: "var(--gray-300)",
          400: "var(--gray-400)",
          500: "var(--gray-500)",
          600: "var(--gray-600)",
          700: "var(--gray-700)",
          800: "var(--gray-800)",
          900: "var(--gray-900)"
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)"
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)"
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)"
        },
        border: {
          DEFAULT: "var(--border)",
          subtle: "var(--border-subtle)",
          default: "var(--border-default)",
          strong: "var(--border-strong)",
          focus: "var(--border-focus)"
        },
        input: "var(--input)",
        ring: "var(--ring)",

        /* ----- Role tokens (preferred for components) ----- */
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          disabled: "var(--text-disabled)",
          inverse: "var(--text-inverse)",
          link: "var(--text-link)"
        },
        surface: {
          base: "var(--surface-base)",
          raised: "var(--surface-raised)",
          sunken: "var(--surface-sunken)",
          muted: "var(--surface-muted)",
          overlay: "var(--surface-overlay)",
          inverse: "var(--surface-inverse)"
        },

        /* ----- Severity tokens (risk classification) ----- */
        severity: {
          "low-fill": "var(--severity-low-fill)",
          "low-bg": "var(--severity-low-bg)",
          "low-text": "var(--severity-low-text)",
          "medium-fill": "var(--severity-medium-fill)",
          "medium-bg": "var(--severity-medium-bg)",
          "medium-text": "var(--severity-medium-text)",
          "high-fill": "var(--severity-high-fill)",
          "high-bg": "var(--severity-high-bg)",
          "high-text": "var(--severity-high-text)",
          "very-high-fill": "var(--severity-very-high-fill)",
          "very-high-bg": "var(--severity-very-high-bg)",
          "very-high-text": "var(--severity-very-high-text)",
          "critical-fill": "var(--severity-critical-fill)",
          "critical-bg": "var(--severity-critical-bg)",
          "critical-text": "var(--severity-critical-text)"
        },

        /* ----- Data viz palette ----- */
        viz: {
          1: "var(--viz-1)",
          2: "var(--viz-2)",
          3: "var(--viz-3)",
          4: "var(--viz-4)",
          5: "var(--viz-5)",
          6: "var(--viz-6)"
        },

        /* ----- Semantic (system feedback) ----- */
        success: "var(--semantic-success)",
        warning: "var(--semantic-warning)",
        error: "var(--semantic-error)",
        info: "var(--semantic-info)"
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
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "0.75rem",
        "2xl": "0.875rem"
      }
    }
  },
  plugins: []
};
