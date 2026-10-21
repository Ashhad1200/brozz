import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      assets: path.resolve('src/assets/'),
      components: path.resolve('src/components/'),
      context: path.resolve('src/context/'),
      helpers: path.resolve('src/helpers/'),
      hooks: path.resolve('src/hooks/'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@/variables.scss";`,
      },
    },
  },
  server: {
    // Forward API calls and uploaded images to the Express server in /server.
    proxy: {
      '/api': process.env.VITE_API_PROXY || 'http://localhost:8000',
      '/uploads': process.env.VITE_API_PROXY || 'http://localhost:8000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
