import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

function manualChunks(id: string) {
  if (!id.includes('node_modules')) {
    return
  }

  if (id.includes('/react/') || id.includes('/react-dom/')) {
    return 'vendor-react'
  }

  if (id.includes('/@tanstack/')) {
    return 'vendor-tanstack'
  }

  if (id.includes('/@clerk/')) {
    return 'vendor-clerk'
  }

  if (id.includes('/convex/') || id.includes('/@convex-dev/')) {
    return 'vendor-convex'
  }

  if (
    id.includes('/@radix-ui/') ||
    id.includes('/lucide-react/') ||
    id.includes('/cmdk/') ||
    id.includes('/sonner/') ||
    id.includes('/next-themes/')
  ) {
    return 'vendor-ui'
  }
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart({
      router: {
        autoCodeSplitting: true,
      },
    }),
    viteReact(),
  ],
})

export default config
