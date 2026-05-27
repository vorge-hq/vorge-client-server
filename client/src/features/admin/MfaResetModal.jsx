import { useState } from "react";
import { ApiError, apiRequest } from "../../api/client";
import { Modal } from "../../components/Modal";
import { Banner } from "../../components/Banner";

/**
 * Admin-side MFA reset modal. Wraps the existing Modal component (per chunk-4
 * UI checklist row 5). Posts to /api/auth/mfa/admin-reset; on success calls
 * `onComplete()` so the parent can refresh the user row.
 *
 * Not yet wired into the Admin UI (no user-management page exists in the
 * client codebase as of chunk 4). This file is the building block for future
 * Admin work.
 */
export function MfaResetModal({ open, onClose, target, onComplete }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!open) return null;

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest("/api/auth/mfa/admin-reset", {
        method: "POST",
        body: JSON.stringify({ targetUserId: target?.id })
      });
      if (onComplete) onComplete();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reset failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Reset MFA for user">
      <div className="space-y-4">
        <p className="text-sm text-zinc-700">
          You're about to reset MFA for <strong>{target?.name || target?.email}</strong>.
        </p>
        <Banner tone="warning" title="This is destructive">
          <ul className="ml-4 list-disc text-sm">
            <li>All of their active sessions will be killed.</li>
            <li>All of their trusted-browser cookies will be invalidated.</li>
            <li>Their TOTP secret and recovery codes will be wiped.</li>
            <li>They will re-enroll on next login.</li>
            <li>Their password is NOT affected.</li>
          </ul>
        </Banner>
        {error ? <Banner tone="danger" title="Failed">{error}</Banner> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Resetting…" : "Confirm reset"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
