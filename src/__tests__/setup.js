// Setup global de Vitest (ver vite.config.js → test.setupFiles).
// Agrega los matchers de jest-dom y limpia el DOM entre tests de componentes.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
