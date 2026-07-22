import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const backendHost = env.VITE_API_HOST || 'localhost';
  const backendPort = env.PORT || '8080';
  const frontendPort = Number(env.VITE_FRONTEND_PORT || '3000');
  const apiTarget = env.VITE_API_URL || `http://${backendHost}:${backendPort}`;
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png'],
        manifest: {
          name: 'ProjectGrapher AI',
          short_name: 'ProjectGrapher',
          description: 'Analizador de arquitectura de software local con IA',
          theme_color: '#030712',
          background_color: '#030712',
          display: 'standalone',
          icons: [
            {
              src: 'favicon.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'favicon.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'favicon.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.DISABLE_HMR': JSON.stringify(process.env.DISABLE_HMR),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: frontendPort,
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        }
      }
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'd3-vendor': ['d3'],
            'ui-vendor': ['@xyflow/react', 'motion', 'lucide-react'],
            'ai-vendor': ['openai', '@google/genai'],
            'state-vendor': ['zustand', 'dexie'],
          }
        }
      }
    },
  };
});
