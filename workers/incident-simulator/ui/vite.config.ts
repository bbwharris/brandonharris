import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/incident/',
  build: {
    outDir: 'dist/incident',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/agents': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
