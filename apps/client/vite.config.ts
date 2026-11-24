import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // host: true lets phones on the same Wi-Fi open the dev site.
  server: { host: true, port: 5173 },
});
