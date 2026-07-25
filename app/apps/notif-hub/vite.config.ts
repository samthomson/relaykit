import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  // Dev runs path-mounted under relaykit; the preset build serves from its own domain root (NH_BASE=/).
  base: process.env.NH_BASE || '/apps/notif-hub/',
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client'),
    },
  },
  server: {
    // Allow tunnel hostnames (e.g. trycloudflare.com) for testing push on a phone in dev.
    allowedHosts: true,
    watch: {
      ignored: ['**/data/**', '**/node_modules/**'],
    },
    proxy: {
      '/apps/notif-hub/api': {
        target: 'http://localhost:3200',
        rewrite: (p) => p.replace('/apps/notif-hub', ''),
      },
    },
  },
})
