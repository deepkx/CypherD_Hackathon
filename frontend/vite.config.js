// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,   // bind to 0.0.0.0 / ::
    port: 3000
  }
});