import { AlertTriangle } from "lucide-react";

export function ValidationSummary({ errors }) {
  if (!errors || errors.length === 0) return null;
  return (
    <div
      id="section-validation"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-900"
      role="alert"
    >
      <p className="mb-1 inline-flex items-center gap-1.5 font-semibold">
        <AlertTriangle size={12} aria-hidden />
        {errors.length} validation issue{errors.length === 1 ? "" : "s"} on this section
      </p>
      <ul className="list-disc space-y-0.5 pl-5">
        {errors.map((err, idx) => (
          <li key={`${err.code || "err"}-${idx}`}>{err.message}</li>
        ))}
      </ul>
    </div>
  );
}
