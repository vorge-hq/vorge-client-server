import { AlertCircle, AlertTriangle, Check, Info } from "lucide-react";
import { useWorkspace } from "../features/assessmentWorkspace/WorkspaceContext";

const TONE_STYLES = {
  success: {
    container: "bg-primary text-primary-foreground",
    Icon: Check,
    role: "status",
    ariaLive: "polite"
  },
  error: {
    container: "bg-error text-white",
    Icon: AlertCircle,
    role: "alert",
    ariaLive: "assertive"
  },
  warning: {
    container: "bg-warning text-zinc-900",
    Icon: AlertTriangle,
    role: "status",
    ariaLive: "polite"
  },
  info: {
    container: "bg-info text-white",
    Icon: Info,
    role: "status",
    ariaLive: "polite"
  }
};

export function Toast() {
  const { toast, dismissToast } = useWorkspace();
  if (!toast) return null;

  /* Backwards-compat: older callers / state shapes may still hand us a
     plain string. Normalize before render. */
  const { message, action, tone } =
    typeof toast === "string"
      ? { message: toast, action: null, tone: "success" }
      : { tone: toast.tone || "success", ...toast };

  const styles = TONE_STYLES[tone] || TONE_STYLES.success;
  const { Icon } = styles;

  return (
    <div
      className={`fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-md px-3 py-2 text-sm shadow-lg ${styles.container}`}
      role={styles.role}
      aria-live={styles.ariaLive}
    >
      <Icon size={14} aria-hidden />
      <span>{message}</span>
      {action ? (
        <button
          type="button"
          onClick={() => {
            action.onClick();
            dismissToast?.();
          }}
          className="ml-2 rounded px-2 py-0.5 text-xs font-semibold underline underline-offset-2 hover:bg-white/10"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
