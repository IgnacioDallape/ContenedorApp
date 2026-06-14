import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    // Alias '@/...' → 'src/...' (disponible para código nuevo; ver jsconfig.json)
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Code-splitting de vendors pesados → chunks cacheables por separado.
        // Three y jspdf ya entran por los componentes lazy; esto los aísla para
        // que un cambio de app no invalide su cache.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('three')) return 'three';
          if (
            id.includes('jspdf') ||
            id.includes('html2canvas') ||
            id.includes('canvg') ||
            id.includes('dompurify') ||
            id.includes('rgbcolor')
          )
            return 'pdf';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('qrcode') || id.includes('pngjs') || id.includes('dijkstrajs'))
            return 'qrcode';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler'))
            return 'react-vendor';
          return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
    css: false,
    // Suite con motores de packing pesados (+ fuzz): bajo paralelismo algunos
    // tests rozan el default de 5s. 15s da margen sin enmascarar cuelgues reales.
    // (Los tests de fuzz igual fijan su propio timeout de 60s.)
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // El foco de coverage es la lógica pura (lib + stores), no la UI 3D.
      include: ['src/lib/**', 'src/stores/**'],
    },
  },
});
