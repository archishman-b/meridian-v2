import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5173, open: true },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
    assetsInlineLimit: 100000,
  },
})
