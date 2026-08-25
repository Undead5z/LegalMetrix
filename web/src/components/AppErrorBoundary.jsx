import { Component } from 'react';

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return <main className="app-error"><span className="eyebrow">APPLICATION ERROR</span><h1>Unable to display this page</h1><p>{this.state.error.message || 'An unexpected client error occurred.'}</p><a className="button button--gold" href="/">Return to command centre</a></main>;
    }
    return this.props.children;
  }
}
