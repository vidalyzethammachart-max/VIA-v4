import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportError } from "../services/errorReporter";
import AppErrorFallback from "./AppErrorFallback";

type State = { failed: boolean };

// Catches render crashes anywhere below it, reports them, and shows a plain fallback.
export default class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { source: "react", context: { componentStack: info.componentStack } });
  }

  render() {
    return this.state.failed ? <AppErrorFallback /> : this.props.children;
  }
}
