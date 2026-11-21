import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// API_URL lets you point the dev/preview proxy at a backend on another port
const proxy = { '/api': process.env.API_URL ?? 'http://localhost:8000' }

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // brand images the shell needs offline (the 1.1 MB source Mirrorly_Logo.png is never referenced, so never downloaded)
      includeAssets: ['favicon.png', 'apple-touch-icon-180x180.png', 'brand-mark.png', 'logo-light.webp', 'logo-dark.webp'],
      manifest: {
        name: 'Mirrorly',
        short_name: 'Mirrorly',
        description: 'Track everything about your life: expenses first.',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Precache the app shell only. /api/* has no runtime route, so it always hits the network:
      // financial data is never served stale from cache.
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  server: { proxy },
  preview: { proxy },
})
