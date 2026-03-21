import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Shown instead of children when an error is caught. Falls back to default UI if omitted. */
  fallback?: ReactNode;
  /** Called when an error is caught — useful for logging services. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

/**
 * Class-based error boundary (React requires class for componentDidCatch).
 * Wraps a subtree and shows a friendly fallback instead of crashing the whole app.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <Dashboard />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center shadow-sm">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Что-то пошло не так
            </h2>
            <p className="text-sm text-muted-foreground mb-1">
              {this.state.error.message || 'Неизвестная ошибка'}
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Попробуйте обновить страницу или нажмите кнопку ниже.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Попробовать снова
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm rounded-md border border-input bg-background hover:bg-accent transition-colors"
              >
                Обновить страницу
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
