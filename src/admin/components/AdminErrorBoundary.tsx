import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render/runtime errors anywhere in the admin app so a crash shows a
 * recovery screen instead of a blank white page (mirrors the consumer app's
 * ErrorBoundary, minus its PWA stale-chunk reload logic — the admin app has
 * no service worker).
 */
export default class AdminErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Admin app crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
        <p className="max-w-xs text-sm text-slate-500">
          The admin panel hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          onClick={() => window.location.assign("/")}
          className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition active:scale-95"
        >
          Reload
        </button>
      </div>
    );
  }
}
