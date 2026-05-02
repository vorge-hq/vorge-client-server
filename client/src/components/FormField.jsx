export function FormField({ label, hint, error, required, children, htmlFor }) {
  return (
    <div className="grid gap-1.5">
      {label ? (
        <label htmlFor={htmlFor} className="field-label">
          {label}
          {required ? <span className="ml-1 text-red-600">*</span> : null}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="text-xs text-slate-500">{hint}</p> : null}
      {error ? <p className="text-xs font-medium text-red-700">{error}</p> : null}
    </div>
  );
}

export function TextInput({ className = "", ...props }) {
  return <input {...props} className={`field-control ${className}`} />;
}

export function TextArea({ className = "", rows = 4, ...props }) {
  return <textarea {...props} rows={rows} className={`field-control resize-y ${className}`} />;
}

export function Select({ className = "", children, ...props }) {
  return (
    <select {...props} className={`field-control ${className}`}>
      {children}
    </select>
  );
}
