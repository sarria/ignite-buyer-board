import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Default matches the server's default PORT. Override when 3001 is already
      // taken (the aiagent view's dev server claims it): VITE_API_PROXY=http://localhost:3011
      '/api': process.env.VITE_API_PROXY || 'http://localhost:3001',
    },
  },
})
