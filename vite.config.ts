import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Build121's WebView 83 could not parse logical assignments in vendor chunks.
    // Apply Oxc syntax lowering to the FINAL production bundle, not only TS.
    target: 'chrome83',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
              priority: 20,
            },
            {
              name: 'ui-vendor',
              test: /node_modules[\\/](framer-motion|lucide-react)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
