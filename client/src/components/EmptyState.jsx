export function EmptyState({ title, description, action, icon }) {
  return (
    <div className="surface-card flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? <span className="text-3xl" aria-hidden="true">{icon}</span> : null}
      <p className="text-base font-semibold text-zinc-900">{title}</p>
      {description ? <p className="max-w-md text-sm text-zinc-600">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
