import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.NODE_ENV === 'production' ? '/duckdb-wasm-parquet/' : '/',
  server: {
    port: 5173,
    host: true,
  },
  optimizeDeps: {
    include: ['uplot'],
  },
  build: {
    rollupOptions: {
      external: [],
    },
  },
})
