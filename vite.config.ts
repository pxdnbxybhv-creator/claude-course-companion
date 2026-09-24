import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// `vite build`               → dist/          (GitHub Pages / any static host, PWA)
// `vite build --mode single` → dist-single/   (one self-contained index.html)
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [preact(), ...(single ? [viteSingleFile()] : [])],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      assetsInlineLimit: single ? 100_000_000 : 4096,
      rollupOptions: {
        input: { main: fileURLToPath(new URL('./index.html', import.meta.url)) },
      },
    },
    server: { host: '127.0.0.1' },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
