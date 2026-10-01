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
        <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif', color: '#f43f5e', background: 'var(--bg, #0f0f0f)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ maxWidth: '480px', background: 'var(--bg-card, #1e293b)', padding: '32px', borderRadius: '16px', border: '1px solid rgba(244,63,94,0.3)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '20px', color: '#f43f5e' }}>Something went wrong</h2>
            <p style={{ fontSize: '13px', margin: '0 0 16px 0', color: 'var(--text-sub, #9ca3af)' }}>
              {this.state.error?.message || 'An unexpected display error occurred.'}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => this.setState({ error: null })} style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}>
                Try Again
              </button>
              <button onClick={() => window.location.reload()} style={{ padding: '9px 18px', background: 'transparent', color: 'var(--text, #fff)', border: '1px solid var(--border, #475569)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>
                Reload Page
              </button>
            </div>
          </div>
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
        // When a new SW is found (a new deploy), notify the user
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

// Disable mouse wheel value changes on all number inputs globally across all modules
window.addEventListener('wheel', () => {
  const active = document.activeElement;
  if (active && active.tagName === 'INPUT' && active.type === 'number') {
    active.blur();
  }
}, { passive: true });

document.addEventListener('wheel', (e) => {
  const target = e.target;
  if (target && target.tagName === 'INPUT' && target.type === 'number') {
    target.blur();
  }
}, { passive: true });

document.addEventListener('focusin', (e) => {
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'number') {
    if (!e.target.__wheelBlocked) {
      e.target.__wheelBlocked = true;
      e.target.addEventListener('wheel', (we) => {
        we.target.blur();
      }, { passive: true });
    }
  }
}, true);

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
