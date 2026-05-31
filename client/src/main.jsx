import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/Toast'
import GlobalLoader from './components/GlobalLoader'
import './index.css'

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
        <ToastProvider>
            <GlobalLoader />
            <App />
        </ToastProvider>
    </React.StrictMode>,
)
