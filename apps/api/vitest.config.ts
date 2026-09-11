import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        // テスト用 workerd が対応する最新日付に合わせる。
        compatibilityDate: '2026-08-08',
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations('./migrations'),
        },
      },
    })),
  ],
  test: {
    name: 'api',
    include: ['src/**/*.test.ts'],
  },
});
