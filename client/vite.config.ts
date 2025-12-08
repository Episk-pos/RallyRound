import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend URL - defaults to 8765, can be overridden with VITE_API_URL
const backendUrl = process.env.VITE_API_URL || 'http://localhost:8765'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/auth': {
        target: backendUrl,
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
      '/gun': {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
      },
      '/scheduling': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/notifications': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/test': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/health': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
  define: {
    // GunDB needs these globals
    global: 'globalThis',
  },
})
