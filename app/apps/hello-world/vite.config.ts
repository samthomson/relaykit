import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/apps/hello-world/',
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client'),
    },
  },
  server: {
    watch: {
      ignored: ['**/data/**', '**/node_modules/**'],
    },
    proxy: {
      '/apps/hello-world/api': {
        target: 'http://localhost:3100',
        rewrite: (p) => p.replace('/apps/hello-world', ''),
      },
    },
  },
})
