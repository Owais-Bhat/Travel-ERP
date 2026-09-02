import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Honour PORT so tooling can hand us a free port.
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['framer-motion', '@headlessui/react', 'react-icons'],
          charts: ['recharts'],
          utils: ['date-fns', 'uuid', 'zustand', 'js-cookie'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
