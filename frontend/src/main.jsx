import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'

// file:// (Electron) precisa de HashRouter; http:// usa BrowserRouter normal
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter
import App from './App'
import { ToastProvider } from './components/Toast'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <ToastProvider>
        <App />
      </ToastProvider>
    </Router>
  </React.StrictMode>
)
