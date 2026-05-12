import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/login': 'http://localhost:8080',
      '/api': 'http://localhost:8080',
      '/email': 'http://localhost:8080',
      '/admin': 'http://localhost:8080',
      '/logout': 'http://localhost:8080',
      '/solicitar-reset': 'http://localhost:8080',
    }
  }
})
