import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // .tsx/.ts раньше .js: иначе случайно скомпилированный .js рядом с исходником подменит его
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
  },
  base: '/',
})
