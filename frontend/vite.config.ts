import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  preview: {
    // E2E proxy: when e2etest.sh sets E2E_API_PROXY_TARGET, vite preview
    // forwards /api requests to the deployed API Gateway. This avoids CORS
    // issues on beta/prod where FRONTEND_ORIGIN is locked to CloudFront.
    proxy: process.env.E2E_API_PROXY_TARGET
      ? {
          '/api': {
            target: process.env.E2E_API_PROXY_TARGET,
            changeOrigin: true,
          },
        }
      : undefined,
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-router')) return 'vendor-react';
          if (id.includes('node_modules/@base-ui') || id.includes('node_modules/cmdk')) return 'vendor-ui';
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'vendor-charts';
          if (id.includes('node_modules/hash-wasm')) return 'vendor-crypto';
          if (id.includes('node_modules/@simplewebauthn')) return 'vendor-passkey';
          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark-') || id.includes('node_modules/rehype-') || id.includes('node_modules/unified') || id.includes('node_modules/mdast-') || id.includes('node_modules/micromark')) return 'vendor-markdown';
          if (id.includes('node_modules/@tanstack/react-table')) return 'vendor-table';
          if (id.includes('node_modules/@heroicons') || id.includes('node_modules/lucide-react')) return 'vendor-icons';
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) return 'vendor-i18n';
          if (id.includes('/locales/')) return 'locales';
        },
      },
    },
  },
});
