import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    legacy({
      targets: [
        'last 2 Chrome versions',
        'last 1 Firefox version',
        'last 2 Edge major versions',
        'last 5 Safari major versions',
        'last 5 iOS major versions',
        'last 2 Android major versions',
        'Firefox ESR',
      ],
    }),
  ],
  build: {
    target: ['es2020', 'safari15'],
  },
  optimizeDeps: {
    exclude: ['@syvora/ui'],
  },
})
