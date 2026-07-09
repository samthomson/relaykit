import { createRoot } from 'react-dom/client'
import './lib/polyfills.ts'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
