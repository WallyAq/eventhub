import { Component } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ErrorPage } from '../pages/ErrorPage';

class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean; error: unknown }> {
  state: { failed: boolean; error: unknown } = { failed: false, error: null };

  static getDerivedStateFromError(error: unknown) { return { failed: true, error }; }

  componentDidUpdate(previous: Readonly<{ resetKey: string }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.retry();
  }

  retry = () => this.setState({ failed: false, error: null });

  render() {
    return this.state.failed ? <ErrorPage error={this.state.error} onRetry={this.retry} /> : this.props.children;
  }
}

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  return <ErrorBoundary resetKey={pathname + search}>{children}</ErrorBoundary>;
}
