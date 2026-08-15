import { defineConfig } from 'vite';

export default defineConfig({
  // Vercel serves from the domain root, so the default base ('/') is correct
  // and lets the root-relative meta/manifest URLs resolve.
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    // three.js is ~130 kB gzipped in its own chunk on purpose; the default
    // 500 kB warning isn't telling us anything we didn't choose
    chunkSizeWarningLimit: 700,
    // three is the only real dependency; splitting it out lets the browser
    // cache the big chunk across deploys of the scene code
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
  server: { host: true },
});
