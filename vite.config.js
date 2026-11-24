import { defineConfig } from 'vite';

// GitHub Pages serves the site from /astra/; local dev stays at /.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/astra/' : '/',
  build: { chunkSizeWarningLimit: 1200 },
});
