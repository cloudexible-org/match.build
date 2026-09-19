import { Component, type ReactNode } from "react";

/**
 * Shows `fallback` instead of crashing the page when a child throws — e.g. a
 * query refusing a malformed id pasted into the URL. Give it a `key` that
 * changes with its inputs so new inputs get a fresh try.
 */
export class ErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
