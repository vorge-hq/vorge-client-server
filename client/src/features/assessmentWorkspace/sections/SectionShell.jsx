export function SectionShell({ number, title, description, actions, children, footer }) {
  return (
    <article className="surface-card p-5 sm:p-6">
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="section-eyebrow">Section {number}</p>
          <h2 className="mt-1 text-xl font-bold text-zinc-900">{title}</h2>
          {description ? <p className="mt-2 text-sm text-zinc-600">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>

      <div className="mt-5 grid gap-5">{children}</div>

      {footer ? <footer className="mt-6 border-t border-zinc-200 pt-4">{footer}</footer> : null}
    </article>
  );
}
