import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 本番ビルドのみ有効（devOptions 既定値 = dev では SW を登録しない）
      // autoUpdate: 新しいデプロイを検知したら SW を自動更新し、古いキャッシュに固定されるのを防ぐ
      registerType: 'autoUpdate',
      workbox: {
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/rest/v1/rpc/get_calendar_feed'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'calendar-feed',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
      manifest: {
        name: 'タビアミ',
        short_name: 'タビアミ',
        description: 'タビアミは、チャットのアイデアを旅行プランとカレンダーへつなげる共同旅行プランナーです。',
        lang: 'ja',
        display: 'standalone',
        theme_color: '#2a9d8f',
        background_color: '#ffffff',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
