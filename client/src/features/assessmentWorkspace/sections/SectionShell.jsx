export function SectionShell({ number, title, description, actions, children, footer }) {
  return (
    <article className="surface-card p-5 sm:p-6">
      <header className="flex flex-col gap-3 border-b border-border-default pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="section-eyebrow">Section {number}</p>
          <h2 className="mt-1 text-xl font-bold text-text-primary">{title}</h2>
          {description ? <p className="mt-2 text-sm text-text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>

      <div className="mt-5 grid gap-5">{children}</div>

      {footer ? <footer className="mt-6 border-t border-border-default pt-4">{footer}</footer> : null}
    </article>
  );
}
