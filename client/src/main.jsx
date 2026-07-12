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

if ('serviceWorker' in navigator && import.meta.env.DEV) {
  // Dev mode: kill any previously-installed service worker + its caches so
  // localhost always serves fresh code (the SW otherwise serves stale bundles)
  navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
  if (window.caches) caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[VGTC] Service Worker registered');

        // ── Update detection ──────────────────────────────────────────────
        // When a new SW is found (new Netlify deploy), notify the user
        const notifyUpdate = () => {
          window.dispatchEvent(new CustomEvent('sw-update-available'));
        };

        // New SW installing now
        if (reg.installing) {
          reg.installing.addEventListener('statechange', (e) => {
            if (e.target.state === 'installed' && navigator.serviceWorker.controller) notifyUpdate();
          });
        }

        // New SW found during this session
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) notifyUpdate();
          });
        });

        // Poll for updates every 30 minutes (catches deploys while app is open)
        setInterval(() => reg.update(), 30 * 60 * 1000);

        // When SW takes control after user clicks "Update" → reload page
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        });

        // Listen for SW messages (prefetch done etc.)
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'PREFETCH_DONE') {
            console.log('[VGTC] Critical API data pre-fetched and cached');
          }
        });
      })
      .catch(e => console.warn('[VGTC] SW registration failed:', e));
  });
}

// Trigger SW skip-waiting: tell the waiting SW to take control
window.applyUpdate = () => {
  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  });
};

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
