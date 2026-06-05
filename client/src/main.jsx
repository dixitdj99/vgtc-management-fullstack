import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/Toast'
import GlobalLoader from './components/GlobalLoader'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e, info) { console.error('[VGTC] Render error:', e, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '40px', fontFamily: 'monospace', color: '#f43f5e', background: '#0f0f0f', minHeight: '100vh' }}>
          <h2>App crashed — open DevTools console for details</h2>
          <pre style={{ fontSize: '12px', marginTop: '16px', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: '20px', padding: '10px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[VGTC] Service Worker registered');

        // Listen for SW messages
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'PREFETCH_DONE') {
            console.log('[VGTC] Critical API data pre-fetched and cached');
            window.dispatchEvent(new CustomEvent('sw-prefetch-done'));
          }
        });
      })
      .catch(e => console.warn('[VGTC] SW registration failed:', e));
  });
}

// Helper: tell the SW to pre-fetch critical API data with current auth token
window.triggerSWPrefetch = () => {
  if (!navigator.serviceWorker?.controller) return;
  const token = localStorage.getItem('vgtc-token');
  if (!token) return;
  navigator.serviceWorker.controller.postMessage({
    type: 'PREFETCH_API',
    authHeader: `Bearer ${token}`,
  });
};

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <ToastProvider>
                <GlobalLoader />
                <App />
            </ToastProvider>
        </ErrorBoundary>
    </React.StrictMode>,
)
