import { useState } from "react";
import { Modal } from "../../components/Modal";

export const ACK_REASONS = ["Not applicable", "False positive", "Will address", "Other"];

/* Reason picker for acknowledging an advisory anomaly. Reuses the shared
   (tokenised) Modal. A short note is required only when "Other". */
export function AnomalyAcknowledgeModal({ open, message, onClose, onConfirm }) {
  const [reason, setReason] = useState(ACK_REASONS[0]);
  const [note, setNote] = useState("");

  const needsNote = reason === "Other";
  const canSubmit = !needsNote || note.trim().length > 0;

  function handleConfirm() {
    if (!canSubmit) return;
    onConfirm(reason, needsNote ? note.trim() : "");
  }

  return (
    <Modal
      open={open}
      title="Acknowledge anomaly"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSubmit}
            onClick={handleConfirm}
          >
            Acknowledge
          </button>
        </>
      }
    >
      {message ? <p className="text-[13px] text-text-secondary">{message}</p> : null}

      <fieldset className="space-y-2">
        <legend className="field-label mb-1">Reason</legend>
        {ACK_REASONS.map((option) => (
          <label
            key={option}
            className="flex items-center gap-2 text-[13px] text-text-primary"
          >
            <input
              type="radio"
              name="anomaly-ack-reason"
              value={option}
              checked={reason === option}
              onChange={() => setReason(option)}
            />
            {option}
          </label>
        ))}
      </fieldset>

      {needsNote ? (
        <label className="block">
          <span className="field-label mb-1.5 block">
            Note <span className="text-text-muted">(required)</span>
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Briefly explain why this is being dismissed…"
            className="field-control resize-y"
          />
        </label>
      ) : null}
    </Modal>
  );
}
