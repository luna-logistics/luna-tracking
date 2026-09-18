import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit tests for the app's src (the pricing engine today). The engine is pure, so
// the default environment is Node. Component tests can opt into jsdom per-file with
// `// @vitest-environment jsdom` (@testing-library/react is installed).
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
