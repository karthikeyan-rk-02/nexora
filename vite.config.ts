import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:8787' } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'NEXORA – AI Search Engine', short_name: 'NEXORA',
        description: 'Your personal AI-powered web search and research assistant.',
        start_url: '/', scope: '/', display: 'standalone', orientation: 'any',
        theme_color: '#0B0B0D', background_color: '#0B0B0D',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api/], cleanupOutdatedCaches: true }
    })
  ]
})
