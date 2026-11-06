import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (id.includes('@radix-ui')) return 'radix'
          if (/recharts|d3-|victory/.test(id)) return 'charts'
          if (id.includes('lucide-react')) return 'icons'

          return 'vendor'
        },
      },
    },
  },
})
