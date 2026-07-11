import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render/runtime errors anywhere below it so a crash shows a friendly
 * recovery screen instead of a blank white page.
 *
 * The most common crash in this app is a *stale chunk* after a deploy: the
 * running bundle tries to `import()` a lazy page whose hashed filename no longer
 * exists (Railway shipped a new build + the PWA service worker pruned the old
 * cache). For those we silently reload once to pull the fresh build; a short
 * cooldown in sessionStorage stops a broken deploy from reload-looping.
 */

const RELOAD_KEY = "coterie:last-chunk-reload";
const RELOAD_COOLDOWN_MS = 10_000;

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const name = error instanceof Error ? error.name : "";
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    name === "ChunkLoadError" ||
    msg.includes("dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk")
  );
}

/** Reload at most once per cooldown window; returns false if we just reloaded. */
function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last > RELOAD_COOLDOWN_MS) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch {
    // sessionStorage unavailable (private mode etc.) — fall through to UI.
  }
  return false;
}

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    // Stale-deploy chunk failure: try a one-shot reload to grab the new build.
    if (isChunkLoadError(error) && reloadOnce()) {
      return { hasError: false };
    }
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App crashed:", error, info.componentStack);
  }

  handleReload = () => {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* ignore */
    }
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-5xl">🏐</div>
        <h1 className="text-xl font-bold text-white">Something went wrong</h1>
        <p className="max-w-xs text-sm text-slate-400">
          The app hit an unexpected error. Reloading almost always fixes it.
        </p>
        <button
          onClick={this.handleReload}
          className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition active:scale-95"
        >
          Reload Coterie
        </button>
      </div>
    );
  }
}
