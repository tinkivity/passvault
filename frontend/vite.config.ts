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
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['@base-ui/react', 'cmdk'],
          'vendor-charts': ['recharts'],
          'vendor-crypto': ['hash-wasm'],
          'vendor-passkey': ['@simplewebauthn/browser'],
          'vendor-markdown': ['react-markdown'],
          'vendor-table': ['@tanstack/react-table'],
          'vendor-icons': ['@heroicons/react', 'lucide-react'],
        },
      },
    },
  },
});
