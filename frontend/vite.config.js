import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  // base absoluta: com caminhos relativos ('./', era do Electron), um F5 em rota
  // aninhada (ex: /flight/12) buscaria os assets em /flight/assets/... e quebraria.
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
