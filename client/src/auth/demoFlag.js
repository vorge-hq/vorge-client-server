export function isDemoEnabled() {
  return import.meta.env?.VITE_ENABLE_DEMO === "true";
}
