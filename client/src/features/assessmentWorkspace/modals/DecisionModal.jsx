import { useState } from "react";
import { X, Check, AlertTriangle, ArrowLeft } from "lucide-react";

const KIND_CONFIG = {
  "review-complete": {
    title: "Mark review complete",
    description: "Forward this assessment to the Approver. Reviewer signature is stamped.",
    submitLabel: "Mark complete",
    submitClass: "btn-primary",
    submitStyle: { background: "#1E3A5F", borderColor: "#1E3A5F" },
    icon: Check,
    iconColor: "#065f46",
    requireReason: false,
    placeholder: "Optional note for the Approver",
    fieldLabel: "Note (optional)"
  },
  "reviewer-send-back": {
    title: "Send back to Author",
    description: "Returns the assessment to Draft so the Author can revise. A reason is required.",
    submitLabel: "Send back",
    submitClass: "btn-warn",
    submitStyle: undefined,
    icon: ArrowLeft,
    iconColor: "#9a3412",
    requireReason: true,
    placeholder: "Tell the Author what needs to change",
    fieldLabel: "Reason"
  },
  approve: {
    title: "Approve assessment",
    description: "Approver signature is stamped and the version is frozen.",
    submitLabel: "Approve",
    submitClass: "btn-primary",
    submitStyle: { background: "#1E3A5F", borderColor: "#1E3A5F" },
    icon: Check,
    iconColor: "#065f46",
    requireReason: false,
    placeholder: "Optional approval note",
    fieldLabel: "Approval note (optional)"
  },
  "approver-send-back": {
    title: "Send back to Reviewer",
    description: "Reviewer signature is cleared. They will need to mark complete again.",
    submitLabel: "Send back to Reviewer",
    submitClass: "btn-warn",
    submitStyle: undefined,
    icon: ArrowLeft,
    iconColor: "#9a3412",
    requireReason: true,
    placeholder: "What does the Reviewer need to revisit?",
    fieldLabel: "Reason"
  },
  reject: {
    title: "Reject to Draft",
    description: "All signatures are cleared and the assessment returns to Draft. A reason is required.",
    submitLabel: "Reject",
    submitClass: "btn-danger",
    submitStyle: undefined,
    icon: AlertTriangle,
    iconColor: "#991b1b",
    requireReason: true,
    placeholder: "Reason for rejection",
    fieldLabel: "Reason"
  }
};

export function DecisionModal({ kind, onClose, onConfirm }) {
  const config = KIND_CONFIG[kind];
  const [comment, setComment] = useState("");

  if (!config) return null;
  const KindIcon = config.icon;
  const submittable = !config.requireReason || comment.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-3">
          <div className="flex items-start gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md"
              style={{ background: "#EFF4FB", color: config.iconColor }}
            >
              <KindIcon size={16} />
            </div>
            <div>
              <div className="text-[14px] font-semibold">{config.title}</div>
              <div className="text-[11px] text-zinc-500">{config.description}</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-[13px]">
          <label className="block">
            <span className="field-label mb-1.5 block">{config.fieldLabel}</span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={4}
              className="field-control"
              placeholder={config.placeholder}
            />
            {config.requireReason && comment.trim().length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-700">A reason is required.</p>
            ) : null}
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(comment.trim())}
            disabled={!submittable}
            className={`${config.submitClass} disabled:cursor-not-allowed disabled:opacity-60`}
            style={config.submitStyle}
          >
            {config.submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
