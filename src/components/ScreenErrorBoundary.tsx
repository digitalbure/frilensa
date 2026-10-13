import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  onGoHome?: () => void;
  /** Which screen this wraps, for the crash report. */
  screen?: string;
}

/**
 * Keeps a crash in one screen from blanking the whole app: shows what went wrong and a way back.
 * Give it a `key` per screen so switching tabs resets it.
 */
export default class ScreenErrorBoundary extends Component<Props, { error: Error | null }> {
  // The project has no @types/react, so declare the members TypeScript can't see.
  declare props: Props;
  declare setState: (state: { error: Error | null }) => void;
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed:', error, info.componentStack);
    // Send the details to the server (Admin → App errors) so the crash can be fixed without a screenshot.
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: String(error?.message || error),
        stack: String(error?.stack || ''),
        componentStack: String(info?.componentStack || ''),
        screen: this.props.screen || '',
        appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''
      })
    }).catch(() => {});
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="max-w-md mt-16 mx-4 sm:mx-auto bg-white border border-amber-200 rounded-2xl p-6 text-center shadow-xs">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
        <h2 className="mt-3 text-sm font-bold text-slate-800">This screen couldn't be shown</h2>
        <p className="mt-1 text-xs text-slate-500">
          Your data is safe, and we've been sent the details. Try again, or go back to Home. If it keeps happening, tell us what you were doing:
        </p>
        <p className="mt-3 text-[11px] font-mono text-slate-600 bg-slate-50 rounded-lg p-2 break-words">{error.message}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="text-xs font-bold px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
          >
            Try again
          </button>
          {this.props.onGoHome && (
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                this.props.onGoHome?.();
              }}
              className="text-xs font-bold px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
            >
              Go to Home
            </button>
          )}
        </div>
      </div>
    );
  }
}
