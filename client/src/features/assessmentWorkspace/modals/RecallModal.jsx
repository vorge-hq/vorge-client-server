import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const COPY = {
  "recall-immediate": {
    title: "Recall submission",
    description:
      "Recall this assessment? It will return to Draft. The Reviewer has not opened it yet.",
    placeholder: "Why are you recalling?",
    actionClass: "btn-primary",
    actionStyle: { background: "#1E3A5F", borderColor: "#1E3A5F" },
    actionLabel: "Confirm recall",
    banner:
      "Recall returns the assessment to Draft and notifies the Reviewer. Logged in the audit trail."
  },
  "reviewer-recall-immediate": {
    title: "Recall submission",
    description:
      "Recall this assessment? It will return to In Review. The Approver has not opened it yet.",
    placeholder: "Why are you recalling?",
    actionClass: "btn-primary",
    actionStyle: { background: "#1E3A5F", borderColor: "#1E3A5F" },
    actionLabel: "Confirm recall",
    banner:
      "Recall returns the assessment to In Review and notifies the Approver. Logged in the audit trail."
  },
  recall: {
    title: "Request recall from Reviewer",
    description:
      "Reviewer has already opened the assessment. Send a recall request — the Reviewer must approve it.",
    placeholder: "Why are you requesting a recall?",
    actionClass: "btn-warn",
    actionStyle: undefined,
    actionLabel: "Send recall request",
    banner: "Recall is logged in the audit trail. The Reviewer will see your request."
  },
  "recall-reviewer": {
    title: "Request recall from Approver",
    description:
      "Approver has already opened the assessment. Send a recall request — the Approver must approve it.",
    placeholder: "Why are you requesting a recall?",
    actionClass: "btn-warn",
    actionStyle: undefined,
    actionLabel: "Send recall request",
    banner: "Recall is logged in the audit trail. The Approver will see your request."
  }
};

export function RecallModal({ mode = "recall-immediate", onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const config = COPY[mode] || COPY["recall-immediate"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-3">
          <div>
            <div className="text-[14px] font-semibold">{config.title}</div>
            <div className="text-[11px] text-zinc-500">{config.description}</div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-[13px]">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{config.banner}</span>
          </div>
          <label className="block">
            <span className="field-label mb-1.5 block">Reason</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              className="field-control"
              placeholder={config.placeholder}
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            className={config.actionClass}
            style={config.actionStyle}
          >
            {config.actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
