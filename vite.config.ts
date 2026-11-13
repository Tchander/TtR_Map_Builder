import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'development-csp',
    transformIndexHtml(html, context) {
      // React Fast Refresh injects a module preamble only in development.
      return context.server ? html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';") : html;
    },
  }],
  base: './', server: { host: 'localhost' },
});
