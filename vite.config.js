import { defineConfig } from 'vite'

export default defineConfig({
  base: '/kanban/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        callback: 'auth/callback.html'
      }
    }
  }
})
