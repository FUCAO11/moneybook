import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 发现新版本自动下载，下一次打开生效
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'MoneyBook',
        short_name: 'MoneyBook',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0d6efd',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        runtimeCaching: [
          // HTML：在线时优先网络，用于发现更新
          { urlPattern: ({request}) => request.mode === 'navigate', handler: 'NetworkFirst' },
          // 其它静态资源：SWR 秒开
          { urlPattern: ({request}) => ['script','style','image','font'].includes(request.destination), handler: 'StaleWhileRevalidate' }
        ]
      }
    })
  ]
});
