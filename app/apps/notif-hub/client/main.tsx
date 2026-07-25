import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Notification clicks with a nostr: target land here (service workers can't
// open custom schemes); hand the URI to the OS-registered nostr client.
const openTarget = new URLSearchParams(window.location.search).get('open')
if (openTarget?.startsWith('nostr:')) {
  window.location.replace(openTarget)
} else {
  createRoot(document.getElementById('root')!).render(<App />)
}
