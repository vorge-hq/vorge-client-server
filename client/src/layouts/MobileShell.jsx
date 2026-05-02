export function MobileShell({ title, eyebrow, children, action }) {
  return (
    <section className="grid gap-4 pb-20">
      {(title || eyebrow) && (
        <header>
          {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
          {title ? <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1> : null}
        </header>
      )}
      <div className="grid gap-4">{children}</div>
      {action ? (
        <div className="fixed inset-x-0 bottom-16 z-10 border-t border-slate-200 bg-white p-3 lg:hidden">
          {action}
        </div>
      ) : null}
    </section>
  );
}
