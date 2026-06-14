import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { fileURLToPath } from 'node:url'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

function getPackageName(id: string) {
  const nodeModulesSegment = `${'/'}node_modules${'/'}`
  const lastNodeModulesIndex = id.lastIndexOf(nodeModulesSegment)

  if (lastNodeModulesIndex === -1) {
    return null
  }

  const packagePath = id.slice(lastNodeModulesIndex + nodeModulesSegment.length)
  const segments = packagePath.split('/')
  const [firstSegment, secondSegment] = segments

  if (!firstSegment) {
    return null
  }

  return firstSegment.startsWith('@') && secondSegment
    ? `${firstSegment}/${secondSegment}`
    : firstSegment
}

const packageChunkGroups = [
  {
    name: 'vendor-react',
    packages: ['react', 'react-dom', 'scheduler', 'use-sync-external-store'],
    priority: 100,
  },
  {
    name: 'vendor-tanstack',
    packages: ['@tanstack/'],
    priority: 90,
  },
  {
    name: 'vendor-clerk',
    packages: ['@clerk/'],
    priority: 80,
  },
  {
    name: 'vendor-convex',
    packages: ['convex', '@convex-dev/'],
    priority: 70,
  },
  {
    name: 'vendor-ui',
    packages: ['@radix-ui/', 'lucide-react', 'cmdk', 'sonner', 'next-themes'],
    priority: 60,
  },
] as const

// `tanstackStart` forwards router options to the underlying router plugin,
// but the exported Vite config type still rejects `autoCodeSplitting` on a
// fresh object literal in this release line. Keep the config in a named object
// so TypeScript accepts the supported runtime option.
const tanstackStartRouterOptions = {
  routesDirectory: 'routes',
  routeFileIgnorePattern: '(__tests__|\\.test\\.)',
  autoCodeSplitting: false,
}

function matchesPackageGroup(packageName: string, packages: readonly string[]) {
  return packages.some((value) =>
    value.endsWith('/') ? packageName.startsWith(value) : packageName === value,
  )
}

function manualChunks(id: string) {
  if (!id.includes('node_modules')) {
    return
  }

  const packageName = getPackageName(id)

  if (!packageName) {
    return
  }

  for (const group of packageChunkGroups) {
    if (matchesPackageGroup(packageName, group.packages)) {
      return group.name
    }
  }
}

const config = defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '#': fileURLToPath(new URL('./src', import.meta.url)),
    },
    tsconfigPaths: true,
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          output: {
            manualChunks,
          },
        },
      },
    },
    ssr: {
      build: {
        rollupOptions: {
          output: {
            manualChunks,
          },
        },
      },
    },
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      inspectorPort: false,
    }),
    tailwindcss(),
    tanstackStart({
      router: tanstackStartRouterOptions,
    }),
    viteReact(),
  ],
})

export default config
