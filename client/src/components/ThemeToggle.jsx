import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

/* tone="default" — ghost button on light surfaces (uses semantic tokens)
   tone="topbar" — white-tinted ghost for the navy app-topbar, matching
                   the Bell/LogOut buttons rendered alongside it.        */
const TONE_CLASSES = {
  default:
    "text-text-secondary hover:bg-surface-muted hover:text-text-primary",
  topbar: "text-white/70 hover:bg-white/10 hover:text-white"
};

export function ThemeToggle({ tone = "default", className = "" }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  const Icon = isDark ? Sun : Moon;
  const toneClasses = TONE_CLASSES[tone] || TONE_CLASSES.default;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md bg-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-0 ${toneClasses} ${className}`.trim()}
    >
      <Icon size={16} strokeWidth={2} aria-hidden />
    </button>
  );
}

export default ThemeToggle;
