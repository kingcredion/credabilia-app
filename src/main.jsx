import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { inject } from '@vercel/analytics';
import './theme.css';
import './styles.css';
import './branding.css';
import './showroom.css';

// Vercel Web Analytics: cookieless page-view counts, loaded only on the real sites (not localhost, previews or the native apps).
if (/^(www\.)?credabilia\.(com|app)$/.test(window.location.hostname)) inject();

class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) return <main className="setup"><h1>Something didn’t load.</h1><p>Please refresh to try again. Your saved data is unaffected.</p><button onClick={() => window.location.reload()}>Refresh</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><React.Suspense fallback={<main className="setup" role="status">Loading Credabilia…</main>}><App /></React.Suspense></ErrorBoundary>);
