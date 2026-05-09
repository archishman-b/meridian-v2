import { defineConfig } from 'vite'
export default defineConfig({
  base: '/meridian-v2/',
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