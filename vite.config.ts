import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

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
  resolve: { tsconfigPaths: true },
  environments: {
    client: {
      build: {
        rolldownOptions: {
          preserveEntrySignatures: 'allow-extension',
          output: {
            strictExecutionOrder: true,
            codeSplitting: {
              includeDependenciesRecursively: false,
              groups: packageChunkGroups.map((group) => ({
                name: group.name,
                priority: group.priority,
                test: (id: string) => {
                  const packageName = getPackageName(id)
                  return packageName
                    ? matchesPackageGroup(packageName, group.packages)
                    : false
                },
              })),
            },
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
