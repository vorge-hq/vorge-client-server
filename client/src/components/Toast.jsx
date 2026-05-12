import { Check } from "lucide-react";
import { useWorkspace } from "../features/assessmentWorkspace/WorkspaceContext";

export function Toast() {
  const { toast } = useWorkspace();
  if (!toast) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow-lg"
      role="status"
      aria-live="polite"
    >
      <Check size={14} aria-hidden /> {toast}
    </div>
  );
}
