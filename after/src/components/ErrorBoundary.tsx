import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Catches render errors so users see a message and a reload button instead of a blank page. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Hook your error reporting here (Sentry etc.). Console keeps the stack for now.
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="container">
        <div className="card" role="alert">
          <h1>Something went wrong</h1>
          <p className="error">{this.state.error.message}</p>
          <button onClick={() => window.location.reload()}>Reload the page</button>
        </div>
      </div>
    );
  }
}
