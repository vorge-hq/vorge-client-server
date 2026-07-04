// Streams a Blob to the browser as a file download. Isolated in its own module
// so it can be mocked in tests (the anchor-click has no assertable return) and
// so the DOM plumbing lives in exactly one place.
export function triggerBrowserDownload(blob, filename) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "export";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
