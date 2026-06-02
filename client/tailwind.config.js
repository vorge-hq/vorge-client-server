/**
 * Vorge tailwind config — v2
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
          /* Full ramp also exposed via channel duals so opacity-modifier
             (color/N) syntax works. Hex companions remain for any direct
             var(--primary-N) consumers. */
          10: "rgb(var(--primary-10-rgb) / <alpha-value>)",
          50: "rgb(var(--primary-50-rgb) / <alpha-value>)",
          100: "rgb(var(--primary-100-rgb) / <alpha-value>)",
          200: "rgb(var(--primary-200-rgb) / <alpha-value>)",
          300: "rgb(var(--primary-300-rgb) / <alpha-value>)",
          400: "rgb(var(--primary-400-rgb) / <alpha-value>)",
          500: "rgb(var(--primary-500-rgb) / <alpha-value>)",
          600: "rgb(var(--primary-600-rgb) / <alpha-value>)",
          700: "rgb(var(--primary-700-rgb) / <alpha-value>)",
          800: "rgb(var(--primary-800-rgb) / <alpha-value>)",
          900: "rgb(var(--primary-900-rgb) / <alpha-value>)"
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
          10: "rgb(var(--secondary-10-rgb) / <alpha-value>)",
          50: "rgb(var(--secondary-50-rgb) / <alpha-value>)",
          100: "rgb(var(--secondary-100-rgb) / <alpha-value>)",
          200: "rgb(var(--secondary-200-rgb) / <alpha-value>)",
          300: "rgb(var(--secondary-300-rgb) / <alpha-value>)",
          400: "rgb(var(--secondary-400-rgb) / <alpha-value>)",
          500: "rgb(var(--secondary-500-rgb) / <alpha-value>)",
          600: "rgb(var(--secondary-600-rgb) / <alpha-value>)",
          700: "rgb(var(--secondary-700-rgb) / <alpha-value>)",
          800: "rgb(var(--secondary-800-rgb) / <alpha-value>)",
          900: "rgb(var(--secondary-900-rgb) / <alpha-value>)"
        },
        tertiary: {
          10: "rgb(var(--tertiary-10-rgb) / <alpha-value>)",
          50: "rgb(var(--tertiary-50-rgb) / <alpha-value>)",
          100: "rgb(var(--tertiary-100-rgb) / <alpha-value>)",
          200: "rgb(var(--tertiary-200-rgb) / <alpha-value>)",
          300: "rgb(var(--tertiary-300-rgb) / <alpha-value>)",
          400: "rgb(var(--tertiary-400-rgb) / <alpha-value>)",
          500: "rgb(var(--tertiary-500-rgb) / <alpha-value>)",
          600: "rgb(var(--tertiary-600-rgb) / <alpha-value>)",
          700: "rgb(var(--tertiary-700-rgb) / <alpha-value>)",
          800: "rgb(var(--tertiary-800-rgb) / <alpha-value>)",
          900: "rgb(var(--tertiary-900-rgb) / <alpha-value>)"
        },
        gray: {
          10: "rgb(var(--gray-10-rgb) / <alpha-value>)",
          50: "rgb(var(--gray-50-rgb) / <alpha-value>)",
          100: "rgb(var(--gray-100-rgb) / <alpha-value>)",
          200: "rgb(var(--gray-200-rgb) / <alpha-value>)",
          300: "rgb(var(--gray-300-rgb) / <alpha-value>)",
          400: "rgb(var(--gray-400-rgb) / <alpha-value>)",
          500: "rgb(var(--gray-500-rgb) / <alpha-value>)",
          600: "rgb(var(--gray-600-rgb) / <alpha-value>)",
          700: "rgb(var(--gray-700-rgb) / <alpha-value>)",
          800: "rgb(var(--gray-800-rgb) / <alpha-value>)",
          900: "rgb(var(--gray-900-rgb) / <alpha-value>)"
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
