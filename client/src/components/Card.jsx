export function Card({ children, className = "", as: Component = "section" }) {
  return (
    <Component className={`surface-card p-5 ${className}`}>
      {children}
    </Component>
  );
}

export function CardHeader({ eyebrow, title, description, action, className = "" }) {
  return (
    <header className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div>
        {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
        {title ? <h2 className="mt-1 text-lg font-semibold text-zinc-900">{title}</h2> : null}
        {description ? <p className="mt-1 text-sm text-zinc-600">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function CardSection({ title, children, className = "" }) {
  return (
    <div className={`mt-4 rounded-xl bg-zinc-50 p-4 ${className}`}>
      {title ? (
        <p className="section-eyebrow mb-2">{title}</p>
      ) : null}
      <div className="text-sm text-zinc-700">{children}</div>
    </div>
  );
}
