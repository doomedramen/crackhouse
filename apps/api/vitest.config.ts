import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test',
    },
    globalSetup: ['./__tests__/global-setup.ts'],
    include: ['**/__tests__/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/__tests__/helpers/**',
      '**/__tests__/setup.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.config.ts',
        'src/db/migrate.ts',
        'src/db/seed-*.ts',
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
        // Critical security files - higher thresholds
        'src/lib/virus-scanner.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        'src/lib/storage-manager.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        'src/middleware/security.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        'src/middleware/fileSecurity.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
    },
    setupFiles: ['./__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
