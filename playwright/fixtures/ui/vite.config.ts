import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../../public', import.meta.url)),
  resolve: {
    alias: { '@': fileURLToPath(new URL('../../../src', import.meta.url)) },
  },
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 3004, strictPort: true },
})
