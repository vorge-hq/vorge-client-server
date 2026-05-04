import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const COPY = {
  withdraw: {
    title: "Withdraw submission",
    description:
      "The submission can be withdrawn while the Reviewer has not opened the assessment.",
    placeholder: "Why are you withdrawing?",
    actionClass: "btn-primary",
    actionStyle: { background: "#1E3A5F", borderColor: "#1E3A5F" },
    actionLabel: "Confirm withdraw",
    banner:
      "Withdrawing returns the assessment to Draft and notifies the Reviewer."
  },
  "withdraw-reviewer": {
    title: "Withdraw forward",
    description: "Send the assessment back to In Review while the Approver has not opened.",
    placeholder: "Why are you withdrawing?",
    actionClass: "btn-primary",
    actionStyle: { background: "#1E3A5F", borderColor: "#1E3A5F" },
    actionLabel: "Withdraw",
    banner:
      "Reviewer signature will be cleared so you can revise before re-forwarding to the Approver."
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

export function WithdrawModal({ mode = "withdraw", onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const config = COPY[mode] || COPY.withdraw;

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
