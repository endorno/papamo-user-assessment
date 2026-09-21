import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const STAGING_SUPABASE_URL = 'https://rqrtabsygnlhgjlevqah.supabase.co';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');

  if (mode === 'staging') {
    if (env.VITE_SUPABASE_URL !== STAGING_SUPABASE_URL) {
      throw new Error(
        `VITE_SUPABASE_URL はステージング用 Supabase (${STAGING_SUPABASE_URL}) を指定してください。`,
      );
    }
    if (!env.VITE_SUPABASE_ANON_KEY?.startsWith('sb_publishable_')) {
      throw new Error(
        'VITE_SUPABASE_ANON_KEY はステージング用の sb_publishable_ キーを指定してください。',
      );
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://127.0.0.1:8787',
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
    },
  };
});
