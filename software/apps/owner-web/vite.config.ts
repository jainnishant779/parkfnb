import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 5173 is the admin panel, 5174 the website.
export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
});
