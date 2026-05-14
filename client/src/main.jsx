import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/Toast'
import GlobalLoader from './components/GlobalLoader'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ToastProvider>
            <GlobalLoader />
            <App />
        </ToastProvider>
    </React.StrictMode>,
)
