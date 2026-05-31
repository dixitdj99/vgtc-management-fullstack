import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/Toast'
import GlobalLoader from './components/GlobalLoader'
import './index.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('[VGTC] Service Worker registered'))
      .catch(e => console.warn('[VGTC] SW registration failed:', e));
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ToastProvider>
            <GlobalLoader />
            <App />
        </ToastProvider>
    </React.StrictMode>,
)
