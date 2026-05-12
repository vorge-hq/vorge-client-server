import { Check } from "lucide-react";
import { useWorkspace } from "../features/assessmentWorkspace/WorkspaceContext";

export function Toast() {
  const { toast, dismissToast } = useWorkspace();
  if (!toast) return null;

  /* Backwards-compat: older callers / state shapes may still hand us a
     plain string. Normalize before render. */
  const { message, action } =
    typeof toast === "string" ? { message: toast, action: null } : toast;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow-lg"
      role="status"
      aria-live="polite"
    >
      <Check size={14} aria-hidden />
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
