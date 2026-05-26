const crypto = require("crypto");

/**
 * Stub email delivery. Logs a hashed email tag + the reset URL so dev can
 * copy the link without leaking raw addresses to the logs.
 *
 * Replace with a real provider integration in Phase 3 (e.g. SES, SendGrid,
 * Postmark). The signature is the boundary — keep `sendPasswordResetEmail`
 * shape stable so callers don't change.
 */
function sendPasswordResetEmail(email, resetUrl) {
  const tag = crypto.createHash("sha256").update(String(email || "")).digest("hex").slice(0, 12);
  // eslint-disable-next-line no-console
  console.log(`[email stub] password reset for ${tag}: ${resetUrl}`);
}

module.exports = {
  sendPasswordResetEmail
};
