import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/* Top-level error boundary so an unhandled render error doesn't drop
   the user on a blank white screen. We render a small branded fallback
   that gives them a clear next action (reload). The error itself is
   logged to the console so it can be picked up by the (eventual)
   Sentry integration without further wiring. */

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[Vantage] Unhandled render error", error, info);
  }

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-surface-base p-6">
          <div className="w-full max-w-md rounded-xl border border-border-default bg-surface-raised p-6 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-error/10 text-error">
                <AlertTriangle size={16} aria-hidden />
              </span>
              <h1 className="text-base font-semibold text-text-primary">Something went wrong</h1>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-text-secondary">
              The Vantage app hit an unexpected error and couldn't continue. Your data is safe — try
              reloading the page. If this keeps happening, let your administrator know.
            </p>
            {this.state.error?.message ? (
              <pre className="mb-4 max-h-32 overflow-auto rounded-md border border-border-subtle bg-surface-muted p-2 text-[11px] leading-tight text-text-muted">
                {String(this.state.error.message)}
              </pre>
            ) : null}
            <button
              type="button"
              onClick={this.handleReload}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <RefreshCw size={13} aria-hidden /> Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
