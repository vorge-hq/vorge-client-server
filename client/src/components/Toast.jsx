import { Check } from "lucide-react";
import { useWorkspace } from "../features/assessmentWorkspace/WorkspaceContext";

export function Toast() {
  const { toast } = useWorkspace();
  if (!toast) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white shadow-lg"
      style={{ background: "#1E3A5F" }}
      role="status"
      aria-live="polite"
    >
      <Check size={14} aria-hidden /> {toast}
    </div>
  );
}
